/**
 * Профиль бумаги в раскрытой книге: как высоко лежит страница на расстоянии
 * `fromSpine` от корешка.
 */

/**
 * @param fromSpine доля пути от корешка к внешнему краю, от 0 до 1
 * @param lift высота бумаги у внешнего края
 * @param dip насколько ниже она у самого корешка
 */
export function pageProfile(fromSpine: number, lift: number, dip: number): number {
  const clamped = Math.min(Math.max(fromSpine, 0), 1);
  return lift - dip * (1 - clamped) ** 2;
}
