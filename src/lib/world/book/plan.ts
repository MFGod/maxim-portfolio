/**
 * Раскладка книги по разворотам.
 *
 * Отдельного файла данных здесь нет намеренно, хотя D4 велит держать раскладку
 * в `src/data`. Разница с `world-places.ts` в происхождении: там координаты,
 * снятые вживую с карты, — их неоткуда вывести, и потому им место в данных.
 * Здесь же порядок целиком выводится из резюме, и третий список глав и
 * проектов рядом с `experience.ts` и `projects.ts` заводил бы рассинхрон:
 * добавили проект в резюме — забыли в книге. Связь держит тест.
 *
 * Порядок глав берётся у мира, а не у резюме. `experience.ts` отсортирован от
 * свежего к старому — так читают резюме; `worldChapters` идут по хронологии —
 * так проходят маршрут. Книга едет с камерой по маршруту, значит порядок её.
 */

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

/**
 * Все развороты книги по порядку листания.
 *
 * Функция, а не константа: `experience` и `worldChapters` заморожены, считать
 * заново дёшево, а модульная константа пережила бы горячую перезагрузку с
 * устаревшим содержимым.
 */
export function spreads(): BookSpread[] {
  const ordered = [...worldChapters].sort((a, b) => a.order - b.order);

  /*
   * Подсказки стоят сразу за обложкой, а не в конце книги.
   *
   * Управление нужно тому, кто книгу только что открыл, — а до конца он к
   * этому моменту не долистал. У бумажных изданий предисловие «как читать эту
   * книгу» стоит там же и по той же причине.
   */
  const result: BookSpread[] = [{ kind: 'cover' }, { kind: 'guide' }];

  for (const chapter of ordered) {
    const { positionId } = chapter;
    result.push({ kind: 'chapter', positionId });

    // Порядок проектов — из резюме: `worldChapters[].projects` про место на
    // карте, а не про то, какой проект в главе главный.
    const position = experience.find((item) => item.id === positionId);
    for (const slug of position?.projectSlugs ?? []) {
      result.push({ kind: 'project', positionId, slug });
    }
  }

  return result;
}

/**
 * Индекс разворота подсказок. Туда ведёт закладка.
 *
 * Ищется, а не берётся числом: разворот стоит вторым сегодня, но порядок в
 * `spreads` — решение раскладки, а не закладки. Захардкоженная единица тихо
 * увела бы закладку на чужую страницу при первой же перестановке.
 */
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
