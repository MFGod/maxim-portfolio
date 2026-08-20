import { describe, expect, it } from 'vitest';

import {
  TILE_COUNT,
  createSequence,
  extend,
  gapDurationOf,
  lengthOfRound,
  litDurationOf,
  nextTile,
} from '@/lib/arcade/memory';

/** Предсказуемая «случайность»: последовательность вместо шума. */
function sequence(values: number[]): () => number {
  let cursor = 0;
  return () => {
    const value = values[cursor % values.length] ?? 0;
    cursor += 1;
    return value;
  };
}

describe('длина раунда', () => {
  it('начинается с трёх и растёт по одной', () => {
    expect(lengthOfRound(1)).toBe(3);
    expect(lengthOfRound(2)).toBe(4);
    expect(lengthOfRound(5)).toBe(7);
  });
});

describe('выбор плитки', () => {
  it('никогда не повторяет предыдущую', () => {
    for (let previous = 0; previous < TILE_COUNT; previous += 1) {
      for (let roll = 0; roll < 40; roll += 1) {
        const tile = nextTile(previous, () => roll / 40);
        expect(tile).not.toBe(previous);
        expect(tile).toBeGreaterThanOrEqual(0);
        expect(tile).toBeLessThan(TILE_COUNT);
      }
    }
  });

  it('на первой плитке берёт любую', () => {
    expect(nextTile(null, () => 0)).toBe(0);
    expect(nextTile(null, () => 0.999)).toBe(TILE_COUNT - 1);
  });
});

describe('последовательность', () => {
  it('нужной длины и без соседних повторов', () => {
    for (let round = 1; round <= 12; round += 1) {
      const result = createSequence(round, Math.random);
      expect(result).toHaveLength(lengthOfRound(round));
      for (let index = 1; index < result.length; index += 1) {
        expect(result[index]).not.toBe(result[index - 1]);
      }
    }
  });

  it('следующий раунд достраивает предыдущий, сохраняя начало', () => {
    const first = createSequence(1, sequence([0.1, 0.4, 0.7]));
    const second = extend(first, Math.random);
    expect(second.slice(0, first.length)).toEqual(first);
    expect(second).toHaveLength(first.length + 1);
    expect(second[second.length - 1]).not.toBe(first[first.length - 1]);
  });
});

describe('темп показа', () => {
  it('ускоряется с раундом', () => {
    expect(litDurationOf(1)).toBeGreaterThan(litDurationOf(5));
    expect(gapDurationOf(1)).toBeGreaterThan(gapDurationOf(5));
  });

  it('упирается в порог различимости', () => {
    expect(litDurationOf(1000)).toBe(litDurationOf(10_000));
    expect(gapDurationOf(1000)).toBe(gapDurationOf(10_000));
    expect(litDurationOf(1000)).toBeGreaterThanOrEqual(260);
  });
});
