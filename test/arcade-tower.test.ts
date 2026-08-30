import { describe, expect, it } from 'vitest';

import {
  BLOCK_HEIGHT,
  FIELD_WIDTH,
  VISIBLE_ROWS,
  cameraShift,
  advance,
  directionOf,
  place,
  speedOf,
  spawnX,
  startingBlock,
} from '@/lib/arcade/tower';

const base = { x: 30, width: 40 };

describe('установка блока', () => {
  it('срезает свес справа', () => {
    const result = place(base, { x: 36, width: 40 });
    expect(result).toEqual({
      status: 'placed',
      block: { x: 36, width: 34 },
      overhang: { x: 70, width: 6 },
      perfect: false,
    });
  });

  it('срезает свес слева', () => {
    const result = place(base, { x: 22, width: 40 });
    expect(result).toEqual({
      status: 'placed',
      block: { x: 30, width: 32 },
      overhang: { x: 22, width: 8 },
      perfect: false,
    });
  });

  it('точное попадание не срезает ничего и не сужает башню', () => {
    const result = place(base, { x: 30.5, width: 40 });
    expect(result).toEqual({
      status: 'placed',
      block: base,
      overhang: null,
      perfect: true,
    });
  });

  it('расхождение заканчивает партию', () => {
    expect(place(base, { x: 71, width: 40 }).status).toBe('miss');
    expect(place(base, { x: 0, width: 12 }).status).toBe('miss');
  });

  it('касание краями — тоже промах, а не блок нулевой ширины', () => {
    expect(place(base, { x: 70, width: 20 }).status).toBe('miss');
  });

  it('башня не растёт вширь от промаха', () => {
    const result = place(base, { x: 36, width: 40 });
    if (result.status !== 'placed') throw new Error('ожидалась установка');
    expect(result.block.width).toBeLessThan(base.width);
  });
});

describe('движение блока', () => {
  it('отражается от левого края', () => {
    expect(advance(5, 40, -1, 12)).toEqual({ x: 7, direction: 1 });
  });

  it('отражается от правого края', () => {
    const span = FIELD_WIDTH - 40;
    expect(advance(span - 5, 40, 1, 12)).toEqual({ x: span - 7, direction: -1 });
  });

  it('переживает просевший кадр с несколькими отражениями', () => {
    const span = FIELD_WIDTH - 40;
    const result = advance(10, 40, 1, 500);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThanOrEqual(span);
  });

  it('не двигает блок шире поля', () => {
    expect(advance(0, FIELD_WIDTH, 1, 30)).toEqual({ x: 0, direction: 1 });
  });
});

describe('сложность', () => {
  it('растёт с высотой и упирается в потолок', () => {
    expect(speedOf(0)).toBeLessThan(speedOf(10));
    expect(speedOf(1000)).toBe(speedOf(10000));
  });

  it('меняет сторону появления через блок', () => {
    expect(directionOf(0)).toBe(1);
    expect(directionOf(1)).toBe(-1);
    expect(spawnX(0, 40)).toBe(0);
    expect(spawnX(1, 40)).toBe(FIELD_WIDTH - 40);
  });
});

describe('основание', () => {
  it('стоит по центру поля', () => {
    const block = startingBlock();
    expect(block.x + block.width / 2).toBe(FIELD_WIDTH / 2);
  });
});

describe('камера', () => {
  it('стоит, пока башня помещается в окно', () => {
    expect(cameraShift(1)).toBe(0);
    expect(cameraShift(VISIBLE_ROWS)).toBe(0);
  });

  it('уезжает вниз ровно на ряд за блок', () => {
    expect(cameraShift(VISIBLE_ROWS + 1)).toBe(BLOCK_HEIGHT);
    expect(cameraShift(VISIBLE_ROWS + 5)).toBe(BLOCK_HEIGHT * 5);
  });

  it('держит вершину башни на месте', () => {
    const topOf = (rowCount: number) => rowCount * BLOCK_HEIGHT - cameraShift(rowCount);
    expect(topOf(VISIBLE_ROWS)).toBe(topOf(VISIBLE_ROWS + 7));
  });
});
