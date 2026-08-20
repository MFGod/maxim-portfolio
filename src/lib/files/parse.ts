/**
 * Содержимое localStorage — внешние данные. Здесь оно превращается в дерево:
 * чужие поля отбрасываются, длины обрезаются, ссылки на несуществующих
 * родителей обнуляются, циклы разрываются.
 */

import { childrenOf } from './tree';
import {
  FILE_LIMITS,
  FILES_VERSION,
  type FileNode,
  type FileTree,
  type FileKind,
} from './types';

const KINDS: readonly FileKind[] = ['folder', 'text'];

function asKind(value: unknown): FileKind | null {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
    ? (value as FileKind)
    : null;
}

function asTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function asNode(value: unknown, now: number): FileNode | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  const kind = asKind(raw['kind']);
  const id = raw['id'];
  const name = raw['name'];
  if (!kind || typeof id !== 'string' || id === '' || typeof name !== 'string') {
    return null;
  }

  const trimmed = name.trim().slice(0, FILE_LIMITS.nameLength);
  if (trimmed === '') return null;

  const parentId = typeof raw['parentId'] === 'string' ? raw['parentId'] : null;
  const body =
    kind === 'text' && typeof raw['body'] === 'string'
      ? raw['body'].slice(0, FILE_LIMITS.bodyLength)
      : '';
  const createdAt = asTimestamp(raw['createdAt'], now);

  return {
    id,
    kind,
    name: trimmed,
    parentId,
    body,
    createdAt,
    updatedAt: asTimestamp(raw['updatedAt'], createdAt),
  };
}

/** Ссылка на несуществующего родителя и любой цикл поднимают узел на стол. */
function detachBrokenParents(tree: FileTree): void {
  for (const node of Object.values(tree)) {
    if (node.parentId === null) continue;

    const parent = tree[node.parentId];
    if (!parent || parent.kind !== 'folder') {
      node.parentId = null;
      continue;
    }

    const seen = new Set<string>([node.id]);
    let cursor: FileNode | undefined = parent;
    while (cursor) {
      if (seen.has(cursor.id)) {
        node.parentId = null;
        break;
      }
      seen.add(cursor.id);
      cursor = cursor.parentId ? tree[cursor.parentId] : undefined;
    }
  }
}

/** Всё, что глубже предела, поднимается на уровень, который в предел укладывается. */
function flattenTooDeep(tree: FileTree): void {
  for (const node of Object.values(tree)) {
    let depth = 0;
    let cursor: FileNode | undefined = node;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      depth += 1;
      cursor = cursor.parentId ? tree[cursor.parentId] : undefined;
    }
    if (depth > FILE_LIMITS.depth) node.parentId = null;
  }
}

export function parseStoredFiles(raw: string | null, now = Date.now()): FileTree {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null) return {};
  const envelope = parsed as Record<string, unknown>;
  if (envelope['version'] !== FILES_VERSION) return {};
  if (!Array.isArray(envelope['nodes'])) return {};

  const tree: FileTree = {};
  for (const value of envelope['nodes'].slice(0, FILE_LIMITS.nodes)) {
    const node = asNode(value, now);
    if (node && !tree[node.id]) tree[node.id] = node;
  }

  detachBrokenParents(tree);
  flattenTooDeep(tree);
  dedupeNames(tree);
  return tree;
}

/** Двух одинаковых имён в папке быть не должно: дальше их не различить. */
function dedupeNames(tree: FileTree): void {
  const parents = new Set<string | null>(
    Object.values(tree).map((node) => node.parentId),
  );

  for (const parentId of parents) {
    const taken = new Set<string>();
    for (const node of childrenOf(tree, parentId)) {
      const key = node.name.toLocaleLowerCase('ru');
      if (!taken.has(key)) {
        taken.add(key);
        continue;
      }
      const dot = node.name.lastIndexOf('.');
      const base = dot > 0 ? node.name.slice(0, dot) : node.name;
      const ext = dot > 0 ? node.name.slice(dot) : '';
      for (let index = 2; ; index += 1) {
        const candidate = `${base} (${index})${ext}`.slice(0, FILE_LIMITS.nameLength);
        if (!taken.has(candidate.toLocaleLowerCase('ru'))) {
          node.name = candidate;
          taken.add(candidate.toLocaleLowerCase('ru'));
          break;
        }
      }
    }
  }
}
