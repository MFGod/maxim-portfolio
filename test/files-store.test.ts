import { beforeEach, describe, expect, it } from 'vitest';

import { fileStore } from '@/lib/files/store';
import { childrenOf } from '@/lib/files/tree';
import { FILE_LIMITS, type FileNode } from '@/lib/files/types';

/** Хранилище — синглтон: каждый тест начинается с пустого дерева. */
beforeEach(() => {
  fileStore.clear();
});

const nodes = () => fileStore.getSnapshot().nodes;

const make = (kind: FileNode['kind'], parentId: string | null = null): FileNode => {
  const created = fileStore.create(kind, parentId);
  if (!created) throw new Error('узел не создан');
  return created;
};

describe('create', () => {
  it('не создаёт узел глубже предела: разбор хранилища его всё равно поднимет', () => {
    let parent: string | null = null;
    // Ровно предел: каждый уровень создаётся, последний лежит на глубине 8.
    for (let level = 0; level < FILE_LIMITS.depth; level += 1) {
      const created: FileNode | null = fileStore.create('folder', parent);
      expect(created).not.toBeNull();
      parent = created?.id ?? null;
    }

    expect(fileStore.create('folder', parent)).toBeNull();
    expect(fileStore.create('text', parent)).toBeNull();
    expect(Object.keys(nodes())).toHaveLength(FILE_LIMITS.depth);
  });
});

describe('removeMany', () => {
  it('удаляет группу вместе с содержимым папок', () => {
    const folder = make('folder');
    const inside = make('text', folder.id);
    const loose = make('text');
    const kept = make('text');

    fileStore.removeMany([folder.id, loose.id]);

    expect(nodes()[folder.id]).toBeUndefined();
    expect(nodes()[inside.id]).toBeUndefined();
    expect(nodes()[loose.id]).toBeUndefined();
    expect(nodes()[kept.id]).toBeDefined();
  });

  it('выбрасывает удалённое из буфера обмена', () => {
    const first = make('text');
    const second = make('text');
    fileStore.setClipboard({ ids: [first.id, second.id], mode: 'cut' });

    fileStore.removeMany([first.id]);
    expect(fileStore.getSnapshot().clipboard).toEqual({
      ids: [second.id],
      mode: 'cut',
    });

    fileStore.removeMany([second.id]);
    expect(fileStore.getSnapshot().clipboard).toBeNull();
  });
});

describe('moveMany', () => {
  it('переносит группу в папку и возвращает перенесённое', () => {
    const target = make('folder');
    const first = make('text');
    const second = make('text');

    const moved = fileStore.moveMany([first.id, second.id], target.id);

    expect(moved).toEqual([first.id, second.id]);
    expect(childrenOf(nodes(), target.id)).toHaveLength(2);
    expect(childrenOf(nodes(), null)).toHaveLength(1);
  });

  it('пропускает то, что перенести нельзя, и переносит остальное', () => {
    const target = make('folder');
    const file = make('text');

    // Папку внутрь самой себя не положить, а файл рядом с ней — можно.
    const moved = fileStore.moveMany([target.id, file.id], target.id);

    expect(moved).toEqual([file.id]);
    expect(nodes()[target.id]?.parentId).toBeNull();
    expect(nodes()[file.id]?.parentId).toBe(target.id);
  });

  it('разводит совпадающие имена в приёмнике', () => {
    const target = make('folder');
    const source = make('folder');
    const first = make('text', target.id);
    const second = make('text', source.id);

    fileStore.moveMany([second.id], target.id);

    expect(nodes()[second.id]?.name).not.toBe(nodes()[first.id]?.name);
    expect(childrenOf(nodes(), target.id)).toHaveLength(2);
  });
});

describe('буфер обмена', () => {
  it('вырезает группу и вставляет её в папку', () => {
    const target = make('folder');
    const first = make('text');
    const second = make('text');

    fileStore.setClipboard({ ids: [first.id, second.id], mode: 'cut' });
    expect(fileStore.canPaste(target.id)).toBe(true);
    expect(fileStore.paste(target.id)).toBe(true);

    expect(childrenOf(nodes(), target.id)).toHaveLength(2);
    // Вырезанное вставляется один раз: буфер пуст.
    expect(fileStore.getSnapshot().clipboard).toBeNull();
  });

  it('копирует группу целиком, вместе с содержимым папки', () => {
    const folder = make('folder');
    make('text', folder.id);
    const file = make('text');

    fileStore.setClipboard({ ids: [folder.id, file.id], mode: 'copy' });
    expect(fileStore.paste(null)).toBe(true);

    // Было: папка с файлом внутри и файл рядом. Стало: то же самое дважды.
    expect(childrenOf(nodes(), null)).toHaveLength(4);
    expect(Object.keys(nodes())).toHaveLength(6);
  });

  it('запрещает вставку, если хотя бы один объект вставить некуда', () => {
    const folder = make('folder');
    const inner = make('folder', folder.id);
    const file = make('text');

    fileStore.setClipboard({ ids: [folder.id, file.id], mode: 'copy' });

    // Папку нельзя скопировать внутрь собственного потомка — значит, нельзя
    // вставить и всю группу: половина буфера читалась бы как потеря файлов.
    expect(fileStore.canPaste(inner.id)).toBe(false);
    expect(fileStore.paste(inner.id)).toBe(false);
  });

  it('не вставляет копию, которая уйдёт глубже предела', () => {
    // Ветка высотой 5 и приёмник на глубине 4: вместе это 9 при пределе 8.
    let branch = make('folder');
    const top = branch;
    for (let level = 1; level < 5; level += 1) branch = make('folder', branch.id);

    let target = make('folder');
    for (let level = 1; level < 4; level += 1) target = make('folder', target.id);

    fileStore.setClipboard({ ids: [top.id], mode: 'copy' });

    expect(fileStore.canPaste(target.id)).toBe(false);
    expect(fileStore.paste(target.id)).toBe(false);
    // На стол та же ветка ложится: глубина укладывается в предел.
    expect(fileStore.canPaste(null)).toBe(true);
  });

  it('в буфер попадают только существующие узлы', () => {
    const file = make('text');
    fileStore.setClipboard({ ids: [file.id, 'нет-такого'], mode: 'copy' });

    expect(fileStore.getSnapshot().clipboard).toEqual({
      ids: [file.id],
      mode: 'copy',
    });
  });
});
