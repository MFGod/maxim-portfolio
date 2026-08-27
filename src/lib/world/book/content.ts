/**
 * Содержимое страниц книги — единственный источник и для холста, и для DOM.
 *
 * D8: страницу видит один посетитель и слышит другой. Холст рисует буквы в
 * текстуру, скринридер читает разметку, и если каждый из них пойдёт в резюме
 * своей дорогой, они разойдутся на первой же правке — молча, потому что
 * увидеть расхождение можно только ушами.
 *
 * Поэтому здесь модель, а не вёрстка: блок знает свою **роль**, а не шрифт.
 * Кегль, цвет и отступы живут в `draw.ts`, теги — в разметке страницы мира.
 * Общее у них — этот файл.
 *
 * Язык. Контент резюме остаётся русским при любой локали: так решено для всего
 * портфолио (`i18n`: «This switches system labels. Résumé, project and
 * experience content stays in Russian»). Переключается только хром книги —
 * подсказки, титул, служебные подписи, — и он приходит сюда переводчиком.
 */

import { experience, getProject, profile } from '@/data/resume';
import type { Translate, TranslationKey } from '@/lib/i18n';
import { formatPeriod } from '@/lib/format';

import type { BookSpread } from './plan';

/** Сторона разворота. Корешок у левой страницы справа, у правой — слева. */
export type PageSide = 'left' | 'right';

/**
 * Роль строки на странице.
 *
 * Роль, а не стиль: `chapterTitle` и `sectionTitle` различаются кеглем, но
 * названы по месту в книге — иначе правка типографики потребовала бы правки
 * содержимого.
 */
export type TextRole =
  | 'name'
  | 'role'
  | 'place'
  | 'coverTitle'
  | 'coverBlurb'
  | 'chapterTitle'
  | 'sectionTitle'
  | 'position'
  | 'period'
  | 'summary'
  | 'tagline'
  | 'paragraph'
  | 'stack'
  | 'label';

/**
 * Роль списка. `guide` — подсказки, `index` — оглавление главы, `points` —
 * что делал и как устроено.
 */
export type ListRole = 'guide' | 'index' | 'points';

/** Ссылка со страницы. `href` приходит только из резюме, руками не собирается. */
export type PageLink = {
  label: string;
  href: string;
};

export type PageBlock =
  | { kind: 'text'; role: TextRole; text: string }
  | { kind: 'list'; role: ListRole; items: readonly string[] }
  | { kind: 'links'; items: readonly PageLink[] };

/** Что рисуем: разворот и его сторона. */
export type PageFace = {
  spread: BookSpread;
  side: PageSide;
};

/**
 * Блоки одной страницы.
 *
 * Пустой список — законный ответ: у ненайденной позиции или проекта страница
 * остаётся бумагой с колонцифрой. Бросать здесь нельзя, иначе опечатка в
 * `world-places.ts` роняла бы весь мир, а не одну страницу.
 */
export function pageContent(face: PageFace, t: Translate): PageBlock[] {
  const { spread, side } = face;

  if (spread.kind === 'cover') {
    // Обе стороны заняты: пустая страница в развороте читается не приёмом, а
    // недоделкой. Слева — авантитул с именем, справа — титул.
    return side === 'left' ? halfTitle() : cover(t);
  }

  if (spread.kind === 'guide') {
    return guide(t, side);
  }

  if (spread.kind === 'chapter') {
    return chapter(spread.positionId, side);
  }

  return project(spread.slug, side);
}

/** Авантитул: кто написал книгу, и как с ним связаться. */
function halfTitle(): PageBlock[] {
  return [
    { kind: 'text', role: 'name', text: profile.name },
    { kind: 'text', role: 'role', text: profile.role },
    { kind: 'text', role: 'place', text: profile.location },
    /*
     * Контакты стоят на авантитуле, а не в конце книги. Это единственная
     * страница, до которой доходит каждый: она открывается вместе с обложкой,
     * и до неё не нужно долистать.
     */
    {
      kind: 'links',
      items: profile.contacts.map((contact) => ({
        label: contact.label,
        href: contact.href,
      })),
    },
  ];
}

function cover(t: Translate): PageBlock[] {
  return [
    // Титул книги — тот же, что у страницы мира: это одна вещь, названная
    // дважды, и расхождение здесь читалось бы опечаткой.
    { kind: 'text', role: 'coverTitle', text: t('world.screen.title') },
    { kind: 'text', role: 'coverBlurb', text: t('world.screen.subtitle') },
  ];
}

/**
 * Разворот подсказок: как листать книгу и как ходить по миру.
 *
 * Обе стороны устроены одинаково — заголовок и список, — потому что это одна
 * справка на двух страницах, а не две разные.
 */
function guide(t: Translate, side: PageSide): PageBlock[] {
  const scope = side === 'left' ? 'book' : 'world';

  return [
    { kind: 'text', role: 'sectionTitle', text: t(`world.book.guide.${scope}.title`) },
    { kind: 'list', role: 'guide', items: GUIDE_LINES[scope].map((key) => t(key)) },
  ];
}

/**
 * Строки подсказок, перечисленные ключами.
 *
 * Списком, а не циклом по номерам: словарь — плоская запись, и ключ, собранный
 * из куска и числа, типами не проверяется. Здесь же лишняя строка в словаре без
 * строки в этом списке просто не попадёт на страницу, а опечатка в ключе не
 * соберётся.
 */
const GUIDE_LINES = {
  book: [
    'world.book.guide.book.1',
    'world.book.guide.book.2',
    'world.book.guide.book.3',
    'world.book.guide.book.4',
    'world.book.guide.book.5',
  ],
  world: [
    'world.book.guide.world.1',
    'world.book.guide.world.2',
    'world.book.guide.world.3',
    'world.book.guide.world.4',
  ],
} as const satisfies Record<'book' | 'world', readonly TranslationKey[]>;

function chapter(positionId: string, side: PageSide): PageBlock[] {
  const position = experience.find((item) => item.id === positionId);
  if (!position) return [];

  if (side === 'left') {
    return [
      { kind: 'text', role: 'chapterTitle', text: position.company },
      { kind: 'text', role: 'position', text: position.role },
      { kind: 'text', role: 'period', text: formatPeriod(position.period) },
    ];
  }

  const blocks: PageBlock[] = [];

  if (position.summary) {
    blocks.push({ kind: 'text', role: 'summary', text: position.summary });
  }

  /*
   * Оглавление главы. Без него страница пустела там, где в резюме нет зоны
   * ответственности одним абзацем, — а это ровно Cleverbots с восемью
   * проектами, самая насыщенная глава книги.
   */
  const named = position.projectSlugs
    .map((slug) => getProject(slug)?.name)
    .filter((name): name is string => Boolean(name));

  if (named.length > 0) {
    blocks.push({ kind: 'text', role: 'label', text: CHAPTER_INDEX_LABEL });
    blocks.push({ kind: 'list', role: 'index', items: named });
  }

  return blocks;
}

/**
 * Подпись над оглавлением главы. Строка книги, а не системная подпись: она
 * стоит внутри русского текста резюме и на английском выглядела бы заплаткой.
 */
const CHAPTER_INDEX_LABEL = 'В этой главе';

function project(slug: string, side: PageSide): PageBlock[] {
  const found = getProject(slug);
  if (!found) return [];

  if (side === 'left') {
    const blocks: PageBlock[] = [
      { kind: 'text', role: 'sectionTitle', text: found.name },
      { kind: 'text', role: 'tagline', text: found.tagline },
    ];

    if (found.problem) {
      blocks.push({ kind: 'text', role: 'paragraph', text: found.problem });
    }

    blocks.push({ kind: 'text', role: 'stack', text: found.stack.join(' · ') });

    /*
     * Ссылки на левой странице, под стеком: правая занята рассказом о работе и
     * дорастает до низа полосы, а левая у большинства проектов кончается на
     * стеке. Проектов со ссылками мало — остальные под NDA и `links` у них
     * пустой, — поэтому строка не должна отнимать место у текста.
     */
    if (found.links.length > 0) {
      blocks.push({ kind: 'links', items: found.links });
    }

    return blocks;
  }

  const blocks: PageBlock[] = [];

  if (found.solution) {
    blocks.push({ kind: 'text', role: 'paragraph', text: found.solution });
  }

  if (found.contribution.length > 0) {
    blocks.push({ kind: 'list', role: 'points', items: found.contribution });
  }

  if (found.engineering.length > 0) {
    blocks.push({ kind: 'list', role: 'points', items: found.engineering });
  }

  return blocks;
}
