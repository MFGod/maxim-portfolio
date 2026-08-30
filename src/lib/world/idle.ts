/** Что делает мир, когда его перестали трогать. */

/** Через сколько секунд покоя камера начинает поводить взглядом. */
export const DRIFT_AFTER = 20;

/** Через сколько секунд покоя мир уходит в облёт. */
export const REST_AFTER = 75;

/** За сколько секунд поворот набирает полную скорость. */
export const DRIFT_EASE = 4;

/** Полная скорость поворота, радиан в секунду. Примерно градус. */
export const DRIFT_SPEED = 0.018;

/** Что мир делает сейчас. */
export type IdlePhase = 'active' | 'drift' | 'rest';

export function idlePhase(idle: number): IdlePhase {
  if (idle >= REST_AFTER) return 'rest';
  if (idle >= DRIFT_AFTER) return 'drift';

  return 'active';
}

/** Насколько повернуть взгляд за этот кадр, в радианах. */
export function driftYaw(idle: number, delta: number): number {
  if (idle < DRIFT_AFTER || idle >= REST_AFTER) return 0;

  const share = Math.min((idle - DRIFT_AFTER) / DRIFT_EASE, 1);
  return DRIFT_SPEED * share * delta;
}
