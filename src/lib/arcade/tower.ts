/** Ширина поля в условных единицах. Совпадает с процентами по горизонтали. */
export const FIELD_WIDTH = 100;
/** Высота блока в процентах высоты сцены. Задаёт и шаг камеры. */
export const BLOCK_HEIGHT = 7;
/** Сколько рядов видно, прежде чем камера начинает уезжать вниз. */
export const VISIBLE_ROWS = 12;

const START_WIDTH = 42;
/** Промах в пределах допуска считается точным попаданием. */
const PERFECT_TOLERANCE = 1.2;

const BASE_SPEED = 34;
const SPEED_STEP = 1.6;
const MAX_SPEED = 78;

export type Block = { x: number; width: number };

/** Отрезанный свес: нужен только представлению, чтобы уронить обломок. */
export type Overhang = { x: number; width: number };

export type Placement =
  | { status: 'miss'; overhang: Overhang }
  | { status: 'placed'; block: Block; overhang: Overhang | null; perfect: boolean };

/**
 * На сколько сдвинуть башню вниз, в процентах высоты сцены. Пока рядов меньше
 * видимого окна, камера стоит; дальше уезжает ровно на один ряд за блок, и
 * вершина остаётся на месте.
 */
export function cameraShift(rowCount: number): number {
  return Math.max(0, rowCount - VISIBLE_ROWS) * BLOCK_HEIGHT;
}

export function startingBlock(): Block {
  return { x: (FIELD_WIDTH - START_WIDTH) / 2, width: START_WIDTH };
}

/** Скорость растёт с высотой башни и упирается в потолок. */
export function speedOf(placed: number): number {
  return Math.min(BASE_SPEED + placed * SPEED_STEP, MAX_SPEED);
}

/** Направление чередуется: следующий блок приходит с другой стороны. */
export function directionOf(placed: number): 1 | -1 {
  return placed % 2 === 0 ? 1 : -1;
}

export function spawnX(placed: number, width: number): number {
  return directionOf(placed) === 1 ? 0 : Math.max(0, FIELD_WIDTH - width);
}

/**
 * Сдвиг блока с отражением от краёв поля. Отражений может быть несколько:
 * на высокой скорости и просевшем кадре блок перескакивает поле целиком.
 */
export function advance(
  x: number,
  width: number,
  direction: 1 | -1,
  distance: number,
): { x: number; direction: 1 | -1 } {
  const span = FIELD_WIDTH - width;
  if (span <= 0) return { x: 0, direction };

  let next = x + direction * distance;
  let heading = direction;

  while (next < 0 || next > span) {
    if (next < 0) {
      next = -next;
      heading = 1;
    } else {
      next = 2 * span - next;
      heading = -1;
    }
  }

  return { x: next, direction: heading };
}

/**
 * Установка блока на вершину башни. Часть, вышедшая за предыдущий блок,
 * отрезается; полное расхождение заканчивает партию.
 */
export function place(previous: Block, moving: Block): Placement {
  const left = Math.max(previous.x, moving.x);
  const right = Math.min(previous.x + previous.width, moving.x + moving.width);
  const overlap = right - left;

  if (overlap <= 0) {
    return { status: 'miss', overhang: { x: moving.x, width: moving.width } };
  }

  const offset = moving.x - previous.x;

  if (Math.abs(offset) <= PERFECT_TOLERANCE) {
    return {
      status: 'placed',
      block: { x: previous.x, width: previous.width },
      overhang: null,
      perfect: true,
    };
  }

  const overhang: Overhang =
    offset > 0
      ? { x: right, width: moving.x + moving.width - right }
      : { x: moving.x, width: left - moving.x };

  return {
    status: 'placed',
    block: { x: left, width: overlap },
    overhang,
    perfect: false,
  };
}
