import { describe, expect, it } from 'vitest';

import { experience, getProject } from '@/data/resume';
import { mainRoute, worldChapters } from '@/data/world-places';
import { skillsUpTo } from '@/lib/world/skill-trail';

const route = mainRoute();
const first = route[0]!;
const second = route[1]!;
const last = route[route.length - 1]!;

/** Технологии главы по резюме, без учёта порядка и повторов. */
function stackOf(positionId: string): string[] {
  const position = experience.find((item) => item.id === positionId);
  const names = (position?.projectSlugs ?? []).flatMap(
    (slug) => getProject(slug)?.stack ?? [],
  );

  return [...new Set(names)];
}

describe('накопление навыков по пути', () => {
  it('до первой главы копить нечего', () => {
    expect(skillsUpTo(null)).toEqual([]);
  });

  it('первая глава отдаёт свой стек целиком', () => {
    const gains = skillsUpTo(first.positionId);

    expect(gains.map((gain) => gain.name).sort()).toEqual(
      stackOf(first.positionId).sort(),
    );
  });

  it('вторая глава добавляет своё, не теряя прежнего', () => {
    const before = skillsUpTo(first.positionId).map((gain) => gain.name);
    const after = skillsUpTo(second.positionId).map((gain) => gain.name);

    // Накопление, а не замена: всё прежнее остаётся на своих местах в начале.
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it('повтор технологии не заводит второй записи', () => {
    const names = skillsUpTo(last.positionId).map((gain) => gain.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('технология числится за главой, где встретилась впервые', () => {
    // Иначе `TypeScript` из первой главы позже переехал бы к четвёртой, и
    // список перестал бы читаться ростом.
    const early = skillsUpTo(first.positionId);
    const later = skillsUpTo(last.positionId);

    for (const gain of early) {
      const same = later.find((item) => item.name === gain.name);
      expect(same?.positionId).toBe(gain.positionId);
    }
  });

  it('свежим помечено то, что пришло с последней главой', () => {
    const gains = skillsUpTo(second.positionId);
    const fresh = gains.filter((gain) => gain.fresh);

    expect(fresh.length).toBeGreaterThan(0);
    for (const gain of fresh) expect(gain.positionId).toBe(second.positionId);
    for (const gain of gains.filter((item) => !item.fresh)) {
      expect(gain.positionId).not.toBe(second.positionId);
    }
  });

  it('ответвление в накопление не входит', () => {
    /*
     * Своими проектами прогресс не двигается — это записано в `world-places.ts`
     * и проверено в `world-route.test.ts`. Здесь важно следствие: их стек не
     * попадает в панель, даже когда пройден весь основной путь.
     */
    const branch = worldChapters.find((chapter) => chapter.branch)!;
    const names = new Set(skillsUpTo(last.positionId).map((gain) => gain.name));

    const own = stackOf(branch.positionId).filter(
      (name) => !route.some((chapter) => stackOf(chapter.positionId).includes(name)),
    );

    expect(own.length).toBeGreaterThan(0);
    for (const name of own) expect(names.has(name)).toBe(false);
  });

  it('неизвестная глава ничего не копит', () => {
    expect(skillsUpTo('нет-такой-главы')).toEqual([]);
  });
});
