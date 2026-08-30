import { deepFreeze } from '@/lib/freeze';

/**
 * Раскладка резюме по миру: где на карте стоит каждая глава карьеры и каждый
 * проект. Мир — не отдельный экспонат, а ещё одно представление тех же данных,
 * что и «Опыт» с «Проектами»: `positionId` и `slug` ссылаются в
 * `experience.ts` и `projects.ts`, и тест следит, чтобы связь не разошлась.
 */

/** Точка в мировых координатах: X, Y, Z. */
export type WorldPoint = readonly [number, number, number];

/** Объект карты, играющий роль метки проекта. Все четыре уже стоят в ландшафте. */
export type ProjectLandmark = 'dungeon' | 'catacombs' | 'evergaol' | 'hero_grave';

export type WorldProjectPlace = {
  /** `Project.slug` из `projects.ts`. */
  slug: string;
  landmark: ProjectLandmark;
  at: WorldPoint;
};

export type WorldChapter = {
  /** `Position.id` из `experience.ts`. */
  positionId: string;
  /** Порядок прохождения. Ветка идёт последней и в основной путь не входит. */
  order: number;
  /**
   * Ответвление от основного пути: собственные проекты того же года, что и
   * текущая работа. Направляющий луч ведёт по основному пути, не сюда.
   */
  branch: boolean;
  /** Благодать-метка главы. */
  grace: WorldPoint;
  projects: WorldProjectPlace[];
};

/**
 * Границы мира после обрезки. Должны совпадать с `map-bounds.js` в форке
 * lands-between — до тех пор, пока сцена не переехала сюда и не осталась
 * единственным источником.
 */
export const WORLD_BOUNDS = deepFreeze({
  minX: -48.019,
  maxX: 71.72,
  minZ: -76.584,
  maxZ: 38.156,
});

/** Поверхность океана. Ниже неё не должно оказаться ни одной метки. */
export const SEA_LEVEL = 0.09;

/** Минимальный разнос между главами: ближе — и путь перестаёт читаться. */
export const MIN_CHAPTER_SEPARATION = 16;

export const worldChapters: WorldChapter[] = deepFreeze([
  {
    positionId: 'flexy',
    order: 0,
    branch: false,
    grace: [-29.7, 2.7, -25.6],
    projects: [
      { slug: 'industrial-archive', landmark: 'evergaol', at: [-25.4, 2.9, -27.6] },
    ],
  },
  {
    positionId: 'giftbox',
    order: 1,
    branch: false,
    grace: [-33.4, 2.6, -6],
    projects: [{ slug: 'vk-gifts', landmark: 'catacombs', at: [-35.1, 1.9, -6.6] }],
  },
  {
    positionId: 'huntio',
    order: 2,
    branch: false,
    grace: [-17.9, 2.8, 2.2],
    projects: [{ slug: 'ats-platform', landmark: 'dungeon', at: [-18, 2.2, 1.7] }],
  },
  {
    positionId: 'cleverbots',
    order: 3,
    branch: false,
    grace: [0.6, 0.6, 13.6],
    projects: [
      { slug: 'ai-agents-marketplace', landmark: 'evergaol', at: [-3.8, 1.3, 17.1] },
      { slug: 'pharma-twa', landmark: 'catacombs', at: [-1.1, 0.7, 19] },
      { slug: 'tobacco-loyalty', landmark: 'dungeon', at: [3, 0.3, 6.9] },
      { slug: 'corporate-site', landmark: 'dungeon', at: [-5.4, 0.8, 9.4] },
      { slug: 'ai-product-manager', landmark: 'dungeon', at: [-4.5, 0.1, 18.9] },
      { slug: 'ecommerce-mini-app', landmark: 'dungeon', at: [4.6, 1, 7.1] },
      { slug: 'receipt-promo', landmark: 'dungeon', at: [-7.6, 0.1, 14.5] },
      { slug: 'prize-randomizer', landmark: 'catacombs', at: [8.8, 0.5, 12.3] },
    ],
  },
  {
    positionId: 'personal',
    order: 4,
    branch: true,
    grace: [15.7, 2.2, 3],
    projects: [{ slug: 'agents-config', landmark: 'dungeon', at: [14.8, 1.7, 3.7] }],
  },
]);

/**
 * Непройденная вершина: в резюме это «Node.js (изучаю)», backend и движение в
 * сторону fullstack. Точка стоит в стороне от всех глав и заметно выше их —
 * гора видна с маршрута, но дорога к ней не пройдена. Метки проекта у неё нет
 * намеренно: там пока нечего открывать.
 */
export const worldPeak: WorldPoint = deepFreeze([24.9, 14.2, -36]);

/** Главы основного пути в порядке прохождения, без ответвления. */
export function mainRoute(): WorldChapter[] {
  return worldChapters
    .filter((chapter) => !chapter.branch)
    .sort((a, b) => a.order - b.order);
}
