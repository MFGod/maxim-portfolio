/** Попадание указателя в ссылку на странице. */

import type { PageHotspot } from './draw';

/** Координаты текстуры в точке попадания: `u` слева направо, `v` снизу вверх. */
export type SurfacePoint = { u: number; v: number };

/** Размер холста страницы в пикселях. */
export type PageSize = { width: number; height: number };

/** Ссылка под указателем или `null`. */
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

/** Открывает ссылку страницы. */
export function openLink(href: string): void {
  if (typeof window === 'undefined') return;
  window.open(href, '_blank', 'noopener,noreferrer');
}
