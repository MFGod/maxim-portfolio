import { describe, expect, it } from 'vitest';

import { experience, projects } from '@/data/resume';
import {
  MIN_CHAPTER_SEPARATION,
  SEA_LEVEL,
  WORLD_BOUNDS,
  mainRoute,
  worldChapters,
  worldPeak,
  type WorldPoint,
} from '@/data/world-places';

/** Расстояние в плане: высота на разнос глав не влияет. */
function planarDistance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function insideBounds(point: WorldPoint): boolean {
  return (
    point[0] >= WORLD_BOUNDS.minX &&
    point[0] <= WORLD_BOUNDS.maxX &&
    point[2] >= WORLD_BOUNDS.minZ &&
    point[2] <= WORLD_BOUNDS.maxZ
  );
}

const allPoints: WorldPoint[] = [
  ...worldChapters.flatMap((chapter) => [
    chapter.grace,
    ...chapter.projects.map((project) => project.at),
  ]),
  worldPeak,
];

describe('раскладка резюме по миру', () => {
  it('каждое место работы получило ровно одну главу', () => {
    const placed = worldChapters.map((chapter) => chapter.positionId);
    expect(placed.sort()).toEqual(experience.map((position) => position.id).sort());
  });

  it('состав проектов главы совпадает с местом работы', () => {
    for (const chapter of worldChapters) {
      const position = experience.find((entry) => entry.id === chapter.positionId);
      expect(position).toBeDefined();
      const placed = chapter.projects.map((project) => project.slug).sort();
      expect(placed).toEqual([...position!.projectSlugs].sort());
    }
  });

  it('каждый проект резюме размещён ровно один раз', () => {
    const placed = worldChapters.flatMap((chapter) =>
      chapter.projects.map((project) => project.slug),
    );
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed.sort()).toEqual(projects.map((project) => project.slug).sort());
  });

  it('две метки не стоят в одной точке', () => {
    const keys = allPoints.map((point) => point.join(','));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('все метки внутри обрезанного мира', () => {
    for (const point of allPoints) {
      expect(insideBounds(point)).toBe(true);
    }
  });

  it('ни одна метка не утоплена под воду', () => {
    for (const point of allPoints) {
      expect(point[1]).toBeGreaterThan(SEA_LEVEL);
    }
  });

  it('главы разнесены — иначе путь не читается', () => {
    for (let i = 0; i < worldChapters.length; i++) {
      for (let j = i + 1; j < worldChapters.length; j++) {
        const gap = planarDistance(worldChapters[i]!.grace, worldChapters[j]!.grace);
        expect(gap).toBeGreaterThanOrEqual(MIN_CHAPTER_SEPARATION);
      }
    }
  });

  it('порядок глав совпадает с хронологией резюме', () => {
    const chronological = [...experience]
      .filter(
        (position) => !worldChapters.find((c) => c.positionId === position.id)?.branch,
      )
      .sort((a, b) => a.period.from.localeCompare(b.period.from))
      .map((position) => position.id);

    expect(mainRoute().map((chapter) => chapter.positionId)).toEqual(chronological);
  });

  it('порядковые номера глав уникальны и без разрывов', () => {
    const orders = worldChapters.map((chapter) => chapter.order).sort((a, b) => a - b);
    expect(orders).toEqual(worldChapters.map((_, index) => index));
  });

  it('ответвление ровно одно: собственные проекты', () => {
    const branches = worldChapters.filter((chapter) => chapter.branch);
    expect(branches).toHaveLength(1);
    expect(branches[0]!.positionId).toBe('personal');
  });

  it('проекты держатся своей главы, а не соседней', () => {
    for (const chapter of worldChapters) {
      for (const project of chapter.projects) {
        const own = planarDistance(chapter.grace, project.at);
        for (const other of worldChapters) {
          if (other === chapter) continue;
          expect(own).toBeLessThan(planarDistance(other.grace, project.at));
        }
      }
    }
  });

  it('вершина стоит в стороне от пути и выше любой главы', () => {
    for (const chapter of worldChapters) {
      expect(planarDistance(worldPeak, chapter.grace)).toBeGreaterThan(20);
      expect(worldPeak[1]).toBeGreaterThan(chapter.grace[1]);
    }
  });
});
