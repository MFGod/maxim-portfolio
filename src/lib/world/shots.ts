/**
 * Ракурсы и оболочка камеры: как утверждённый вид превращается в разрешение
 * туда встать.
 */

import { worldBattles } from '@/data/world-battles';
import { mainRoute, worldChapters } from '@/data/world-places';
import {
  allShots,
  entryPath,
  peakRoute,
  zoneOf,
  type WorldShot,
  type ZoneShots,
} from '@/data/world-shots';

import { battleView } from './battle';
import type { ShellPocket } from './map-shell';

/**
 * Запас под ракурсом. Без него камера стоит ровно на потолке, и первое же
 * движение выталкивает её из вида, который только что открылся.
 */
export const POCKET_SLACK = 0.1;

/** Радиус полного послабления и радиус, где оно сходит на нет. */
export const POCKET_RADIUS = 1.5;
export const POCKET_FADE = 4;

export function pocketOf(shot: WorldShot): ShellPocket {
  return {
    x: shot.at[0],
    z: shot.at[2],
    floor: shot.at[1] - POCKET_SLACK,
    radius: POCKET_RADIUS,
    fade: POCKET_FADE,
  };
}

/** Карманы стычек: место, откуда на бой смотрят. */
export function battlePockets(): ShellPocket[] {
  return worldBattles.map((battle) => {
    const view = battleView(battle);
    return {
      x: view.at[0],
      z: view.at[2],
      floor: view.at[1] - POCKET_SLACK,
      radius: POCKET_RADIUS,
      fade: POCKET_FADE,
    };
  });
}

/** Карманы всех утверждённых ракурсов мира и всех стычек. */
export function worldPockets(): ShellPocket[] {
  return [...allShots().map(pocketOf), ...battlePockets()];
}

/** Остановка маршрута: глава и как к ней подходит камера. */
export type RouteStop = {
  positionId: string;
  /** Точки по порядку: подлёт, если он есть, и прибытие. */
  path: WorldShot[];
  /** Ответвление — своя ветка, а не продолжение основного пути. */
  branch: boolean;
};

/** Маршрут по главам в хронологии карьеры. */
export function routeStops(): RouteStop[] {
  const ordered = [...mainRoute(), ...worldChapters.filter((c) => c.branch)];

  return ordered.flatMap((chapter) => {
    const zone = zoneOf(chapter.positionId);
    if (!zone) return [];

    return [
      {
        positionId: chapter.positionId,
        path: pathOf(zone),
        branch: chapter.branch,
      },
    ];
  });
}

/** Точки зоны по порядку прохождения. */
export function pathOf(zone: ZoneShots): WorldShot[] {
  return zone.approach ? [zone.approach, zone.arrival] : [zone.arrival];
}

/**
 * Путь к непройденной вершине. Отдельно от маршрута: она не глава карьеры, а
 * цель впереди, и попадают туда по своей воле.
 */
export function peakPath(): WorldShot[] {
  return [...peakRoute.via, peakRoute.arrival];
}

/** Точка пути: сама камера и подпись к ней. */
export type FlightPoint = {
  label: string;
  shot: WorldShot;
};

/** Полный пролёт: вход, затем главы по хронологии. */
export function flightPath(): FlightPoint[] {
  const stops = routeStops();
  const first = stops[0];

  const entry: FlightPoint[] = entryPath.map((shot, index) => ({
    label: index === entryPath.length - 1 ? (first?.positionId ?? 'вход') : 'вход',
    shot,
  }));

  const rest = stops.slice(1).flatMap((stop) =>
    stop.path.map((shot) => ({
      label: stop.branch ? `${stop.positionId}, ветка` : stop.positionId,
      shot,
    })),
  );

  return [...entry, ...rest];
}

/** Ответвление к вершине: от взгляда на неё до самой вершины. */
export function peakFlight(): FlightPoint[] {
  return [peakRoute.from, ...peakPath()].map((shot) => ({
    label: 'вершина',
    shot,
  }));
}

/** Все ракурсы в порядке осмотра — остановки, по которым идут шагом. */
export function stations(): FlightPoint[] {
  const first = routeStops()[0];

  const entry: FlightPoint[] = entryPath.map((shot, index) => ({
    label: index >= entryPath.length - 2 && first ? first.positionId : 'вход',
    shot,
  }));

  const zones = routeStops().flatMap((stop, index) => {
    const zone = zoneOf(stop.positionId)!;
    const label = stop.branch ? `${stop.positionId}, ветка` : stop.positionId;

    const path = index === 0 ? [] : pathOf(zone);

    return [...path, ...zone.views].map((shot) => ({ label, shot }));
  });

  const peak = [
    peakRoute.from,
    ...peakRoute.via,
    peakRoute.arrival,
    ...peakRoute.views,
  ].map((shot) => ({ label: 'вершина', shot }));

  return [...entry, ...zones, ...peak];
}
