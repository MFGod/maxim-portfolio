/** Темп пролистывания пачкой: сколько идёт каждый лист по дороге к закладке. */

import { FLIP_SECONDS, RIFFLE_MIN, RIFFLE_SECONDS, RIFFLE_SETTLE } from './metrics';

/** Длительности переворотов пачки, в секундах. */
export type RifflePlan = {
  /** Сколько идёт каждый лист, кроме последнего. */
  pace: number;
  /** Сколько идёт последний: на нём книга останавливается. */
  settle: number;
};

/**
 * Раскладывает дорогу в `count` переворотов по времени.
 * @param count сколько разворотов лежит между текущим и нужным
 */
export function rifflePlan(count: number): RifflePlan {
  if (count <= 1) return { pace: FLIP_SECONDS, settle: FLIP_SECONDS };

  const even = RIFFLE_SECONDS / count;
  const pace = Math.min(Math.max(even, RIFFLE_MIN), FLIP_SECONDS / 2);

  return { pace, settle: Math.min(pace * RIFFLE_SETTLE, FLIP_SECONDS) };
}
