import { describe, expect, it } from 'vitest';

import { currentOf, pushEntry, type History } from '@/hooks/use-navigation-history';

/** Окно папки ходит по идентификаторам, где `null` — рабочий стол. */
type Place = string | null;

const start = (place: Place): History<Place> => ({ entries: [place], index: 0 });

describe('currentOf', () => {
  it('возвращает рабочий стол, а не запасное место', () => {
    const history: History<Place> = { entries: ['folder', null], index: 1 };
    expect(currentOf(history, 'folder')).toBeNull();
  });

  it('падает на запасное место, только если индекс вне списка', () => {
    expect(currentOf({ entries: [], index: 0 }, 'folder')).toBe('folder');
    expect(currentOf({ entries: ['a'], index: 4 }, 'folder')).toBe('folder');
  });
});

describe('pushEntry', () => {
  it('добавляет место и сдвигает позицию', () => {
    const history = pushEntry(start('folder'), null);
    expect(history).toEqual({ entries: ['folder', null], index: 1 });
  });

  it('не растит историю при переходе туда, где уже стоим', () => {
    const first = pushEntry(start('folder'), null);
    const second = pushEntry(first, null);
    expect(second).toBe(first);
  });

  it('отбрасывает всё, что было «вперёд»', () => {
    let history = pushEntry(start('folder'), null);
    history = pushEntry(history, 'nested');
    history = { ...history, index: 0 };
    history = pushEntry(history, 'other');

    expect(history).toEqual({ entries: ['folder', 'other'], index: 1 });
  });

  it('различает рабочий стол и папку с пустым именем', () => {
    const history = pushEntry(start(null), '');
    expect(history.entries).toEqual([null, '']);
  });
});

describe('своё сравнение мест', () => {
  type Place = { kind: 'files'; parentId: string | null } | { kind: 'programs' };

  const same = (a: Place, b: Place) =>
    a.kind === 'files' && b.kind === 'files'
      ? a.parentId === b.parentId
      : a.kind === b.kind;

  it('не растит историю на повторный переход в то же место', () => {
    const start: History<Place> = { entries: [{ kind: 'programs' }], index: 0 };
    expect(pushEntry(start, { kind: 'programs' }, same)).toBe(start);
  });

  it('без своего сравнения объекты считаются разными местами', () => {
    const start: History<Place> = { entries: [{ kind: 'programs' }], index: 0 };
    expect(pushEntry(start, { kind: 'programs' }).entries).toHaveLength(2);
  });
});
