import { describe, expect, it } from 'vitest';

import { parseStoredFiles } from '@/lib/files/parse';
import { childrenOf, pathOf } from '@/lib/files/tree';
import { FILE_LIMITS, FILES_VERSION, type FileNode } from '@/lib/files/types';

const node = (extra: Partial<FileNode> & Pick<FileNode, 'id' | 'kind' | 'name'>) => ({
  parentId: null,
  body: '',
  createdAt: 10,
  updatedAt: 10,
  ...extra,
});

const stored = (nodes: unknown[], version: unknown = FILES_VERSION) =>
  JSON.stringify({ version, nodes });

describe('parseStoredFiles', () => {
  it('пустое и битое хранилище даёт пустое дерево', () => {
    expect(parseStoredFiles(null)).toEqual({});
    expect(parseStoredFiles('не json')).toEqual({});
    expect(parseStoredFiles('[]')).toEqual({});
  });

  it('чужая версия схемы отбрасывается целиком', () => {
    const raw = stored([node({ id: 'a', kind: 'folder', name: 'Работа' })], 99);
    expect(parseStoredFiles(raw)).toEqual({});
  });

  it('читает валидные узлы', () => {
    const raw = stored([
      node({ id: 'a', kind: 'folder', name: 'Работа' }),
      node({ id: 'b', kind: 'text', name: 'файл.txt', parentId: 'a', body: 'текст' }),
    ]);
    const tree = parseStoredFiles(raw);
    expect(Object.keys(tree).sort()).toEqual(['a', 'b']);
    expect(tree['b']?.body).toBe('текст');
  });

  it('отбрасывает узлы без имени, идентификатора и с чужим типом', () => {
    const raw = stored([
      { id: '', kind: 'folder', name: 'Пусто' },
      { id: 'x', kind: 'folder', name: '   ' },
      { id: 'y', kind: 'ярлык', name: 'Чужой' },
      node({ id: 'ok', kind: 'folder', name: 'Работа' }),
    ]);
    expect(Object.keys(parseStoredFiles(raw))).toEqual(['ok']);
  });

  it('обрезает имя и содержимое по пределам', () => {
    const raw = stored([
      node({
        id: 'a',
        kind: 'text',
        name: 'и'.repeat(200),
        body: 'б'.repeat(FILE_LIMITS.bodyLength + 500),
      }),
    ]);
    const parsed = parseStoredFiles(raw)['a'];
    expect(parsed?.name).toHaveLength(FILE_LIMITS.nameLength);
    expect(parsed?.body).toHaveLength(FILE_LIMITS.bodyLength);
  });

  it('поднимает на стол узел с несуществующим родителем', () => {
    const raw = stored([
      node({ id: 'a', kind: 'text', name: 'файл.txt', parentId: 'нет' }),
    ]);
    expect(parseStoredFiles(raw)['a']?.parentId).toBeNull();
  });

  it('не даёт положить узел внутрь текстового файла', () => {
    const raw = stored([
      node({ id: 'file', kind: 'text', name: 'файл.txt' }),
      node({ id: 'inside', kind: 'text', name: 'внутри.txt', parentId: 'file' }),
    ]);
    expect(parseStoredFiles(raw)['inside']?.parentId).toBeNull();
  });

  it('разрывает цикл родителей', () => {
    const raw = stored([
      node({ id: 'a', kind: 'folder', name: 'А', parentId: 'b' }),
      node({ id: 'b', kind: 'folder', name: 'Б', parentId: 'a' }),
    ]);
    const tree = parseStoredFiles(raw);
    expect(pathOf(tree, 'a').length).toBeLessThanOrEqual(2);
    expect(pathOf(tree, 'b').length).toBeLessThanOrEqual(2);
    expect(Object.values(tree).some((entry) => entry.parentId === null)).toBe(true);
  });

  it('поднимает на стол всё, что глубже предела', () => {
    const nodes = [];
    let parent: string | null = null;
    for (let level = 1; level <= FILE_LIMITS.depth + 2; level += 1) {
      const id = `l${level}`;
      nodes.push(
        node({ id, kind: 'folder', name: `Уровень ${level}`, parentId: parent }),
      );
      parent = id;
    }
    const tree = parseStoredFiles(stored(nodes));
    for (const entry of Object.values(tree)) {
      expect(pathOf(tree, entry.id).length).toBeLessThanOrEqual(FILE_LIMITS.depth);
    }
  });

  it('разводит одинаковые имена в одной папке', () => {
    const raw = stored([
      node({ id: 'a', kind: 'text', name: 'файл.txt' }),
      node({ id: 'b', kind: 'text', name: 'файл.txt' }),
    ]);
    const names = childrenOf(parseStoredFiles(raw), null).map((entry) => entry.name);
    expect(new Set(names).size).toBe(2);
  });

  it('не читает больше предела по числу узлов', () => {
    const nodes = Array.from({ length: FILE_LIMITS.nodes + 50 }, (_, index) =>
      node({ id: `n${index}`, kind: 'text', name: `файл ${index}.txt` }),
    );
    expect(Object.keys(parseStoredFiles(stored(nodes)))).toHaveLength(
      FILE_LIMITS.nodes,
    );
  });
});
