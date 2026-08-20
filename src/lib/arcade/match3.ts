export const BOARD_SIZE = 8;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
/** Пять граней. Меньше — поле складывается само, больше — ходы не находятся. */
export const TILE_KINDS = 5;

/**
 * Фишка. Идентификатор переживает падение и нужен только представлению:
 * по нему узел остаётся тем же и анимация не переигрывается заново.
 */
export type Cell = { id: number; kind: number };

/** Поле по строкам сверху вниз. `null` — освободившаяся клетка. */
export type Board = (Cell | null)[];

export type Random = () => number;
export type IdSource = () => number;

export const rowOf = (index: number) => Math.floor(index / BOARD_SIZE);
export const columnOf = (index: number) => index % BOARD_SIZE;
export const indexOf = (row: number, column: number) => row * BOARD_SIZE + column;

export function areNeighbours(left: number, right: number): boolean {
  const rowDelta = Math.abs(rowOf(left) - rowOf(right));
  const columnDelta = Math.abs(columnOf(left) - columnOf(right));
  return rowDelta + columnDelta === 1;
}

export function swapped(board: Board, left: number, right: number): Board {
  const next = board.slice();
  next[left] = board[right] ?? null;
  next[right] = board[left] ?? null;
  return next;
}

function collectRun(run: number[], runs: number[][]): void {
  if (run.length >= 3) runs.push(run.slice());
}

/**
 * Сложившиеся линии — каждая отдельным списком клеток. Пересечения не
 * склеиваются: на счёт идёт длина каждой линии, а угол честно даёт две.
 */
export function findRuns(board: Board): number[][] {
  const runs: number[][] = [];

  const scan = (at: (step: number) => number, length: number) => {
    let run: number[] = [];
    let kind = -1;

    for (let step = 0; step < length; step += 1) {
      const index = at(step);
      const cell = board[index];

      if (cell && cell.kind === kind) {
        run.push(index);
        continue;
      }

      collectRun(run, runs);
      run = cell ? [index] : [];
      kind = cell ? cell.kind : -1;
    }

    collectRun(run, runs);
  };

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    scan((step) => indexOf(row, step), BOARD_SIZE);
  }
  for (let column = 0; column < BOARD_SIZE; column += 1) {
    scan((step) => indexOf(step, column), BOARD_SIZE);
  }

  return runs;
}

export function clearCells(board: Board, indices: Iterable<number>): Board {
  const next = board.slice();
  for (const index of indices) next[index] = null;
  return next;
}

/** Падение и добор сверху: пустых клеток после этого не остаётся. */
export function collapse(board: Board, random: Random, nextId: IdSource): Board {
  const next = board.slice();

  for (let column = 0; column < BOARD_SIZE; column += 1) {
    let write = BOARD_SIZE - 1;

    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const cell = next[indexOf(row, column)];
      if (!cell) continue;
      next[indexOf(write, column)] = cell;
      write -= 1;
    }

    for (let row = write; row >= 0; row -= 1) {
      next[indexOf(row, column)] = {
        id: nextId(),
        kind: Math.floor(random() * TILE_KINDS),
      };
    }
  }

  return next;
}

/** Есть ли ход: обмен с правым или нижним соседом, дающий линию. */
export function hasMove(board: Board): boolean {
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const right = index + 1;
    if (columnOf(right) !== 0 && findRuns(swapped(board, index, right)).length > 0) {
      return true;
    }

    const down = index + BOARD_SIZE;
    if (down < CELL_COUNT && findRuns(swapped(board, index, down)).length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Стартовое поле: без готовых линий и с гарантированным ходом. Иначе первая
 * секунда партии уходит либо на чужой каскад, либо на тупик.
 */
export function createBoard(random: Random, nextId: IdSource): Board {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const board: Board = new Array<Cell | null>(CELL_COUNT).fill(null);

    for (let index = 0; index < CELL_COUNT; index += 1) {
      const forbidden = new Set<number>();
      const row = rowOf(index);
      const column = columnOf(index);

      if (column >= 2) {
        const a = board[index - 1];
        const b = board[index - 2];
        if (a && b && a.kind === b.kind) forbidden.add(a.kind);
      }
      if (row >= 2) {
        const a = board[index - BOARD_SIZE];
        const b = board[index - BOARD_SIZE * 2];
        if (a && b && a.kind === b.kind) forbidden.add(a.kind);
      }

      const allowed: number[] = [];
      for (let kind = 0; kind < TILE_KINDS; kind += 1) {
        if (!forbidden.has(kind)) allowed.push(kind);
      }

      board[index] = {
        id: nextId(),
        kind: allowed[Math.floor(random() * allowed.length)] ?? 0,
      };
    }

    if (hasMove(board)) return board;
  }

  // Сорок попыток подряд без хода — на пяти гранях исход невозможный, но
  // возвращать половину поля нельзя: отдаём последнюю сборку целиком.
  return collapse(new Array<Cell | null>(CELL_COUNT).fill(null), random, nextId);
}
