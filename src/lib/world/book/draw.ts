/** Отрисовка одной страницы книги на двумерном холсте. */

import type { Translate } from '@/lib/i18n';

import {
  pageContent,
  type ListRole,
  type PageBlock,
  type PageFace,
  type PageSide,
  type TextRole,
} from './content';

export type { PageFace, PageSide } from './content';

/**
 * Палитра страницы. Экспортируется, потому что её повторяют токены оболочки
 * мира (`--color-book-*` в `styles/tokens.css`): холст переменных CSS не видит,
 * и без сверки тестом два набора цветов разошлись бы на первой же правке.
 */
export const PAGE_PALETTE = {
  paper: '#e6dfce',
  ink: '#2c2a26',
  inkMuted: '#6b665c',
  accent: '#8a5a2b',
  rule: '#c9c0aa',
} as const;

const PAPER = PAGE_PALETTE.paper;
const INK = PAGE_PALETTE.ink;
const INK_MUTED = PAGE_PALETTE.inkMuted;
const ACCENT = PAGE_PALETTE.accent;
const RULE = PAGE_PALETTE.rule;

/** Поле страницы. У корешка шире: там строка уходит в изгиб и теряется. */
const MARGIN = 104;
const SPINE_MARGIN = 148;

/** Ширина ступеньки затенения у корешка. */
const SPINE_SHADE = 56;

const DISPLAY = '"Cormorant Garamond", Georgia, serif';
const BODY = '"Inter", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

/** Шрифты, без которых страницу рисовать нельзя. */
const REQUIRED_FONTS = [
  `400 38px ${BODY}`,
  `600 38px ${BODY}`,
  `600 76px ${DISPLAY}`,
  `400 32px ${MONO}`,
] as const;

/** Ждёт шрифты. Без них первая страница выйдет запасным начертанием. */
export async function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;

  await Promise.all(REQUIRED_FONTS.map((font) => document.fonts.load(font)));
}

/** Место мишени на странице, в пикселях холста. */
export type LinkHotspot = {
  kind: 'link';
  x: number;
  y: number;
  width: number;
  height: number;
  href: string;
  label: string;
};

export type CloseHotspot = {
  kind: 'close';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

export type PageHotspot = LinkHotspot | CloseHotspot;

type Cursor = { x: number; y: number; width: number };

/** Ниже этой линии полоса набора кончается: там колонцифра. */
const FOOTER = 132;

/** Черта под заголовком: во всю полосу или короткая. */
type Rule = { width: 'full' | 'short'; offset: number };

type TextStyle = {
  /** Кегль до подгонки под разворот. */
  size: number;
  weight: number;
  family: string;
  color: string;
  /** Межстрочное расстояние. */
  lead: number;
  /** Отступ перед блоком и после него. */
  before?: number;
  after?: number;
  rule?: Rule;
};

/** Типографика по ролям. */
const TEXT: Record<TextRole, TextStyle> = {
  name: { size: 74, weight: 600, family: DISPLAY, color: INK, lead: 85, after: 21 },
  role: {
    size: 39,
    weight: 400,
    family: BODY,
    color: INK_MUTED,
    lead: 55,
    rule: { width: 'short', offset: 34 },
    after: 106,
  },
  place: { size: 31, weight: 400, family: MONO, color: INK_MUTED, lead: 48 },
  coverTitle: {
    size: 118,
    weight: 600,
    family: DISPLAY,
    color: INK,
    lead: 129,
    rule: { width: 'full', offset: 28 },
    after: 97,
  },
  coverBlurb: { size: 41, weight: 400, family: BODY, color: INK_MUTED, lead: 48 },
  chapterTitle: {
    size: 82,
    weight: 600,
    family: DISPLAY,
    color: INK,
    lead: 87,
    rule: { width: 'full', offset: 16 },
    after: 53,
  },
  sectionTitle: {
    size: 69,
    weight: 600,
    family: DISPLAY,
    color: INK,
    lead: 74,
    rule: { width: 'full', offset: 16 },
    after: 53,
  },
  position: { size: 44, weight: 600, family: BODY, color: ACCENT, lead: 60 },
  period: {
    size: 37,
    weight: 400,
    family: MONO,
    color: INK_MUTED,
    lead: 55,
    before: 23,
  },
  summary: { size: 44, weight: 400, family: BODY, color: INK, lead: 62, after: 53 },
  tagline: {
    size: 41,
    weight: 400,
    family: BODY,
    color: INK_MUTED,
    lead: 58,
    after: 39,
  },
  paragraph: { size: 41, weight: 400, family: BODY, color: INK, lead: 60, after: 48 },
  stack: { size: 34, weight: 400, family: MONO, color: ACCENT, lead: 53 },
  label: { size: 34, weight: 400, family: MONO, color: RULE, lead: 55, after: 14 },
};

type ListStyle = {
  size: number;
  weight: number;
  family: string;
  color: string;
  lead: number;
  /** Воздух между пунктами. У оглавления его нет: это перечень, а не текст. */
  gap: number;
};

const LIST: Record<ListRole, ListStyle> = {
  guide: { size: 39, weight: 400, family: BODY, color: INK_MUTED, lead: 55, gap: 9 },
  points: { size: 39, weight: 400, family: BODY, color: INK_MUTED, lead: 55, gap: 9 },
  index: { size: 41, weight: 400, family: BODY, color: INK, lead: 58, gap: 0 },
};

/** Отступ маркера от края полосы: тире плюс пробел. */
const BULLET_INDENT = 39;

/** Второй и следующий списки подряд отбиваются от предыдущего. */
const LIST_TO_LIST = 25;

const LINK = {
  size: 39,
  weight: 400,
  family: BODY,
  color: ACCENT,
  lead: 55,
  before: 39,
  gap: 12,
  /** Насколько подчёркивание опущено под базовую линию. */
  underline: 12,
  /** Запас мишени сверху и снизу. */
  padding: 14,
} as const;

/** Толщина черты и подчёркивания. Считается от кегля, чтобы не тончать. */
const STROKE = 2;

/** Откуда начинается полоса набора. Титульные страницы опущены ниже. */
const TOP = 200;
const COVER_TOP = { left: 380, right: 360 } as const;

/** Ниже какой доли кегля страницу не ужимать. */
const MIN_FIT = 0.66;

/**
 * Состояние отрисовки: куда пишем, докуда можно, каким кеглем и пишем ли
 * вообще.
 */
type Layout = {
  context: CanvasRenderingContext2D;
  /** Ниже этой линии полоса кончается. При замере — бесконечность. */
  bottom: number;
  /** Во сколько раз кегль ужат под разворот. */
  fit: number;
  dry: boolean;
};

/** Шорткат `font` из разложенного начертания и подогнанного кегля. */
function font(style: { weight: number; size: number; family: string }, fit: number) {
  return `${style.weight} ${style.size * fit}px ${style.family}`;
}

/** Разбивает текст по ширине и укладывает, возвращая новую высоту курсора. */
function paragraph(
  layout: Layout,
  text: string,
  cursor: Cursor,
  lineHeight: number,
): number {
  const { context } = layout;
  const words = text.split(' ');
  let line = '';
  let y = cursor.y;

  const flush = () => {
    if (y > layout.bottom) return false;
    if (!layout.dry) context.fillText(line, cursor.x, y);
    y += lineHeight;
    return true;
  };

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= cursor.width || !line) {
      line = candidate;
      continue;
    }

    if (!flush()) return y;
    line = word;
  }

  if (line) flush();
  return y;
}

/** Маркированный список. Маркер — тире: точка на плоской бумаге теряется. */
function bullets(
  layout: Layout,
  items: readonly string[],
  cursor: Cursor,
  style: ListStyle,
): number {
  const { context, fit } = layout;
  const indent = BULLET_INDENT * fit;
  const lead = style.lead * fit;
  let y = cursor.y;

  context.font = font(style, fit);

  for (const item of items) {
    if (!layout.dry) {
      context.fillStyle = ACCENT;
      context.fillText('—', cursor.x, y);
      context.fillStyle = style.color;
    }

    y = paragraph(
      layout,
      item,
      { x: cursor.x + indent, y, width: cursor.width - indent },
      lead,
    );
    y += style.gap * fit;
  }

  return y;
}

/** Строка текста со своей ролью. Возвращает высоту курсора после неё. */
function line(layout: Layout, text: string, cursor: Cursor, style: TextStyle): number {
  const { context, fit } = layout;
  const top = cursor.y + (style.before ?? 0) * fit;

  context.font = font(style, fit);
  if (!layout.dry) context.fillStyle = style.color;

  const y = paragraph(layout, text, { ...cursor, y: top }, style.lead * fit);

  if (style.rule) {
    const width = style.rule.width === 'full' ? cursor.width : cursor.width * 0.4;
    if (!layout.dry) {
      context.fillStyle = RULE;
      context.fillRect(cursor.x, y + style.rule.offset * fit, width, STROKE);
    }
  }

  return y + (style.after ?? 0) * fit;
}

/** Ссылки строкой на строку. Возвращает высоту курсора и места мишеней. */
function links(
  layout: Layout,
  items: readonly { label: string; href: string }[],
  cursor: Cursor,
  found: PageHotspot[],
): number {
  const { context, fit } = layout;
  const lead = LINK.lead * fit;
  const padding = LINK.padding * fit;
  let y = cursor.y + LINK.before * fit;

  context.font = font(LINK, fit);
  if (!layout.dry) context.fillStyle = LINK.color;

  for (const item of items) {
    const width = Math.min(context.measureText(item.label).width, cursor.width);

    if (!layout.dry) {
      context.fillText(item.label, cursor.x, y);
      context.fillRect(cursor.x, y + LINK.underline * fit, width, STROKE);

      found.push({
        kind: 'link',
        x: cursor.x,
        y: y - lead + padding,
        width,
        height: lead + padding,
        href: item.href,
        label: item.label,
      });
    }

    y += lead + LINK.gap * fit;
  }

  return y;
}

/** Укладывает блоки сверху вниз, собирая по дороге места ссылок. */
function blocks(
  layout: Layout,
  page: readonly PageBlock[],
  cursor: Cursor,
  hotspots: PageHotspot[],
): number {
  let y = cursor.y;
  let previous: PageBlock | null = null;

  for (const block of page) {
    if (block.kind === 'list' && previous?.kind === 'list')
      y += LIST_TO_LIST * layout.fit;

    if (block.kind === 'text') {
      y = line(layout, block.text, { ...cursor, y }, TEXT[block.role]);
    } else if (block.kind === 'list') {
      y = bullets(layout, block.items, { ...cursor, y }, LIST[block.role]);
    } else {
      y = links(layout, block.items, { ...cursor, y }, hotspots);
    }

    previous = block;
  }

  return y;
}

/** Полоса набора одной стороны: откуда начинается и сколько её всего. */
type Column = { top: number; height: number };

/** Во сколько раз ужать кегль, чтобы разворот поместился целиком. */
function fitFor(
  context: CanvasRenderingContext2D,
  sides: readonly { page: readonly PageBlock[]; column: Column }[],
  width: number,
): number {
  let fit = 1;

  for (let pass = 0; pass < 2; pass++) {
    let tightest = 1;

    for (const side of sides) {
      const layout: Layout = { context, bottom: Infinity, fit, dry: true };
      const used =
        blocks(layout, side.page, { x: 0, y: side.column.top, width }, []) -
        side.column.top;

      if (used > side.column.height) {
        tightest = Math.min(tightest, side.column.height / used);
      }
    }

    if (tightest >= 1) break;
    fit = Math.max(fit * tightest, MIN_FIT);
  }

  return fit;
}

/** Откуда начинается полоса набора на этой стороне. */
function columnTop(face: PageFace): number {
  return face.spread.kind === 'cover' ? COVER_TOP[face.side] : TOP;
}

/**
 * Рисует страницу целиком: бумагу, затенение у корешка и содержимое.
 * @param context холст размером `PAGE_WIDTH_PX` на `PAGE_HEIGHT_PX`
 * @param face какой разворот и какая его сторона
 * @param number номер страницы для колонтитула
 * @param t переводчик: на языке посетителя только хром книги, текст резюме нет
 * @returns места ссылок в пикселях страницы — пустой список, если их нет
 */
export function drawPage(
  context: CanvasRenderingContext2D,
  face: PageFace,
  number: number,
  t: Translate,
): PageHotspot[] {
  const { width, height } = context.canvas;

  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);

  context.fillStyle = 'rgba(0, 0, 0, 0.05)';
  if (face.side === 'left')
    context.fillRect(width - SPINE_SHADE, 0, SPINE_SHADE, height);
  else context.fillRect(0, 0, SPINE_SHADE, height);

  const left = face.side === 'left' ? MARGIN : SPINE_MARGIN;
  const right = face.side === 'left' ? SPINE_MARGIN : MARGIN;
  const column: Column = {
    top: columnTop(face),
    height: height - FOOTER - columnTop(face),
  };
  const cursor: Cursor = { x: left, y: column.top, width: width - left - right };

  context.textBaseline = 'alphabetic';

  const other: PageSide = face.side === 'left' ? 'right' : 'left';
  const otherFace: PageFace = { spread: face.spread, side: other };
  const fit = fitFor(
    context,
    [
      { page: pageContent(face, t), column },
      {
        page: pageContent(otherFace, t),
        column: {
          top: columnTop(otherFace),
          height: height - FOOTER - columnTop(otherFace),
        },
      },
    ],
    cursor.width,
  );

  const hotspots: PageHotspot[] = [];
  blocks(
    { context, bottom: height - FOOTER, fit, dry: false },
    pageContent(face, t),
    cursor,
    hotspots,
  );

  context.font = `400 31px ${MONO}`;
  context.fillStyle = RULE;
  context.textAlign = face.side === 'left' ? 'left' : 'right';
  context.fillText(
    String(number),
    face.side === 'left' ? left : width - right,
    height - 84,
  );
  context.textAlign = 'left';

  const closing = closeMark(context, face, t);
  if (closing) hotspots.push(closing);

  return hotspots;
}

/** Печатное «закрыть» в правом верхнем углу разворота. */
function closeMark(
  context: CanvasRenderingContext2D,
  face: PageFace,
  t: Translate,
): CloseHotspot | null {
  if (face.side !== 'right') return null;

  const { width } = context.canvas;
  const label = t('world.book.closePrint');
  const right = width - MARGIN;

  context.font = `400 31px ${MONO}`;
  context.fillStyle = INK_MUTED;
  context.textAlign = 'right';
  context.fillText(label, right, CLOSE_BASELINE);
  context.textAlign = 'left';

  const text = context.measureText(label).width;
  const pad = CLOSE_PAD;

  return {
    kind: 'close',
    x: right - text - pad,
    y: CLOSE_BASELINE - 31 - pad,
    width: text + pad * 2,
    height: 31 + pad * 2,
    label,
  };
}

/** Базовая линия печатного «закрыть», пиксели холста страницы. */
const CLOSE_BASELINE = 116;

/** Запас мишени вокруг печатного «закрыть», пиксели холста страницы. */
const CLOSE_PAD = 46;
