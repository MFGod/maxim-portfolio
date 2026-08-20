/**
 * Позиции ярлыков живут вне React: их меняет указатель, сохраняет localStorage,
 * а компонент только подписан — setState внутри эффекта не нужен.
 */

import {
  ICON_STORAGE_KEY,
  parseStoredPositions,
  resolvePositions,
  type IconMetrics,
  type IconPosition,
  type IconPositions,
} from '@/lib/desktop-icons';
import { readStorage, writeJson } from '@/lib/storage';
import type { Workspace } from '@/lib/window-manager/types';

/** Стабильные пустые значения: `useSyncExternalStore` сравнивает по ссылке. */
const EMPTY: IconPositions = {};
const EMPTY_ORDER: string[] = [];

let positions: IconPositions = EMPTY;
const listeners = new Set<() => void>();

/**
 * Z-порядок ярлыков хранится отдельно от координат: меняется чаще и по другой
 * причине. Последний тронутый ярлык рисуется поверх остальных при наложении.
 */
let order: string[] = [];
const orderListeners = new Set<() => void>();

function commitOrder(next: string[]): void {
  order = next;
  for (const listener of orderListeners) listener();
}
/**
 * Ярлыки, которые двигали в этой сессии. `sync` переносит только их: остальные
 * позиции посчитаны против серверного вьюпорта и должны быть пересчитаны под
 * реальный размер, а не обрезаны в его границы.
 */
const moved = new Set<string>();

function samePositions(a: IconPositions, b: IconPositions): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key]?.x === b[key]?.x && a[key]?.y === b[key]?.y);
}

/**
 * Сохраняются только ярлыки, которые двигали руками. Остальные посчитаны под
 * текущий вьюпорт: попав в хранилище, они перестали бы пересчитываться и на
 * другом экране встали бы в чужие места.
 */
function persist(): void {
  const chosen: IconPositions = {};
  for (const id of moved) {
    const position = positions[id];
    if (position) chosen[id] = position;
  }
  writeJson(ICON_STORAGE_KEY, chosen);
}

function commit(next: IconPositions): void {
  if (samePositions(positions, next)) return;
  positions = next;
  for (const listener of listeners) listener();
}

export const desktopIconStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot: () => positions,

  /** На сервере позиций нет: раскладку по умолчанию считает компонент. */
  getServerSnapshot: () => EMPTY,

  subscribeOrder(listener: () => void) {
    orderListeners.add(listener);
    return () => {
      orderListeners.delete(listener);
    };
  },

  getOrderSnapshot: () => order,

  getServerOrderSnapshot: () => EMPTY_ORDER,

  /**
   * Подтянуть сохранённое и вписать всё в текущую рабочую область. Вызывается
   * и при смене размера значков: раскладка, посчитанная под прежний габарит,
   * иначе оставила бы крайнюю колонку за границей экрана.
   */
  sync(ids: string[], workspace: Workspace, metrics: IconMetrics) {
    const stored = parseStoredPositions(readStorage(ICON_STORAGE_KEY), ids);
    const carryOver: IconPositions = {};
    for (const id of ids) {
      if (moved.has(id) && positions[id]) carryOver[id] = positions[id];
    }
    commit(resolvePositions(ids, { ...stored, ...carryOver }, workspace, metrics));

    const nextOrder = order.filter((id) => ids.includes(id));
    for (const id of ids) {
      if (!nextOrder.includes(id)) nextOrder.push(id);
    }
    const changed =
      nextOrder.length !== order.length || nextOrder.some((id, i) => id !== order[i]);
    if (changed) commitOrder(nextOrder);
  },

  move(id: string, position: IconPosition) {
    moved.add(id);
    commit({ ...positions, [id]: position });
    persist();
  },

  /**
   * Переносит группу ярлыков за одну запись: перетаскивание выделения — это
   * одно действие, и подписчики должны увидеть его целиком, а не по одному
   * ярлыку.
   */
  moveMany(next: IconPositions) {
    const keys = Object.keys(next);
    if (keys.length === 0) return;
    for (const id of keys) moved.add(id);
    commit({ ...positions, ...next });
    persist();
  },

  /**
   * Возвращает раскладку по умолчанию: ярлыки снова выстраиваются колонкой.
   * Ручные позиции забываются — в этом и смысл пункта «Упорядочить».
   */
  reset(ids: string[], workspace: Workspace, metrics: IconMetrics) {
    moved.clear();
    commit(resolvePositions(ids, {}, workspace, metrics));
    persist();
  },

  /** Поднимает ярлык наверх стопки. Достаточно нажатия, перетаскивание не нужно. */
  bringToFront(id: string) {
    if (order[order.length - 1] === id) return;
    commitOrder([...order.filter((entry) => entry !== id), id]);
  },
};
