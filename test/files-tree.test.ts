import { describe, expect, it } from 'vitest';

import {
  canMove,
  childrenOf,
  createNode,
  isDescendant,
  pathOf,
  sanitizeName,
  splitName,
  subtreeOf,
  uniqueName,
} from '@/lib/files/tree';
import { FILE_LIMITS, type FileNode, type FileTree } from '@/lib/files/types';

const node = (
  id: string,
  kind: FileNode['kind'],
  name: string,
  parentId: string | null = null,
): FileNode => ({ id, kind, name, parentId, body: '', createdAt: 1, updatedAt: 1 });

/** Стол → «Работа» → «Архив» → заметка.txt, плюс файл на самом столе. */
const tree: FileTree = {
  work: node('work', 'folder', 'Работа'),
  archive: node('archive', 'folder', 'Архив', 'work'),
  note: node('note', 'text', 'заметка.txt', 'archive'),
  loose: node('loose', 'text', 'на столе.txt'),
};

describe('childrenOf', () => {
  it('папки идут перед файлами', () => {
    const mixed: FileTree = {
      a: node('a', 'text', 'а.txt'),
      b: node('b', 'folder', 'Яблоко'),
    };
    expect(childrenOf(mixed, null).map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('видит только свой уровень', () => {
    expect(childrenOf(tree, 'work').map((entry) => entry.id)).toEqual(['archive']);
  });
});

describe('pathOf', () => {
  it('строит путь от корня к узлу', () => {
    expect(pathOf(tree, 'note').map((entry) => entry.id)).toEqual([
      'work',
      'archive',
      'note',
    ]);
  });

  it('для неизвестного узла путь пуст', () => {
    expect(pathOf(tree, 'нет-такого')).toEqual([]);
  });
});

describe('isDescendant', () => {
  it('узел не потомок самому себе', () => {
    expect(isDescendant(tree, 'work', 'work')).toBe(false);
  });

  it('видит вложенность на любой глубине', () => {
    expect(isDescendant(tree, 'note', 'work')).toBe(true);
    expect(isDescendant(tree, 'work', 'note')).toBe(false);
  });
});

describe('canMove', () => {
  it('запрещает переносить папку внутрь себя и своего потомка', () => {
    expect(canMove(tree, 'work', 'work')).toBe(false);
    expect(canMove(tree, 'work', 'archive')).toBe(false);
  });

  it('запрещает класть узел в текстовый файл', () => {
    expect(canMove(tree, 'loose', 'note')).toBe(false);
  });

  it('перенос туда же переносом не считается', () => {
    expect(canMove(tree, 'archive', 'work')).toBe(false);
  });

  it('разрешает обычный перенос и подъём на стол', () => {
    expect(canMove(tree, 'loose', 'archive')).toBe(true);
    expect(canMove(tree, 'note', null)).toBe(true);
  });

  it('не пускает дерево глубже предела', () => {
    const deep: FileTree = {};
    let parent: string | null = null;
    for (let level = 1; level <= FILE_LIMITS.depth; level += 1) {
      const id = `level-${level}`;
      deep[id] = node(id, 'folder', `Уровень ${level}`, parent);
      parent = id;
    }
    deep['orphan'] = node('orphan', 'folder', 'Ещё одна');
    expect(canMove(deep, 'orphan', `level-${FILE_LIMITS.depth}`)).toBe(false);
    expect(canMove(deep, 'orphan', `level-${FILE_LIMITS.depth - 1}`)).toBe(true);
  });
});

describe('subtreeOf', () => {
  it('собирает ветку целиком', () => {
    expect(
      subtreeOf(tree, 'work')
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(['archive', 'note', 'work']);
  });
});

describe('uniqueName', () => {
  it('свободное имя оставляет как есть', () => {
    expect(uniqueName(tree, null, 'Новая папка')).toBe('Новая папка');
  });

  it('занятое имя получает номер', () => {
    expect(uniqueName(tree, null, 'Работа')).toBe('Работа (2)');
  });

  it('номер встаёт перед расширением', () => {
    expect(uniqueName(tree, null, 'на столе.txt')).toBe('на столе (2).txt');
  });

  it('переименование само в себя номера не добавляет', () => {
    expect(uniqueName(tree, null, 'Работа', 'work')).toBe('Работа');
  });

  it('регистр не создаёт второе такое же имя', () => {
    expect(uniqueName(tree, null, 'РАБОТА')).toBe('РАБОТА (2)');
  });
});

describe('sanitizeName', () => {
  it('убирает служебные символы и лишние пробелы', () => {
    expect(sanitizeName('  от/чёт:2026?  ')).toBe('отчёт2026');
  });

  it('обрезает по пределу длины', () => {
    expect(sanitizeName('я'.repeat(200))).toHaveLength(FILE_LIMITS.nameLength);
  });
});

describe('splitName', () => {
  it('отделяет расширение у файла', () => {
    expect(splitName('заметка.txt', 'text')).toEqual({ base: 'заметка', ext: '.txt' });
  });

  it('у папки расширения нет даже с точкой в имени', () => {
    expect(splitName('версия 1.2', 'folder')).toEqual({ base: 'версия 1.2', ext: '' });
  });
});

describe('createNode', () => {
  it('даёт свободное имя по умолчанию', () => {
    const created = createNode(tree, 'new', 'folder', null, 42);
    expect(created.name).toBe('Новая папка');
    expect(created.parentId).toBeNull();
    expect(created.createdAt).toBe(42);
  });
});
