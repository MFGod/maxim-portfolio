/** Длительность кадра: сколько времени миру разрешено прожить за один проход. */

/** Потолок дельты, секунды. */
export const MAX_FRAME_SECONDS = 1 / 5;

/** Дельта кадра из показаний часов. */
export function frameDelta(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;

  return Math.min(raw, MAX_FRAME_SECONDS);
}
