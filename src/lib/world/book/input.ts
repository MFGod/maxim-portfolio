/** Что делает щелчок по книге. */

/** Во что попал луч указателя. */
export type PickTarget = 'left' | 'right' | 'spine';

/** Состояние книги на момент щелчка. */
export type PickState = {
  opened: boolean;
  /** Индекс текущего разворота. */
  spread: number;
  /** На какую мишень страницы пришёлся щелчок, если пришёлся. */
  hotspot: 'link' | 'close' | null;
};

/** Что книге делать. */
export type PickAction = 'open' | 'close' | 'forward' | 'back' | 'link';

/** Решает, что делает щелчок. */
export function pickAction(state: PickState, target: PickTarget): PickAction {
  if (!state.opened) return 'open';
  if (state.hotspot === 'link') return 'link';
  if (state.hotspot === 'close') return 'close';
  if (target === 'spine') return 'close';
  if (target === 'right') return 'forward';

  return state.spread === 0 ? 'close' : 'back';
}
