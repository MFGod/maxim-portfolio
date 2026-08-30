/** Проекция мира на плоскость: вид сверху для плана карьеры. */

import { WORLD_BOUNDS, type WorldPoint } from '@/data/world-places';

/** Поля вокруг мира, в мировых юнитах: метка у самого края обрезается. */
const PADDING = 6;

const minX = WORLD_BOUNDS.minX - PADDING;
const minZ = WORLD_BOUNDS.minZ - PADDING;

export const PLAN_WIDTH = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX + PADDING * 2;
export const PLAN_HEIGHT = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ + PADDING * 2;

export const PLAN_VIEWBOX = `0 0 ${PLAN_WIDTH.toFixed(2)} ${PLAN_HEIGHT.toFixed(2)}`;

/**
 * Мировая точка в координаты плана. Ось Z ложится на Y экрана без разворота:
 * в мире Z растёт на юг, в SVG Y растёт вниз, север оказывается сверху сам.
 * Высота отбрасывается — это вид сверху.
 */
export function toPlan(point: WorldPoint): { x: number; y: number } {
  return { x: point[0] - minX, y: point[2] - minZ };
}

/** Точки для `points` у `<polyline>`. */
export function planPolyline(points: WorldPoint[]): string {
  return points
    .map((point) => {
      const flat = toPlan(point);
      return `${flat.x.toFixed(2)},${flat.y.toFixed(2)}`;
    })
    .join(' ');
}
