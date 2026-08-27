'use client';

import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

import { rectBetween, type Rect } from '@/lib/selection';

/** Порог в пикселях: ниже него жест остаётся кликом по фону. */
const MARQUEE_THRESHOLD = 4;

/** Плитка, которую можно выделить. По этому же атрибуту её ищут в DOM. */
export const SELECT_KEY_ATTRIBUTE = 'data-select-key';

type Options = {
  /** Контейнер, внутри которого тянется рамка. Он же начало координат. */
  containerRef: RefObject<HTMLElement | null>;
  /**
   * Что попало в рамку. Вызывается на каждом кадре жеста и ещё раз на
   * `pointerup`: выделение должно набираться на глазах, а не в конце.
   * Результат обязан считаться от рамки, а не от предыдущего вызова.
   */
  onSelect: (rect: Rect, additive: boolean) => void;
  /** Жест отменён: `Esc` или потеря указателя. Выделение возвращается назад. */
  onCancel?: () => void;
};

/**
 * Клиентский прямоугольник в координатах содержимого контейнера. Прокрутка
 * учтена, поэтому замеры плиток и рамка сравниваются в одной системе.
 */
export function toContentRect(container: HTMLElement, client: DOMRect): Rect {
  const bounds = container.getBoundingClientRect();
  return {
    x: client.left - bounds.left + container.scrollLeft,
    y: client.top - bounds.top + container.scrollTop,
    width: client.width,
    height: client.height,
  };
}

/**
 * Плитки контейнера, замеренные в его системе координат. Замер делается на
 * старте жеста: внутри жеста сетка не меняется, а `getBoundingClientRect` на
 * каждом кадре стоил бы прокрутки по кадру.
 */
export function measureTiles(
  container: HTMLElement,
): Array<{ key: string; rect: Rect }> {
  const measured: Array<{ key: string; rect: Rect }> = [];
  for (const tile of container.querySelectorAll<HTMLElement>(
    `[${SELECT_KEY_ATTRIBUTE}]`,
  )) {
    const key = tile.getAttribute(SELECT_KEY_ATTRIBUTE);
    if (key)
      measured.push({
        key,
        rect: toContentRect(container, tile.getBoundingClientRect()),
      });
  }
  return measured;
}

/**
 * Рамка выделения. Жест начинается только с пустого фона и только мышью или
 * пером: на сенсорном экране он отобрал бы прокрутку. Во время жеста React не
 * перерисовывается — прямоугольник пишется прямо в узел внутри
 * `requestAnimationFrame`, наружу уходит один результат на `pointerup`.
 */
export function useMarquee<Box extends HTMLElement = HTMLDivElement>({
  containerRef,
  onSelect,
  onCancel,
}: Options) {
  const boxRef = useRef<Box | null>(null);
  const activeRef = useRef(false);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || activeRef.current) return;
    if (event.pointerType === 'touch') return;

    const container = containerRef.current;
    const box = boxRef.current;
    if (!container || !box) return;

    // Нажатие на плитке — это её выделение или перетаскивание, не рамка.
    const target = event.target;
    if (target instanceof Element && target.closest(`[${SELECT_KEY_ATTRIBUTE}]`)) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    const toContent = (clientX: number, clientY: number) => ({
      x: clientX - bounds.left + container.scrollLeft,
      y: clientY - bounds.top + container.scrollTop,
    });

    const origin = toContent(event.clientX, event.clientY);
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const { pointerId } = event;
    const handle = event.currentTarget;

    let started = false;
    let latest: Rect = { ...origin, width: 0, height: 0 };
    let frame = 0;

    activeRef.current = true;

    const paint = () => {
      frame = 0;
      box.style.transform = `translate3d(${latest.x}px, ${latest.y}px, 0)`;
      box.style.width = `${latest.width}px`;
      box.style.height = `${latest.height}px`;
      onSelect(latest, additive);
    };

    const handleMove = (moveEvent: PointerEvent) => {
      const point = toContent(moveEvent.clientX, moveEvent.clientY);

      if (!started) {
        const dx = Math.abs(point.x - origin.x);
        const dy = Math.abs(point.y - origin.y);
        if (dx <= MARQUEE_THRESHOLD && dy <= MARQUEE_THRESHOLD) return;
        started = true;
        box.setAttribute('data-active', '');
      }

      moveEvent.preventDefault();
      latest = rectBetween(origin, point);
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const finish = (commit: boolean) => {
      // Флаг снимается первым и без условий: осечка в уборке не должна
      // запретить следующий жест.
      activeRef.current = false;

      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      window.removeEventListener('keydown', handleKeyDown);
      try {
        if (handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
      } catch {
        // Указателя уже нет — освобождать нечего.
      }
      box.removeAttribute('data-active');

      if (!started) return;
      if (commit) onSelect(latest, additive);
      else onCancel?.();
    };

    const handleUp = () => finish(true);
    const handleCancel = () => finish(false);
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      finish(false);
    };

    // Захват указателя — оптимизация: он держит события на узле, если курсор
    // ушёл за его границы. Браузер вправе отказать, и тогда жест продолжается
    // по событиям окна — на них он и подписан.
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Работаем без захвата.
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('keydown', handleKeyDown);
  };

  return { boxRef, onPointerDown };
}
