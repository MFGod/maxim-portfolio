import type { GameId, RunReport } from './types';

/** Длительность забега в «Три в ряд». Один источник для таймера и проверки. */
export const MATCH3_DURATION_MS = 60_000;

const MATCH3_MAX_MATCHES = 400;
const MATCH3_MAX_SIZE = 8;
const MATCH3_MAX_CASCADE = 12;

const TOWER_MAX_BLOCKS = 500;
/**
 * Нижняя граница среднего времени на блок. Взята с запасом: блок появляется у
 * края, и если башня стоит рядом, опытный игрок ставит его почти сразу. Порог
 * отсекает невозможное, а не быструю игру.
 */
const TOWER_MIN_BLOCK_MS = 250;

const MEMORY_MAX_ROUNDS = 25;
/**
 * Нижняя граница среднего времени на раунд. Показ трёх плиток занимает около
 * двух секунд, но темп ускоряется с раундом — порог взят с запасом, чтобы не
 * отклонить быструю честную игру.
 */
const MEMORY_MIN_ROUND_MS = 900;

/** Допустимая длительность забега. Запас сверху — на сетевую задержку отправки. */
export const DURATION_BOUNDS: Record<GameId, { min: number; max: number }> = {
  'three-in-row': {
    min: MATCH3_DURATION_MS - 5_000,
    max: MATCH3_DURATION_MS + 60_000,
  },
  'tower-builder': { min: 1_000, max: 20 * 60_000 },
  memory: { min: 1_000, max: 20 * 60_000 },
};

/**
 * Цена одной линии. Длина сверх трёх стоит дороже, каждый следующий каскад
 * умножает: цепная реакция — то, ради чего в match-3 ищут ход.
 */
export function matchPoints(size: number, cascade: number): number {
  return (10 * size + 20 * Math.max(0, size - 3)) * (1 + cascade);
}

export function scoreOf(run: RunReport): number {
  switch (run.game) {
    case 'three-in-row':
      return run.matches.reduce(
        (sum, match) => sum + matchPoints(match.size, match.cascade),
        0,
      );
    case 'tower-builder':
      return run.blocks * 10 + run.perfect * 15;
    case 'memory':
      return (run.rounds * (run.rounds + 1) * 25) / 2;
    default: {
      const exhaustive: never = run;
      void exhaustive;
      return 0;
    }
  }
}

/**
 * Правдоподобен ли забег такой длительности. Не античит, а отсечение
 * очевидного мусора: полноценная проверка требовала бы повтора партии на
 * сервере, что для трёх маленьких игр несоразмерно.
 */
export function isPlausible(run: RunReport, elapsedMs: number): boolean {
  const bounds = DURATION_BOUNDS[run.game];
  if (elapsedMs < bounds.min || elapsedMs > bounds.max) return false;

  switch (run.game) {
    case 'three-in-row':
      return (
        run.matches.length <= MATCH3_MAX_MATCHES &&
        run.matches.every(
          (match) =>
            match.size >= 3 &&
            match.size <= MATCH3_MAX_SIZE &&
            match.cascade >= 0 &&
            match.cascade <= MATCH3_MAX_CASCADE,
        )
      );
    case 'tower-builder':
      return (
        run.blocks <= TOWER_MAX_BLOCKS &&
        run.perfect <= run.blocks &&
        run.blocks * TOWER_MIN_BLOCK_MS <= elapsedMs
      );
    case 'memory':
      return (
        run.rounds <= MEMORY_MAX_ROUNDS && run.rounds * MEMORY_MIN_ROUND_MS <= elapsedMs
      );
    default: {
      const exhaustive: never = run;
      void exhaustive;
      return false;
    }
  }
}
