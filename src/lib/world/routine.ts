/** Распорядок одиночки: чем она занята в этот миг. */

import type { FigureClip, FigureRole, WorldFigure } from '@/data/world-figures';

import type { Pose } from './battle';

/** Сколько длится основное занятие, секунды. */
export const MIN_HOLD = 24;
export const MAX_HOLD = 46;

/** Сколько длится отлучка, секунды. */
export const MIN_CHORE = 5;
export const MAX_CHORE = 9;

/** Чем занимается фигура в отлучке, по ролям. */
export const CHORES: Record<FigureRole, readonly FigureClip[]> = {
  /** Дозорный на башне: обводит взглядом округу и грозит вниз. */
  tower: ['Interact', 'Taunt'],
  /** Стража у входа: грозит подошедшему и закрывается щитом. */
  gate: ['Taunt', 'Blocking', 'Interact'],
  /** Замок: возятся с чем-то, поднимают, окликают друг друга. */
  castle: ['Interact', 'PickUp', 'Cheer'],
  /** Лагерь: копаются в поклаже, ликуют у огня, ложатся отдохнуть. */
  camp: ['PickUp', 'Interact', 'Cheer'],
};

/** Занятие, которое доступно только сидящему. */
export const REST_CLIP: FigureClip = 'Lie_Idle';

/** Основное занятие, рядом с которым отдых уместен. */
export const SITTING: FigureClip = 'Sit_Floor_Idle';

/**
 * Устойчивый псевдослучай по числу — тот же, что разводит прыжки горшков
 * (`pots.ts`). Разброс здесь важнее качества распределения: фигур сотня.
 */
function hash(value: number): number {
  const noise = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return noise - Math.floor(noise);
}

/** Число из имени фигуры. */
export function seedOf(id: string): number {
  let seed = 0;
  for (let index = 0; index < id.length; index++) {
    seed = (seed * 31 + id.charCodeAt(index)) % 1_000_003;
  }
  return seed;
}

/** Круг распорядка одной фигуры: сколько держит своё, сколько отлучается. */
export function routineCycle(id: string): {
  hold: number;
  chore: number;
  period: number;
  offset: number;
} {
  const seed = seedOf(id);
  const hold = MIN_HOLD + hash(seed) * (MAX_HOLD - MIN_HOLD);
  const chore = MIN_CHORE + hash(seed + 1) * (MAX_CHORE - MIN_CHORE);
  const period = hold + chore;
  return { hold, chore, period, offset: hash(seed + 2) * period };
}

/**
 * Набор отлучек фигуры: роль, плюс отдых тем, кто сидит, минус то, чем фигура
 * и так занята.
 */
export function choresOf(figure: WorldFigure): readonly FigureClip[] {
  const chores = CHORES[figure.role];
  const full = figure.clip === SITTING ? [...chores, REST_CLIP] : chores;
  return full.filter((chore) => chore !== figure.clip);
}

/** Чем занята фигура к моменту `time`. */
export function routinePose(figure: WorldFigure, time: number): Pose {
  const { hold, period, offset } = routineCycle(figure.id);
  const chores = choresOf(figure);

  const shifted = time + offset;
  const into = shifted - Math.floor(shifted / period) * period;
  if (into < hold) return { clip: figure.clip, loop: true };

  const round = Math.floor(shifted / period);
  return { clip: chores[round % chores.length]!, loop: true };
}
