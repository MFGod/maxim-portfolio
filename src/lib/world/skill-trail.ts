/**
 * Что накоплено по пути: технологии глав, пройденных к этому моменту.
 *
 * Рядом с `route.ts` и по той же причине — без `three` и без React: правило
 * «что уже встретилось» проверяется списком строк, а не кадром.
 *
 * Копится по основному пути. Ответвление собственных проектов прогресса не
 * двигает (`route.ts`), поэтому и в накопление не входит: панель показывает
 * дорогу карьеры, а не всё, что человек знает, — для этого в портфолио есть
 * окно «Навыки».
 */

import { experience, getProject } from '@/data/resume';
import { mainRoute } from '@/data/world-places';

/** Технология, встреченная на пути. */
export type SkillGain = {
  name: string;
  /** Глава, в которой она встретилась впервые. */
  positionId: string;
  /**
   * Пришла с последней пройденной главой.
   *
   * Панель выделяет такие: без этого «накопление» выглядит списком, который
   * молча стал длиннее, и прибавка последнего шага теряется среди прежних.
   */
  fresh: boolean;
};

/**
 * Технологии всех глав до пройденной включительно, в порядке первой встречи.
 *
 * Порядок — хронология карьеры, а не алфавит: список читается ростом, и
 * повтор в поздней главе ничего не добавляет — технология уже стоит там, где
 * встретилась впервые.
 *
 * Дублей нет, но `React` и `React 18` — разные строки и остаются двумя
 * записями. Это данные резюме: где версия названа, она названа не случайно, и
 * сводить их здесь значило бы править содержание из отрисовки.
 */
export function skillsUpTo(passed: string | null): SkillGain[] {
  if (!passed) return [];

  const route = mainRoute();
  const last = route.findIndex((chapter) => chapter.positionId === passed);
  if (last < 0) return [];

  const gains: SkillGain[] = [];
  const seen = new Set<string>();

  for (const chapter of route.slice(0, last + 1)) {
    const position = experience.find((item) => item.id === chapter.positionId);
    if (!position) continue;

    for (const slug of position.projectSlugs) {
      for (const name of getProject(slug)?.stack ?? []) {
        if (seen.has(name)) continue;

        seen.add(name);
        gains.push({
          name,
          positionId: chapter.positionId,
          fresh: chapter.positionId === passed,
        });
      }
    }
  }

  return gains;
}
