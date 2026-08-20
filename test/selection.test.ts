import { describe, expect, it } from 'vitest';

import { extendTo, intersects, rectBetween, sameSet, toggle } from '@/lib/selection';

const order = ['a', 'b', 'c', 'd'];

describe('toggle', () => {
  it('добавляет объект, которого не было', () => {
    expect([...toggle(new Set(['a']), 'b')]).toEqual(['a', 'b']);
  });

  it('убирает объект, который уже выделен', () => {
    expect([...toggle(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });

  it('не меняет исходное множество', () => {
    const current = new Set(['a']);
    toggle(current, 'b');
    expect([...current]).toEqual(['a']);
  });
});

describe('extendTo', () => {
  it('берёт диапазон от якоря вперёд', () => {
    expect([...extendTo(order, 'b', 'd')]).toEqual(['b', 'c', 'd']);
  });

  it('берёт диапазон от якоря назад', () => {
    expect([...extendTo(order, 'd', 'b')]).toEqual(['b', 'c', 'd']);
  });

  it('без якоря выделяет один объект', () => {
    expect([...extendTo(order, null, 'c')]).toEqual(['c']);
  });

  it('якорь выпал из сетки — остаётся один объект', () => {
    expect([...extendTo(order, 'z', 'c')]).toEqual(['c']);
  });

  it('объекта нет в сетке — выделять нечего', () => {
    expect([...extendTo(order, 'a', 'z')]).toEqual([]);
  });
});

describe('intersects', () => {
  const base = { x: 10, y: 10, width: 20, height: 20 };

  it('видит пересечение углом', () => {
    expect(intersects(base, { x: 25, y: 25, width: 20, height: 20 })).toBe(true);
  });

  it('считает касание краями пересечением', () => {
    expect(intersects(base, { x: 30, y: 10, width: 5, height: 5 })).toBe(true);
  });

  it('видит вложенный прямоугольник', () => {
    expect(intersects(base, { x: 12, y: 12, width: 2, height: 2 })).toBe(true);
  });

  it('не видит пересечения у разнесённых прямоугольников', () => {
    expect(intersects(base, { x: 31, y: 10, width: 5, height: 5 })).toBe(false);
    expect(intersects(base, { x: 10, y: 31, width: 5, height: 5 })).toBe(false);
  });
});

describe('rectBetween', () => {
  it('строит прямоугольник, когда рамку тянут вправо вниз', () => {
    expect(rectBetween({ x: 5, y: 5 }, { x: 15, y: 25 })).toEqual({
      x: 5,
      y: 5,
      width: 10,
      height: 20,
    });
  });

  it('строит тот же прямоугольник, когда рамку тянут влево вверх', () => {
    expect(rectBetween({ x: 15, y: 25 }, { x: 5, y: 5 })).toEqual({
      x: 5,
      y: 5,
      width: 10,
      height: 20,
    });
  });
});

describe('sameSet', () => {
  it('видит одинаковые множества независимо от порядка', () => {
    expect(sameSet(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
  });

  it('видит разницу в составе при равном размере', () => {
    expect(sameSet(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(false);
  });

  it('видит разницу в размере', () => {
    expect(sameSet(new Set(['a']), new Set(['a', 'b']))).toBe(false);
  });
});
