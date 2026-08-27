/**
 * Отрисовка одной страницы книги на двумерном холсте.
 *
 * Вынесено из пула намеренно: пул отвечает за жизнь текстуры в видеопамяти,
 * этот файл — за буквы. Само содержимое сюда приходит блоками из `content.ts`
 * (D8: холст и скрытая разметка обязаны идти из одного места, иначе разъедутся)
 * — здесь остаются только кегли, цвета и отступы.
 *
 * Палитра плоская и не случайно. В мире нет ни одной текстуры: 107 GLB-файлов,
 * 148 материалов, всё на `baseColorFactor` и цвете вершин. Фотографическая
 * бумага с зерном и мягкими тенями рядом с тремя миллионами плоскозакрашенных
 * треугольников читалась бы вставкой из другого проекта. Поэтому заливки
 * плоские, а затенение у корешка — ступенькой, а не градиентом.
 *
 * Цвета подобраны под пайплайн, а не «на глаз». `OutputPass` применяет
 * экспозицию 1.16 ко всему кадру, а `UnrealBloomPass` ловит всё ярче единицы.
 * Бумага `#E6DFCE` при `emissiveIntensity` 0.85 садится около 0.73 по яркости —
 * читается белой и остаётся под порогом свечения. Чистый белый полыхал бы.
 */

import type { Translate } from '@/lib/i18n';

import {
  pageContent,
  type ListRole,
  type PageBlock,
  type PageFace,
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

/**
 * Шрифты, без которых страницу рисовать нельзя.
 *
 * Холст не ждёт загрузки веб-шрифта: если тот ещё не готов, текст молча
 * ложится запасным начертанием и остаётся таким до перерисовки. Поэтому
 * отрисовка обязана дождаться этих обещаний.
 *
 * Имена простые, без хешей: `next/font` регистрирует семейства как `Inter`,
 * `Cormorant Garamond` и `JetBrains Mono` — проверено в браузере.
 */
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

/**
 * Место ссылки на странице, в пикселях холста.
 *
 * Считается по факту укладки строк, а не задаётся заранее: строка переносится
 * по ширине полосы, и где она кончится, до отрисовки не знает никто.
 */
export type PageHotspot = {
  x: number;
  y: number;
  width: number;
  height: number;
  href: string;
  label: string;
};

type Cursor = { x: number; y: number; width: number };

/** Ниже этой линии полоса набора кончается: там колонцифра. */
const FOOTER = 132;

/** Черта под заголовком: во всю полосу или короткая. */
type Rule = { width: 'full' | 'short'; offset: number };

type TextStyle = {
  font: string;
  color: string;
  /** Межстрочное расстояние. */
  lead: number;
  /** Отступ перед блоком и после него. */
  before?: number;
  after?: number;
  rule?: Rule;
};

/**
 * Типографика по ролям.
 *
 * Таблицей, а не ветвями в рисовании: так видно всю страницу разом — какие
 * кегли соседствуют и где кончается воздух, — и правка кегля не требует читать
 * логику. Числа взяты те же, что были в ветвях до выноса содержимого.
 */
const TEXT: Record<TextRole, TextStyle> = {
  name: { font: `600 64px ${DISPLAY}`, color: INK, lead: 74, after: 18 },
  role: {
    font: `400 34px ${BODY}`,
    color: INK_MUTED,
    lead: 48,
    rule: { width: 'short', offset: 30 },
    after: 92,
  },
  place: { font: `400 27px ${MONO}`, color: INK_MUTED, lead: 42 },
  coverTitle: {
    font: `600 104px ${DISPLAY}`,
    color: INK,
    lead: 112,
    rule: { width: 'full', offset: 24 },
    after: 84,
  },
  coverBlurb: { font: `400 36px ${BODY}`, color: INK_MUTED, lead: 42 },
  chapterTitle: {
    font: `600 72px ${DISPLAY}`,
    color: INK,
    lead: 76,
    rule: { width: 'full', offset: 14 },
    after: 46,
  },
  sectionTitle: {
    font: `600 60px ${DISPLAY}`,
    color: INK,
    lead: 64,
    rule: { width: 'full', offset: 14 },
    after: 46,
  },
  position: { font: `600 38px ${BODY}`, color: ACCENT, lead: 52 },
  period: { font: `400 32px ${MONO}`, color: INK_MUTED, lead: 48, before: 20 },
  summary: { font: `400 38px ${BODY}`, color: INK, lead: 54, after: 46 },
  tagline: { font: `400 36px ${BODY}`, color: INK_MUTED, lead: 50, after: 34 },
  // Задача и решение стояли на 40 и 44 — разница в четыре пикселя на полосе в
  // полторы тысячи не читается, а два числа вместо одного пришлось бы держать
  // в голове.
  paragraph: { font: `400 36px ${BODY}`, color: INK, lead: 52, after: 42 },
  stack: { font: `400 30px ${MONO}`, color: ACCENT, lead: 46 },
  label: { font: `400 30px ${MONO}`, color: RULE, lead: 48, after: 12 },
};

type ListStyle = {
  font: string;
  color: string;
  lead: number;
  /** Воздух между пунктами. У оглавления его нет: это перечень, а не текст. */
  gap: number;
};

const LIST: Record<ListRole, ListStyle> = {
  guide: { font: `400 34px ${BODY}`, color: INK_MUTED, lead: 48, gap: 8 },
  points: { font: `400 34px ${BODY}`, color: INK_MUTED, lead: 48, gap: 8 },
  index: { font: `400 36px ${BODY}`, color: INK, lead: 50, gap: 0 },
};

/** Отступ маркера от края полосы: тире плюс пробел. */
const BULLET_INDENT = 34;

/** Второй и следующий списки подряд отбиваются от предыдущего. */
const LIST_TO_LIST = 22;

const LINK = {
  font: `400 34px ${BODY}`,
  color: ACCENT,
  lead: 48,
  before: 34,
  gap: 10,
  /** Насколько подчёркивание опущено под базовую линию. */
  underline: 10,
  /**
   * Запас мишени сверху и снизу.
   *
   * Ссылку берут лучом по странице, стоящей под углом в трёх метрах от глаза, —
   * строка высотой 34 пикселя занимает в кадре считаные пиксели. Запас делает
   * мишень выше строки, не сдвигая саму строку.
   */
  padding: 12,
} as const;

/** Откуда начинается полоса набора. Титульные страницы опущены ниже. */
const TOP = 200;
const COVER_TOP = { left: 380, right: 360 } as const;

/**
 * Разбивает текст по ширине и рисует, возвращая новую высоту курсора.
 *
 * Ниже полосы набора не пишет: страница фиксированного размера, и строка,
 * ушедшая за край холста, пропадает молча — а так текст просто обрывается там,
 * где кончилось место, и это видно.
 */
function paragraph(
  context: CanvasRenderingContext2D,
  text: string,
  cursor: Cursor,
  lineHeight: number,
): number {
  const bottom = context.canvas.height - FOOTER;
  const words = text.split(' ');
  let line = '';
  let y = cursor.y;

  const flush = () => {
    if (y > bottom) return false;
    context.fillText(line, cursor.x, y);
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
  context: CanvasRenderingContext2D,
  items: readonly string[],
  cursor: Cursor,
  style: ListStyle,
): number {
  let y = cursor.y;

  context.font = style.font;

  for (const item of items) {
    context.fillStyle = ACCENT;
    context.fillText('—', cursor.x, y);
    context.fillStyle = style.color;
    y = paragraph(
      context,
      item,
      { x: cursor.x + BULLET_INDENT, y, width: cursor.width - BULLET_INDENT },
      style.lead,
    );
    y += style.gap;
  }

  return y;
}

/** Строка текста со своей ролью. Возвращает высоту курсора после неё. */
function line(
  context: CanvasRenderingContext2D,
  text: string,
  cursor: Cursor,
  style: TextStyle,
): number {
  const top = cursor.y + (style.before ?? 0);

  context.font = style.font;
  context.fillStyle = style.color;
  const y = paragraph(context, text, { ...cursor, y: top }, style.lead);

  if (style.rule) {
    context.fillStyle = RULE;
    const width = style.rule.width === 'full' ? cursor.width : cursor.width * 0.4;
    context.fillRect(cursor.x, y + style.rule.offset, width, 2);
  }

  return y + (style.after ?? 0);
}

/**
 * Ссылки строкой на строку. Возвращает высоту курсора и места мишеней.
 *
 * Подчёркивание рисуется, а не имитируется цветом: ссылка на бумажной странице
 * ничем другим от текста не отличается, а цвет акцента здесь носят ещё стек и
 * маркеры списка.
 */
function links(
  context: CanvasRenderingContext2D,
  items: readonly { label: string; href: string }[],
  cursor: Cursor,
  found: PageHotspot[],
): number {
  let y = cursor.y + LINK.before;

  context.font = LINK.font;
  context.fillStyle = LINK.color;

  for (const item of items) {
    const width = Math.min(context.measureText(item.label).width, cursor.width);

    context.fillText(item.label, cursor.x, y);
    context.fillRect(cursor.x, y + LINK.underline, width, 2);

    found.push({
      x: cursor.x,
      y: y - LINK.lead + LINK.padding,
      width,
      height: LINK.lead + LINK.padding,
      href: item.href,
      label: item.label,
    });

    y += LINK.lead + LINK.gap;
  }

  return y;
}

/**
 * Рисует страницу целиком: бумагу, затенение у корешка и содержимое.
 *
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

  // Ступенька у корешка вместо градиента: в мире плоских заливок мягкая тень
  // выглядит чужой. Объём странице даёт форма — провал бумаги к корешку и
  // торец блока: экранного затенения книге больше не достаётся, она рисуется
  // своим проходом после `GTAOPass`.
  context.fillStyle = 'rgba(0, 0, 0, 0.05)';
  if (face.side === 'left')
    context.fillRect(width - SPINE_SHADE, 0, SPINE_SHADE, height);
  else context.fillRect(0, 0, SPINE_SHADE, height);

  const left = face.side === 'left' ? MARGIN : SPINE_MARGIN;
  const right = face.side === 'left' ? SPINE_MARGIN : MARGIN;
  const top = face.spread.kind === 'cover' ? COVER_TOP[face.side] : TOP;
  const cursor: Cursor = { x: left, y: top, width: width - left - right };

  context.textBaseline = 'alphabetic';
  const hotspots = drawBlocks(context, pageContent(face, t), cursor);

  context.font = `400 27px ${MONO}`;
  context.fillStyle = RULE;
  context.textAlign = face.side === 'left' ? 'left' : 'right';
  context.fillText(
    String(number),
    face.side === 'left' ? left : width - right,
    height - 84,
  );
  context.textAlign = 'left';

  return hotspots;
}

/** Укладывает блоки сверху вниз, собирая по дороге места ссылок. */
function drawBlocks(
  context: CanvasRenderingContext2D,
  blocks: readonly PageBlock[],
  cursor: Cursor,
): PageHotspot[] {
  const hotspots: PageHotspot[] = [];
  let y = cursor.y;
  let previous: PageBlock | null = null;

  for (const block of blocks) {
    if (block.kind === 'list' && previous?.kind === 'list') y += LIST_TO_LIST;

    if (block.kind === 'text') {
      y = line(context, block.text, { ...cursor, y }, TEXT[block.role]);
    } else if (block.kind === 'list') {
      y = bullets(context, block.items, { ...cursor, y }, LIST[block.role]);
    } else {
      y = links(context, block.items, { ...cursor, y }, hotspots);
    }

    previous = block;
  }

  return hotspots;
}
