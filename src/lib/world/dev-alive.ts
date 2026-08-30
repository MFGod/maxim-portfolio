/** Обход живого: куда камера едет, когда её просят показать следующего. */

/** Сорт живого. От него зависит, какой из трёх `goTo*` повезёт камеру. */
export type AliveKind = 'patrol' | 'battle' | 'figure';

/** Одна остановка обхода. */
export type AliveStop = { kind: AliveKind; id: string };

/** Куда приехали и сколько всего остановок — для подписи в углу кадра. */
export type AliveVisit = { stop: AliveStop; index: number; total: number };

/** Как называть сорт живого человеку. */
export const ALIVE_LABELS: Record<AliveKind, string> = {
  patrol: 'дозор',
  battle: 'стычка',
  figure: 'фигура',
};

/** Список остановок: дозоры, стычки, одиночки. */
export function aliveStops(
  patrols: readonly { id: string }[],
  battles: readonly { id: string }[],
  figures: readonly { id: string }[],
): AliveStop[] {
  return [
    ...patrols.map((patrol): AliveStop => ({ kind: 'patrol', id: patrol.id })),
    ...battles.map((battle): AliveStop => ({ kind: 'battle', id: battle.id })),
    ...figures.map((figure): AliveStop => ({ kind: 'figure', id: figure.id })),
  ];
}

/**
 * Следующая остановка по кругу.
 * @param cursor где стоим сейчас; `-1` — ещё нигде
 * @returns номер остановки или `-1`, если обходить нечего
 */
export function stepAlive(count: number, cursor: number, step: number): number {
  if (count <= 0) return -1;
  return (((cursor + step) % count) + count) % count;
}
