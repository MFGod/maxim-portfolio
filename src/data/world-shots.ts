import { deepFreeze } from '@/lib/freeze';
import type { WorldPoint } from '@/data/world-places';

/** Ракурсы камеры: где она стоит и куда смотрит. */

export type WorldShot = {
  id: string;
  at: WorldPoint;
  look: WorldPoint;
};

export type ZoneShots = {
  /** `Position.id` из `experience.ts`, как в `world-places.ts`. */
  positionId: string;
  /**
   * Дальний план: отсюда камера заходит на главу. Может отсутствовать — тогда
   * риг ведёт камеру к прибытию напрямую, без дуги.
   */
  approach?: WorldShot;
  /** Ближний план: здесь камера останавливается. */
  arrival: WorldShot;
  /** Виды зоны, не лежащие на маршруте: облёт и возврат к главе. */
  views: WorldShot[];
};

/**
 * Зоны в порядке прохождения карьеры. Порядок глав задаёт `world-places.ts`,
 * здесь он лишь повторён расстановкой — маршрут строится по `order`, а не по
 * положению в этом массиве.
 */
export const zoneShots: ZoneShots[] = deepFreeze([
  {
    positionId: 'flexy',
    approach: {
      id: 'flexy-подлёт',
      at: [-10.56, 9.8, -32.29],
      look: [-28.81, 3.7, -26.85],
    },
    arrival: {
      id: 'flexy-прибытие',
      at: [-29.62, 2.81, -24.85],
      look: [-35.12, 6.19, -43.78],
    },
    views: [
      { id: 'flexy-запад', at: [-20.32, 7.16, -26.86], look: [-5.62, 5.01, -40.25] },
      { id: 'flexy-древо', at: [-22.89, 8.47, -18.61], look: [-28.59, -1.95, -2.51] },
      { id: 'flexy-север', at: [-25.21, 9.11, -38.42], look: [-5.8, 6.1, -34.67] },
      { id: 'flexy-даль', at: [-7.84, 8.48, -32.78], look: [-18.36, 4.56, -16.23] },
    ],
  },
  {
    /**
     * Подлёт стоит ровно на отрезке Flexy → Giftbox (61% пути, отклонение 2.9
     * юнита), поэтому перелёт между первой и второй главой идёт через него сам
     * собой, без отдельного списка промежуточных точек.
     */
    positionId: 'giftbox',
    approach: {
      id: 'giftbox-подлёт',
      at: [-29.09, 4.56, -13.04],
      look: [-28.45, 1.56, -32.8],
    },
    arrival: {
      id: 'giftbox-прибытие',
      at: [-34.73, 2.8, -8.55],
      look: [-26.53, 5.83, -26.54],
    },
    views: [],
  },
  {
    /**
     * Единственная точка региона: камера стоит в семи юнитах от благодати и
     * смотрит в сторону следующей главы. Прибытия вплотную не снималось, а
     * дописывать координаты «примерно там» нельзя — ракурс проседает куполом.
     */
    positionId: 'huntio',
    arrival: {
      id: 'huntio-прибытие',
      at: [-11.47, 3.15, 4.67],
      look: [6.27, -1.21, 12.81],
    },
    views: [],
  },
  {
    positionId: 'cleverbots',
    approach: {
      id: 'cleverbots-подлёт',
      at: [-6.93, 1.28, 20.62],
      look: [3.54, 3.22, 3.69],
    },
    arrival: {
      id: 'cleverbots-прибытие',
      at: [-2.88, 1.43, 7.35],
      look: [14.56, -3.87, 15.57],
    },
    views: [],
  },
  {
    positionId: 'personal',
    approach: {
      id: 'personal-подлёт',
      at: [17.93, 1.51, 13.15],
      look: [13.92, -2.67, -5.99],
    },
    arrival: {
      id: 'personal-прибытие',
      at: [13.56, 2.56, 3.74],
      look: [3.08, -4.8, 19.1],
    },
    views: [],
  },
]);

/** Непройденная вершина — «Node.js, изучаю». */
export const peakRoute: {
  from: WorldShot;
  via: WorldShot[];
  arrival: WorldShot;
  views: WorldShot[];
} = deepFreeze({
  from: { id: 'вершина-взгляд', at: [18.13, 2.04, -0.8], look: [17.37, 3.43, -20.73] },
  via: [{ id: 'вершина-склон', at: [16.59, 6.96, -15.25], look: [8.9, 1.35, 2.34] }],
  arrival: {
    id: 'вершина-прибытие',
    at: [24.36, 15.4, -37.41],
    look: [14.69, 6.01, -22.64],
  },
  views: [
    { id: 'вершина-центр', at: [-1.42, 10.57, -31.18], look: [-5.8, 4.13, -12.75] },
    { id: 'вершина-юг', at: [6.01, 9.66, -50.16], look: [12.17, 7.31, -31.28] },
    { id: 'вершина-берег', at: [19.06, 2.6, -60.75], look: [-0.89, 1.16, -60.47] },
    { id: 'вершина-восток', at: [40.14, 17.18, -20.73], look: [58.69, 12.27, -15.1] },
  ],
});

/** Вход: от благодати у Древа — вверх и на запад, к первой главе карьеры. */
export const entryPath: WorldShot[] = deepFreeze([
  { id: 'вход-благодать', at: [-9.39, 1.56, 13.43], look: [-9.1, 5.5, -6.9] },
  { id: 'вход-простор', at: [7.68, 13.72, -26.21], look: [-7.79, 7.89, -37.46] },
  zoneShots[0]!.approach!,
  zoneShots[0]!.arrival,
]);

/** Зона по идентификатору главы. */
export function zoneOf(positionId: string): ZoneShots | undefined {
  return zoneShots.find((zone) => zone.positionId === positionId);
}

/** Все ракурсы одним списком: от него считаются карманы оболочки. */
export function allShots(): WorldShot[] {
  const zones = zoneShots.flatMap((zone) => [
    ...(zone.approach ? [zone.approach] : []),
    zone.arrival,
    ...zone.views,
  ]);

  return [
    entryPath[0]!,
    entryPath[1]!,
    ...zones,
    peakRoute.from,
    ...peakRoute.via,
    peakRoute.arrival,
    ...peakRoute.views,
  ];
}
