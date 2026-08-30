/** Где посетитель на пути и что ему сейчас видно. */

import { experience, getProject } from '@/data/resume';
import { worldChapters, type WorldChapter, type WorldPoint } from '@/data/world-places';

/** Радиус региона главы, в юнитах мира. */
export const REGION_RADIUS = 8;

/** Ширина растворения у границы региона. */
export const REGION_FADE = 3;

/** Расстояние по горизонтали. Высота не в счёт: регион — это место на карте. */
export function groundDistance(from: WorldPoint, to: WorldPoint): number {
  return Math.hypot(from[0] - to[0], from[2] - to[2]);
}

/** Насколько метки региона проявлены на этом расстоянии: от 0 до 1. */
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

/** Что подписано в мире с этой точки обзора. */
export function planMarkers(at: WorldPoint): MarkerPlan {
  const chapters: MarkerLabel[] = [];
  const projects: MarkerLabel[] = [];

  for (const chapter of worldChapters) {
    const company = experience.find(
      (position) => position.id === chapter.positionId,
    )?.company;

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
