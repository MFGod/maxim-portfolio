import { describe, expect, it } from 'vitest';

import {
  BOARD_SIZE,
  CELL_COUNT,
  areNeighbours,
  clearCells,
  collapse,
  createBoard,
  findRuns,
  hasMove,
  indexOf,
  swapped,
  type Board,
} from '@/lib/arcade/match3';

/** Поле из строк по одной цифре на клетку. Точка — пустая клетка. */
function boardOf(rows: string[]): Board {
  const cells: Board = [];
  rows.forEach((row, rowIndex) => {
    [...row].forEach((symbol, column) => {
      cells[indexOf(rowIndex, column)] =
        symbol === '.'
          ? null
          : { id: indexOf(rowIndex, column) + 1, kind: Number(symbol) };
    });
  });
  return cells;
}

const EMPTY_ROW = '.'.repeat(BOARD_SIZE);
const fill = (rows: string[]): string[] => [
  ...rows,
  ...Array.from({ length: BOARD_SIZE - rows.length }, () => EMPTY_ROW),
];

/** Предсказуемая «случайность»: последовательность вместо шума. */
function sequence(values: number[]): () => number {
  let cursor = 0;
  return () => {
    const value = values[cursor % values.length] ?? 0;
    cursor += 1;
    return value;
  };
}

describe('соседство клеток', () => {
  it('считает соседями только сторону, не угол', () => {
    expect(areNeighbours(0, 1)).toBe(true);
    expect(areNeighbours(0, BOARD_SIZE)).toBe(true);
    expect(areNeighbours(0, BOARD_SIZE + 1)).toBe(false);
    expect(areNeighbours(0, 2)).toBe(false);
  });

  it('не склеивает края соседних строк', () => {
    expect(areNeighbours(BOARD_SIZE - 1, BOARD_SIZE)).toBe(false);
  });
});

describe('поиск линий', () => {
  it('находит горизонталь из трёх', () => {
    const runs = findRuns(boardOf(fill(['111.....'])));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual([0, 1, 2]);
  });

  it('не считает линией две одинаковые', () => {
    expect(findRuns(boardOf(fill(['11234567'])))).toHaveLength(0);
  });

  it('находит вертикаль', () => {
    const rows = ['1.......', '1.......', '1.......', '2.......'];
    const runs = findRuns(boardOf(fill(rows)));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual([0, BOARD_SIZE, BOARD_SIZE * 2]);
  });

  it('считает угол двумя линиями', () => {
    const runs = findRuns(boardOf(fill(['111.....', '1.......', '1.......'])));
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.length).sort()).toEqual([3, 3]);
  });

  it('не тянет линию через пустую клетку', () => {
    expect(findRuns(boardOf(fill(['11.1....'])))).toHaveLength(0);
  });
});

describe('обмен фишек', () => {
  it('меняет местами и не трогает исходное поле', () => {
    const board = boardOf(fill(['12......']));
    const next = swapped(board, 0, 1);
    expect(next[0]?.kind).toBe(2);
    expect(next[1]?.kind).toBe(1);
    expect(board[0]?.kind).toBe(1);
  });
});

describe('падение и добор', () => {
  it('не оставляет пустых клеток', () => {
    const board = clearCells(createBoard(Math.random, counter()), [0, 1, 2]);
    const next = collapse(board, sequence([0]), counter());
    expect(next.filter((cell) => cell === null)).toHaveLength(0);
    expect(next).toHaveLength(CELL_COUNT);
  });

  it('опускает уцелевшие фишки на дно колонки', () => {
    const board = boardOf(fill(['1.......']));
    const next = collapse(board, sequence([0]), counter());
    expect(next[indexOf(BOARD_SIZE - 1, 0)]?.kind).toBe(1);
  });
});

describe('стартовое поле', () => {
  it('собирается без готовых линий и с доступным ходом', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const board = createBoard(Math.random, counter());
      expect(findRuns(board)).toHaveLength(0);
      expect(hasMove(board)).toBe(true);
    }
  });
});

function counter(): () => number {
  let value = 0;
  return () => {
    value += 1;
    return value;
  };
}
