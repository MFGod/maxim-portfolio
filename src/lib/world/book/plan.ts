/** Раскладка книги по разворотам. */

import { experience } from '@/data/resume';
import { worldChapters } from '@/data/world-places';

/**
 * Разворот книги. Обложка — один раз в начале; за ней подсказки; титул главы
 * открывает компанию; дальше её проекты по одному на разворот.
 */
export type BookSpread =
  | { kind: 'cover' }
  | { kind: 'guide' }
  | { kind: 'chapter'; positionId: string }
  | { kind: 'project'; positionId: string; slug: string };

/** Все развороты книги по порядку листания. */
export function spreads(): BookSpread[] {
  const ordered = [...worldChapters].sort((a, b) => a.order - b.order);

  const result: BookSpread[] = [{ kind: 'cover' }, { kind: 'guide' }];

  for (const chapter of ordered) {
    const { positionId } = chapter;
    result.push({ kind: 'chapter', positionId });

    const position = experience.find((item) => item.id === positionId);
    for (const slug of position?.projectSlugs ?? []) {
      result.push({ kind: 'project', positionId, slug });
    }
  }

  return result;
}

/** Индекс разворота подсказок. Туда ведёт закладка. */
export function guideSpread(layout: BookSpread[]): number {
  const index = layout.findIndex((spread) => spread.kind === 'guide');
  if (index < 0) throw new Error('книга: в раскладке нет разворота подсказок');
  return index;
}

/**
 * Сколько в книге листов бумаги. Разворот — две страницы, лист — две стороны,
 * поэтому листов ровно столько же, сколько разворотов: изнанка каждого листа
 * даёт левую страницу следующего разворота.
 */
export function sheetCount(): number {
  return spreads().length;
}
