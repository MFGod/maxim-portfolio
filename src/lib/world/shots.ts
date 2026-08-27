/**
 * Ракурсы и оболочка камеры: как утверждённый вид превращается в разрешение
 * туда встать.
 *
 * Купол держит камеру в трети юнита над рельефом — этого хватает для прогулки,
 * но не для кадра у самой земли. Вместо списка исключений, который неизбежно
 * разойдётся с данными, каждое место из `world-shots.ts` объявляет себя
 * проходимым само: где кто-то поставил камеру и увидел кадр, туда пускают.
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

/**
 * Карманы стычек: место, откуда на бой смотрят.
 *
 * Без них к бою не подойти. Купол держит камеру примерно в трети юнита над
 * рельефом, а стычка — это фигуры ростом 0,117: с высоты купола шесть бойцов
 * занимают десяток пикселей, и «перенести камеру к стычке» означает показать
 * розовое пятно равнины. Карман опускает потолок ровно там, где стоит ракурс
 * боя, — тем же способом, каким объявляет себя проходимым любой утверждённый
 * кадр мира.
 */
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

/**
 * Маршрут по главам в хронологии карьеры.
 *
 * Порядок берётся из `world-places.ts`, а не из расстановки в `world-shots.ts`:
 * ракурсы — про кадр, хронология — про резюме, и смешивать их значит однажды
 * поменять порядок работ и не заметить, что камера пошла не туда. Ответвление
 * идёт последним и в основной путь не входит — так же, как на плоском плане.
 */
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

/**
 * Точка пути: сама камера, подпись и глава, к которой она относится.
 *
 * `positionId` держит связь с резюме: станция — не просто красивый вид, а
 * место главы карьеры, и подпись с содержимым берутся из `experience.ts` по
 * этому идентификатору. Без него мир остаётся картинкой.
 */
export type FlightPoint = {
  label: string;
  shot: WorldShot;
  /** `Position.id` из `experience.ts`; пусто у входа и вершины. */
  positionId?: string;
};

/**
 * Полный пролёт: вход, затем главы по хронологии.
 *
 * Вход уже заканчивается прибытием первой главы, поэтому её точки берутся из
 * него — иначе камера пришла бы к Flexy дважды.
 */
export function flightPath(): FlightPoint[] {
  const stops = routeStops();
  const first = stops[0];

  const entry: FlightPoint[] = entryPath.map((shot, index) => ({
    label: index === entryPath.length - 1 ? (first?.positionId ?? 'вход') : 'вход',
    shot,
  }));

  const rest = stops.slice(1).flatMap((stop) =>
    stop.path.map((shot) => ({
      label: stop.branch ? `${stop.positionId} · ветка` : stop.positionId,
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

/**
 * Все ракурсы в порядке осмотра — станции, по которым идут шагом.
 *
 * Пролёт показывает четыре точки из двадцати четырёх: он про то, чтобы попасть
 * в мир, а не обойти его. Остальное открывается шагами — так посетитель сам
 * решает, где задержаться, и это ровно то, чего не даёт ролик.
 *
 * Порядок: вход, затем главы по хронологии — подлёт, прибытие и виды зоны, —
 * следом ветка своих проектов и вершина.
 */
export function stations(): FlightPoint[] {
  const first = routeStops()[0];

  /*
   * Вход — такие же станции, как остальные: посетитель стоит у благодати под
   * Древом и дальше идёт сам. Автоматического пролёта нет — путь по карьере
   * проходят, а не смотрят.
   *
   * Последние две точки входа принадлежат первой главе: это её подлёт и
   * прибытие, поэтому и подписаны ею.
   */
  const entry: FlightPoint[] = entryPath.map((shot, index) => {
    const ofFirstChapter = index >= entryPath.length - 2;

    return {
      label: ofFirstChapter && first ? first.positionId : 'вход',
      shot,
      positionId: ofFirstChapter ? first?.positionId : undefined,
    };
  });

  const zones = routeStops().flatMap((stop, index) => {
    const zone = zoneOf(stop.positionId)!;
    const label = stop.branch ? `${stop.positionId} · ветка` : stop.positionId;

    // У первой главы подлёт и прибытие уже пришли со входом — берём только виды.
    const path = index === 0 ? [] : pathOf(zone);

    return [...path, ...zone.views].map((shot) => ({
      label,
      shot,
      positionId: stop.positionId,
    }));
  });

  const peak = [peakRoute.from, ...peakRoute.via, peakRoute.arrival, ...peakRoute.views].map(
    (shot) => ({ label: 'вершина', shot }),
  );

  return [...entry, ...zones, ...peak];
}
