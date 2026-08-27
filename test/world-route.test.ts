import { describe, expect, it } from 'vitest';

import { experience } from '@/data/resume';
import { mainRoute, worldChapters, type WorldPoint } from '@/data/world-places';
import {
  advanceChapter,
  chapterAt,
  groundDistance,
  nextChapter,
  pathTarget,
  planMarkers,
  regionShare,
  REGION_FADE,
  REGION_RADIUS,
} from '@/lib/world/route';

const route = mainRoute();
const first = route[0]!;
const second = route[1]!;
const branch = worldChapters.find((chapter) => chapter.branch)!;

/** Точка в стороне от всех глав: там ни один регион не включён. */
const NOWHERE: WorldPoint = [60, 5, 30];

/** Точка на расстоянии `distance` от главы по горизонтали. */
const near = (chapter: { grace: WorldPoint }, distance: number): WorldPoint => [
  chapter.grace[0] + distance,
  chapter.grace[1],
  chapter.grace[2],
];

describe('регион главы', () => {
  it('высота не влияет на расстояние', () => {
    // Регион — место на карте, а не шар: камера над благодатью в него входит.
    expect(groundDistance([0, 0, 0], [3, 40, 4])).toBe(5);
  });

  it('внутри радиуса метки проявлены целиком, за растворением — погашены', () => {
    expect(regionShare(0)).toBe(1);
    expect(regionShare(REGION_RADIUS)).toBe(1);
    expect(regionShare(REGION_RADIUS + REGION_FADE)).toBe(0);
    expect(regionShare(REGION_RADIUS + REGION_FADE + 10)).toBe(0);
  });

  it('на границе растворение идёт плавно', () => {
    const half = regionShare(REGION_RADIUS + REGION_FADE / 2);

    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
  });

  it('регионы соседних глав не перекрываются', () => {
    /*
     * Радиус — половина минимального разноса глав. Перекройся они, и метки
     * проектов зажигались бы парами: посетитель у одной главы видел бы
     * подземелья соседней.
     */
    for (const chapter of worldChapters) {
      for (const other of worldChapters) {
        if (other === chapter) continue;

        expect(
          groundDistance(chapter.grace, other.grace),
          `${chapter.positionId} ↔ ${other.positionId}`,
        ).toBeGreaterThan(REGION_RADIUS * 2);
      }
    }
  });

  it('под благодатью стоит своя глава', () => {
    expect(chapterAt(first.grace)?.positionId).toBe(first.positionId);
  });

  it('в стороне от всех глав региона нет', () => {
    expect(chapterAt(NOWHERE)).toBeNull();
  });
});

describe('прогресс по пути', () => {
  it('вход в регион главы засчитывает её', () => {
    expect(advanceChapter(null, first.grace)).toBe(first.positionId);
  });

  it('прогресс не откатывается выходом из региона', () => {
    // Иначе шаг назад стирал бы путь, и луч отправлял бы к уже пройденному.
    expect(advanceChapter(second.positionId, NOWHERE)).toBe(second.positionId);
    expect(advanceChapter(second.positionId, first.grace)).toBe(second.positionId);
  });

  it('ответвление прогресс не двигает и не сбрасывает', () => {
    expect(advanceChapter(first.positionId, branch.grace)).toBe(first.positionId);
    expect(advanceChapter(null, branch.grace)).toBeNull();
  });

  it('следующая глава идёт по основному пути', () => {
    expect(nextChapter(null)?.positionId).toBe(first.positionId);
    expect(nextChapter(first.positionId)?.positionId).toBe(second.positionId);
  });

  it('в конце пути вести некуда', () => {
    expect(nextChapter(route[route.length - 1]!.positionId)).toBeNull();
  });

  it('ответвления в основном пути нет', () => {
    expect(route.some((chapter) => chapter.branch)).toBe(false);
  });
});

describe('кнопка «на путь»', () => {
  it('издалека ведёт к следующей главе', () => {
    expect(pathTarget(null, NOWHERE)?.positionId).toBe(first.positionId);
  });

  it('у самой главы ведёт дальше, а не туда, где камера стоит', () => {
    expect(pathTarget(null, first.grace)?.positionId).toBe(second.positionId);
  });

  it('на пройденном месте ведёт вперёд, а не назад', () => {
    expect(pathTarget(second.positionId, first.grace)?.positionId).toBe(
      route[2]?.positionId,
    );
  });
});

describe('подписи в мире', () => {
  it('главы подписаны всегда и названы компанией из резюме', () => {
    const { chapters } = planMarkers(NOWHERE);

    expect(chapters).toHaveLength(worldChapters.length);
    for (const marker of chapters) {
      const company = experience.find((item) => item.id === marker.id)?.company;
      expect(marker.text).toBe(company);
      expect(marker.share).toBe(1);
    }
  });

  it('издалека проекты не подписаны', () => {
    expect(planMarkers(NOWHERE).projects).toHaveLength(0);
  });

  it('у главы подписаны её проекты и только они', () => {
    const { projects } = planMarkers(first.grace);

    expect(projects.map((marker) => marker.id).sort()).toEqual(
      first.projects.map((place) => place.slug).sort(),
    );
    for (const marker of projects) expect(marker.share).toBe(1);
  });

  it('на подходе проекты проявлены частично', () => {
    const { projects } = planMarkers(near(first, REGION_RADIUS + REGION_FADE / 2));

    expect(projects.length).toBeGreaterThan(0);
    for (const marker of projects) {
      expect(marker.share).toBeGreaterThan(0);
      expect(marker.share).toBeLessThan(1);
    }
  });

  it('проекты ответвления проявляются так же, как у прочих глав', () => {
    // Луч туда не ведёт, но дойти можно — и тогда метки обязаны загореться.
    const { projects } = planMarkers(branch.grace);

    expect(projects.map((marker) => marker.id)).toEqual(
      branch.projects.map((place) => place.slug),
    );
  });
});
