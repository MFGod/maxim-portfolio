/**
 * Где посетитель на пути и что ему сейчас видно.
 *
 * Правила вынесены сюда от `three` и от React по той же причине, что и
 * `book/input.ts`: их нельзя проверить ни типами, ни кадром — ошибка выглядит
 * как «подпись почему-то не появилась» или «луч ведёт не туда», а вариантов у
 * них десяток. Здесь только арифметика на данных `world-places.ts`.
 *
 * Прогресс мир считает сам, по входу камеры в регион главы, а не берёт у
 * нижней полосы. Полоса водит камеру шагами, но пешком до главы можно дойти и
 * мимо неё — и тогда прогресс, живущий в React, разошёлся бы с тем, что
 * посетитель уже видел своими глазами.
 */

import { experience, getProject } from '@/data/resume';
import {
  mainRoute,
  worldChapters,
  type WorldChapter,
  type WorldPoint,
} from '@/data/world-places';

/**
 * Радиус региона главы, в юнитах мира.
 *
 * Половина минимального разноса глав (`MIN_CHAPTER_SEPARATION` = 16): будь он
 * больше, регионы соседних глав перекрывались бы и метки проектов зажигались
 * бы парами — посетитель у одной главы видел бы подземелья другой.
 */
export const REGION_RADIUS = 8;

/**
 * Ширина растворения у границы региона.
 *
 * Без неё подписи проектов включаются щелчком на шаге камеры — а это ровно то
 * место, где посетитель на них смотрит.
 */
export const REGION_FADE = 3;

/** Расстояние по горизонтали. Высота не в счёт: регион — это место на карте. */
export function groundDistance(from: WorldPoint, to: WorldPoint): number {
  return Math.hypot(from[0] - to[0], from[2] - to[2]);
}

/**
 * Насколько метки региона проявлены на этом расстоянии: от 0 до 1.
 *
 * Полностью — внутри радиуса, ничего — дальше радиуса с растворением, между
 * ними линейно.
 */
export function regionShare(distance: number): number {
  if (distance <= REGION_RADIUS) return 1;
  if (distance >= REGION_RADIUS + REGION_FADE) return 0;

  return 1 - (distance - REGION_RADIUS) / REGION_FADE;
}

/** Глава, в чей регион попадает точка, или `null`. Ближайшая, если их две. */
export function chapterAt(at: WorldPoint): WorldChapter | null {
  let found: WorldChapter | null = null;
  let best = Infinity;

  for (const chapter of worldChapters) {
    const distance = groundDistance(at, chapter.grace);
    if (distance > REGION_RADIUS || distance >= best) continue;

    found = chapter;
    best = distance;
  }

  return found;
}

/**
 * Пройденная глава после этого кадра.
 *
 * Прогресс только растёт: вышел из региона — глава остаётся пройденной, иначе
 * шаг назад стирал бы путь. Ответвление прогресса не двигает — оно не лежит на
 * основном пути, — но и не сбрасывает его.
 */
export function advanceChapter(previous: string | null, at: WorldPoint): string | null {
  const here = chapterAt(at);
  if (!here || here.branch) return previous;

  const route = mainRoute();
  const reached = route.findIndex((chapter) => chapter.positionId === here.positionId);
  if (reached < 0) return previous;

  const before = route.findIndex((chapter) => chapter.positionId === previous);
  return reached > before ? here.positionId : previous;
}

/**
 * Следующая глава основного пути после пройденной.
 *
 * `null` в качестве пройденной — посетитель ещё нигде не был, и следующая
 * первая. `null` в ответе — пройден весь путь, вести больше некуда.
 */
export function nextChapter(previous: string | null): WorldChapter | null {
  const route = mainRoute();
  if (previous === null) return route[0] ?? null;

  const index = route.findIndex((chapter) => chapter.positionId === previous);
  return index < 0 ? (route[0] ?? null) : (route[index + 1] ?? null);
}

/**
 * Куда ведёт кнопка «на путь».
 *
 * Стоишь вне региона — она возвращает к следующей главе; стоишь внутри —
 * ведёт дальше, к той, что за ней. Иначе кнопка у самой благодати предлагала
 * бы лететь туда, где камера и так стоит.
 */
export function pathTarget(
  previous: string | null,
  at: WorldPoint,
): WorldChapter | null {
  const here = chapterAt(at);
  const next = nextChapter(previous);

  if (!here || !next || here.positionId !== next.positionId) return next;
  return nextChapter(next.positionId);
}

/** Подпись метки: что показать над точкой. */
export type MarkerLabel = {
  /** Кому принадлежит метка: глава по `Position.id`, проект по `Project.slug`. */
  id: string;
  text: string;
  at: WorldPoint;
  /** Проявленность от 0 до 1. Ноль — метки в кадре нет вовсе. */
  share: number;
};

export type MarkerPlan = {
  chapters: MarkerLabel[];
  projects: MarkerLabel[];
};

/**
 * Что подписано в мире с этой точки обзора.
 *
 * Главы подписаны всегда: это опоры пути, и они должны читаться с любой высоты
 * — иначе мир превращается в ландшафт без карьеры. Проекты проявляются при
 * подходе к своей главе: их двенадцать, и все разом они забили бы кадр
 * подписями плотнее, чем сам ландшафт.
 */
export function planMarkers(at: WorldPoint): MarkerPlan {
  const chapters: MarkerLabel[] = [];
  const projects: MarkerLabel[] = [];

  for (const chapter of worldChapters) {
    const company = experience.find(
      (position) => position.id === chapter.positionId,
    )?.company;

    // Глава без записи в резюме — рассинхрон данных, за ним следит
    // `world-places.test.ts`. Здесь такая глава просто остаётся без подписи.
    if (company) {
      chapters.push({
        id: chapter.positionId,
        text: company,
        at: chapter.grace,
        share: 1,
      });
    }

    const share = regionShare(groundDistance(at, chapter.grace));
    if (share === 0) continue;

    for (const place of chapter.projects) {
      const name = getProject(place.slug)?.name;
      if (!name) continue;

      projects.push({ id: place.slug, text: name, at: place.at, share });
    }
  }

  return { chapters, projects };
}
