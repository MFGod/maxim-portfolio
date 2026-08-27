import { describe, expect, it } from 'vitest';

import { browserItems, columnPanes, groupsOf } from '@/lib/files/browser-items';
import type { FileNode, FileTree } from '@/lib/files/types';

const now = new Date(2026, 7, 20, 12, 0).getTime();

const node = (
  id: string,
  parentId: string | null,
  kind: FileNode['kind'] = 'text',
): FileNode => ({
  id,
  name: id,
  kind,
  parentId,
  body: '',
  createdAt: now,
  updatedAt: now,
});

const tree = (...list: FileNode[]): FileTree =>
  Object.fromEntries(list.map((item) => [item.id, item]));

describe('browserItems', () => {
  it('в корне показывает ярлыки программ перед файлами', () => {
    const items = browserItems(null, tree(node('a.txt', null)));
    const kinds = items.map((item) => item.kind);

    expect(kinds[0]).toBe('app');
    expect(kinds.at(-1)).toBe('file');
    expect(items.at(-1)?.name).toBe('a.txt');
  });

  it('внутри папки ярлыков программ нет', () => {
    const items = browserItems(
      'folder',
      tree(node('folder', null, 'folder'), node('a.txt', 'folder')),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.key).toBe('a.txt');
  });

  it('исключает ярлык окна, в котором находимся', () => {
    const all = browserItems(null, {});
    const excluded = browserItems(null, {}, 'computer');

    expect(all.some((item) => item.key === 'app:computer')).toBe(true);
    expect(excluded.some((item) => item.key === 'app:computer')).toBe(false);
    expect(excluded).toHaveLength(all.length - 1);
  });
});

describe('groupsOf', () => {
  it('без группировки отдаёт одну группу в исходном порядке', () => {
    const items = browserItems('folder', tree(node('b.txt', 'folder')));
    const groups = groupsOf(items, 'none');

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.key)).toEqual(['b.txt']);
  });

  it('по типу разводит папки, документы и ярлыки по разным группам', () => {
    const items = browserItems(
      null,
      tree(node('folder', null, 'folder'), node('a.txt', null)),
    );
    const groups = groupsOf(items, 'kind');

    expect(groups.length).toBeGreaterThan(1);
    // Из групп можно собрать исходный список без потерь: по ним идут
    // Shift-диапазон и Ctrl+A.
    expect(groups.flatMap((group) => group.items)).toHaveLength(items.length);
  });
});

describe('columnPanes', () => {
  it('на корне отдаёт одну панель без раскрытой подпапки', () => {
    const panes = columnPanes(tree(node('a.txt', null)), []);

    expect(panes).toHaveLength(1);
    expect(panes[0]?.id).toBeNull();
    expect(panes[0]?.title).toBe('Рабочий стол');
    expect(panes[0]?.openedId).toBeNull();
  });

  it('в каждой панели отмечает подпапку, раскрытую следующей', () => {
    const nodes = tree(node('outer', null, 'folder'), node('inner', 'outer', 'folder'));
    const panes = columnPanes(nodes, [nodes['outer']!, nodes['inner']!]);

    expect(panes.map((pane) => pane.id)).toEqual([null, 'outer', 'inner']);
    expect(panes[0]?.openedId).toBe('outer');
    expect(panes[1]?.openedId).toBe('inner');
    expect(panes.at(-1)?.openedId).toBeNull();
  });
});
