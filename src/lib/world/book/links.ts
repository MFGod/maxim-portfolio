/**
 * Попадание указателя в ссылку на странице.
 *
 * Отдельным файлом и без `three` по той же причине, что и `input.ts`: правило
 * проверяется числами, а не глазами. Ошибка в переводе координат не роняет
 * ничего — ссылка просто не открывается, и найти такое в живой сцене, где лист
 * ещё и выгнут дугой, стоит дороже, чем написать тест.
 *
 * Луч отдаёт координаты текстуры, отрисовка оставляет прямоугольники в
 * пикселях холста. Здесь встречаются те и другие.
 */

import type { PageHotspot } from './draw';

/** Координаты текстуры в точке попадания: `u` слева направо, `v` снизу вверх. */
export type SurfacePoint = { u: number; v: number };

/** Размер холста страницы в пикселях. */
export type PageSize = { width: number; height: number };

/**
 * Ссылка под указателем или `null`.
 *
 * Ось `v` у текстуры смотрит вверх, ось `y` у холста — вниз: страница рисуется
 * сверху вниз, а луч отдаёт координату так, как её понимает геометрия. Без
 * переворота мишени оказываются зеркально по высоте — и ссылка внизу страницы
 * ловится наверху, где ничего нет.
 */
export function hotspotAt(
  hotspots: readonly PageHotspot[],
  point: SurfacePoint,
  size: PageSize,
): PageHotspot | null {
  const x = point.u * size.width;
  const y = (1 - point.v) * size.height;

  return (
    hotspots.find(
      (spot) =>
        x >= spot.x &&
        x <= spot.x + spot.width &&
        y >= spot.y &&
        y <= spot.y + spot.height,
    ) ?? null
  );
}

/**
 * Открывает ссылку страницы.
 *
 * `noopener` обязателен: без него открытая вкладка получает `window.opener` и
 * может увести исходную страницу на свой адрес. Адрес приходит из резюме и
 * ниоткуда больше — на странице нет ни одного поля, куда его можно подставить.
 */
export function openLink(href: string): void {
  if (typeof window === 'undefined') return;
  window.open(href, '_blank', 'noopener,noreferrer');
}
