'use client';

/**
 * Файлы живут вне React: их меняют контекстное меню, редактор и перетаскивание,
 * а компоненты только подписаны. Тот же приём, что и у позиций ярлыков.
 */

import { useSyncExternalStore } from 'react';

import { readStorage, writeJson } from '@/lib/storage';

import { parseStoredFiles } from './parse';
import {
  canMove,
  childrenOf,
  createNode,
  depthOf,
  fitsDepth,
  isDescendant,
  sanitizeName,
  uniqueName,
} from './tree';
import {
  FILE_LIMITS,
  FILES_STORAGE_KEY,
  FILES_VERSION,
  type Clipboard,
  type FileKind,
  type FileNode,
  type FilesState,
  type FileTree,
} from './types';

const EMPTY: FilesState = { nodes: {}, clipboard: null };

let state: FilesState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function commit(next: FilesState): void {
  state = next;
  notify();
}

function persist(nodes: FileTree): void {
  writeJson(FILES_STORAGE_KEY, { version: FILES_VERSION, nodes: Object.values(nodes) });
}

/** Обновляет дерево и сразу сохраняет: файл, потерянный при перезагрузке, — брак. */
function commitNodes(nodes: FileTree, clipboard: Clipboard = state.clipboard): void {
  commit({ nodes, clipboard });
  persist(nodes);
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Достигнут ли предел по числу узлов. Дальше создание молча не сработало бы. */
function isFull(nodes: FileTree): boolean {
  return Object.keys(nodes).length >= FILE_LIMITS.nodes;
}

/** Буфер после правки дерева: удалённые узлы из него выпадают. */
function survivingClipboard(clipboard: Clipboard, nodes: FileTree): Clipboard {
  if (!clipboard) return null;
  const ids = clipboard.ids.filter((id) => nodes[id]);
  if (ids.length === clipboard.ids.length) return clipboard;
  return ids.length === 0 ? null : { ...clipboard, ids };
}

/** Рекурсивная копия ветки в другую папку. Имена в приёмнике не конфликтуют. */
function copyBranch(
  nodes: FileTree,
  id: string,
  targetParentId: string | null,
  now: number,
): FileTree {
  const source = nodes[id];
  if (!source) return nodes;

  const next: FileTree = { ...nodes };
  const queue: Array<{ sourceId: string; parentId: string | null; rename: boolean }> = [
    { sourceId: id, parentId: targetParentId, rename: true },
  ];

  while (queue.length > 0) {
    const task = queue.shift();
    if (!task) continue;
    const node = next[task.sourceId];
    if (!node || isFull(next)) continue;

    const copyId = newId();
    next[copyId] = {
      ...node,
      id: copyId,
      parentId: task.parentId,
      name: task.rename
        ? uniqueName(next, task.parentId, node.name)
        : uniqueName(next, task.parentId, node.name),
      createdAt: now,
      updatedAt: now,
    };

    for (const child of childrenOf(nodes, task.sourceId)) {
      queue.push({ sourceId: child.id, parentId: copyId, rename: false });
    }
  }

  return next;
}

export const fileStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot: () => state,

  /** На сервере файлов нет: до гидратации рабочий стол пуст. */
  getServerSnapshot: () => EMPTY,

  /** Читает хранилище один раз за загрузку страницы. */
  hydrate() {
    if (hydrated) return;
    hydrated = true;
    commit({
      nodes: parseStoredFiles(readStorage(FILES_STORAGE_KEY)),
      clipboard: null,
    });
  },

  /** Создаёт узел и возвращает его: вызывающий сразу переводит имя в правку. */
  create(kind: FileKind, parentId: string | null): FileNode | null {
    if (isFull(state.nodes)) return null;
    // Тот же предел глубины, что и у переноса. Без проверки папку можно было
    // создать глубже предела, а при следующей загрузке разбор поднял бы её на
    // рабочий стол — вложенность разваливалась бы сама собой.
    if (parentId !== null && depthOf(state.nodes, parentId) >= FILE_LIMITS.depth) {
      return null;
    }
    const node = createNode(state.nodes, newId(), kind, parentId, Date.now());
    commitNodes({ ...state.nodes, [node.id]: node });
    return node;
  },

  rename(id: string, raw: string) {
    const node = state.nodes[id];
    if (!node) return;
    const cleaned = sanitizeName(raw);
    if (cleaned === '' || cleaned === node.name) return;

    const name = uniqueName(state.nodes, node.parentId, cleaned, id);
    commitNodes({
      ...state.nodes,
      [id]: { ...node, name, updatedAt: Date.now() },
    });
  },

  write(id: string, body: string) {
    const node = state.nodes[id];
    if (!node || node.kind !== 'text') return;
    const capped = body.slice(0, FILE_LIMITS.bodyLength);
    if (capped === node.body) return;
    commitNodes({
      ...state.nodes,
      [id]: { ...node, body: capped, updatedAt: Date.now() },
    });
  },

  /** Удаляет узлы вместе со всем, что внутри. */
  removeMany(ids: string[]) {
    const present = ids.filter((id) => state.nodes[id]);
    if (present.length === 0) return;

    const nodes = { ...state.nodes };
    const queue = [...present];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;
      for (const child of childrenOf(nodes, currentId)) queue.push(child.id);
      delete nodes[currentId];
    }

    commitNodes(nodes, survivingClipboard(state.clipboard, nodes));
  },

  /**
   * Переносит группу в папку. Возвращает то, что действительно переехало:
   * часть выделения может остаться на месте — например, папка, внутрь которой
   * её же и тянут. Проверки идут по накопленному дереву, поэтому предел
   * глубины считается с учётом уже перенесённых узлов.
   */
  moveMany(ids: string[], targetParentId: string | null): string[] {
    let nodes = state.nodes;
    const now = Date.now();
    const movedIds: string[] = [];

    for (const id of ids) {
      const node = nodes[id];
      if (!node || !canMove(nodes, id, targetParentId)) continue;
      nodes = {
        ...nodes,
        [id]: {
          ...node,
          parentId: targetParentId,
          name: uniqueName(nodes, targetParentId, node.name, id),
          updatedAt: now,
        },
      };
      movedIds.push(id);
    }

    if (movedIds.length === 0) return movedIds;
    commitNodes(nodes);
    return movedIds;
  },

  setClipboard(clipboard: Clipboard) {
    if (!clipboard) {
      commit({ ...state, clipboard: null });
      return;
    }
    const ids = clipboard.ids.filter((id) => state.nodes[id]);
    if (ids.length === 0) return;
    commit({ ...state, clipboard: { ...clipboard, ids } });
  },

  /**
   * Можно ли вставить содержимое буфера в эту папку. Вырезанное подчиняется тем
   * же правилам, что и перенос; копию нельзя положить внутрь самой ветки.
   * Требуется вся группа целиком: вставка, которая молча пропустила половину
   * буфера, читается как потеря файлов.
   */
  canPaste(targetParentId: string | null): boolean {
    const clipboard = state.clipboard;
    if (!clipboard) return false;
    const ids = clipboard.ids.filter((id) => state.nodes[id]);
    if (ids.length === 0) return false;

    if (clipboard.mode === 'cut') {
      return ids.every((id) => canMove(state.nodes, id, targetParentId));
    }

    if (isFull(state.nodes)) return false;
    if (targetParentId === null) return true;

    const target = state.nodes[targetParentId];
    if (!target || target.kind !== 'folder') return false;
    return ids.every(
      (id) =>
        targetParentId !== id &&
        !isDescendant(state.nodes, targetParentId, id) &&
        fitsDepth(state.nodes, id, targetParentId),
    );
  },

  paste(targetParentId: string | null): boolean {
    const clipboard = state.clipboard;
    if (!clipboard || !fileStore.canPaste(targetParentId)) return false;

    if (clipboard.mode === 'cut') {
      const movedIds = fileStore.moveMany(clipboard.ids, targetParentId);
      if (movedIds.length === 0) return false;
      commit({ ...state, clipboard: null });
      return true;
    }

    let nodes = state.nodes;
    const now = Date.now();
    for (const id of clipboard.ids) {
      if (isFull(nodes)) break;
      nodes = copyBranch(nodes, id, targetParentId, now);
    }
    commitNodes(nodes);
    return true;
  },

  /** Полная очистка. Вызывается из настроек. */
  clear() {
    commitNodes({}, null);
  },
};

export function useFiles(): FilesState {
  return useSyncExternalStore(
    fileStore.subscribe,
    fileStore.getSnapshot,
    fileStore.getServerSnapshot,
  );
}
