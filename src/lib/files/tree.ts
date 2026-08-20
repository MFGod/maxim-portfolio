/**
 * Операции над деревом файлов. Всё здесь — чистые функции: хранилище только
 * применяет их результат, а тесты обходятся без DOM и localStorage.
 */

import {
  FILE_LIMITS,
  TEXT_EXTENSION,
  type FileKind,
  type FileNode,
  type FileTree,
} from './types';

/** Узлы одного уровня: сначала папки, дальше по имени. Как в проводнике. */
export function childrenOf(tree: FileTree, parentId: string | null): FileNode[] {
  return Object.values(tree)
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ru');
    });
}

/** Путь от корня к узлу включительно. Пустой массив — узла нет. */
export function pathOf(tree: FileTree, id: string): FileNode[] {
  const path: FileNode[] = [];
  const seen = new Set<string>();
  let current = tree[id];

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? tree[current.parentId] : undefined;
  }

  return path;
}

/** Глубина вложенности: узел на рабочем столе — единица. */
export function depthOf(tree: FileTree, id: string): number {
  return pathOf(tree, id).length;
}

/** Лежит ли `id` внутри `ancestorId` на любой глубине. */
export function isDescendant(tree: FileTree, id: string, ancestorId: string): boolean {
  if (id === ancestorId) return false;
  return pathOf(tree, id).some((node) => node.id === ancestorId);
}

/** Все узлы внутри папки, на любой глубине. Нужно для удаления и подсчёта. */
export function subtreeOf(tree: FileTree, id: string): FileNode[] {
  const collected: FileNode[] = [];
  const queue = [id];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;
    const node = tree[currentId];
    if (!node) continue;
    collected.push(node);
    for (const child of childrenOf(tree, currentId)) queue.push(child.id);
  }

  return collected;
}

/** Высота поддерева: у одинокого файла — единица. */
function heightOf(tree: FileTree, id: string): number {
  const children = childrenOf(tree, id);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map((child) => heightOf(tree, child.id)));
}

/**
 * Помещается ли ветка в приёмник по глубине. Одно правило на перенос и на
 * копию: без него скопированная ветка могла уйти глубже предела, а разбор
 * хранилища поднял бы её хвост на рабочий стол.
 */
export function fitsDepth(
  tree: FileTree,
  id: string,
  targetParentId: string | null,
): boolean {
  const depth = targetParentId === null ? 0 : depthOf(tree, targetParentId);
  return depth + heightOf(tree, id) <= FILE_LIMITS.depth;
}

/**
 * Можно ли перенести узел в папку. Запрещено класть узел в самого себя, в
 * собственного потомка и в текстовый файл; повторный перенос в ту же папку —
 * не перенос. Глубина итогового дерева не должна выйти за предел.
 */
export function canMove(
  tree: FileTree,
  id: string,
  targetParentId: string | null,
): boolean {
  const node = tree[id];
  if (!node) return false;
  if (node.parentId === targetParentId) return false;

  if (targetParentId !== null) {
    const target = tree[targetParentId];
    if (!target || target.kind !== 'folder') return false;
    if (targetParentId === id) return false;
    if (isDescendant(tree, targetParentId, id)) return false;
  }

  return fitsDepth(tree, id, targetParentId);
}

/** Имя без расширения и расширение. У папок расширения нет никогда. */
export function splitName(name: string, kind: FileKind): { base: string; ext: string } {
  if (kind === 'folder') return { base: name, ext: '' };
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

/** Обрезает и подчищает имя, введённое человеком. Пустое — значит не менять. */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .slice(0, FILE_LIMITS.nameLength);
}

/**
 * Свободное имя в папке: «Новая папка», дальше «Новая папка (2)». Суффикс
 * встаёт перед расширением, иначе «Документ.txt (2)» перестал бы быть текстовым.
 */
export function uniqueName(
  tree: FileTree,
  parentId: string | null,
  desired: string,
  exceptId?: string,
): string {
  const taken = new Set(
    childrenOf(tree, parentId)
      .filter((node) => node.id !== exceptId)
      .map((node) => node.name.toLocaleLowerCase('ru')),
  );

  if (!taken.has(desired.toLocaleLowerCase('ru'))) return desired;

  const dot = desired.lastIndexOf('.');
  const base = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : '';

  for (let index = 2; index < FILE_LIMITS.nodes + 2; index += 1) {
    const candidate = `${base} (${index})${ext}`;
    if (!taken.has(candidate.toLocaleLowerCase('ru'))) return candidate;
  }

  return `${base} (${Date.now()})${ext}`;
}

/** Имя по умолчанию для нового узла. */
export function defaultNameFor(kind: FileKind): string {
  return kind === 'folder' ? 'Новая папка' : `Документ${TEXT_EXTENSION}`;
}

/** Новый узел с уже свободным именем. Идентификатор приходит снаружи. */
export function createNode(
  tree: FileTree,
  id: string,
  kind: FileKind,
  parentId: string | null,
  now: number,
): FileNode {
  return {
    id,
    kind,
    name: uniqueName(tree, parentId, defaultNameFor(kind)),
    parentId,
    body: '',
    createdAt: now,
    updatedAt: now,
  };
}
