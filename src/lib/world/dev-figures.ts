/**
 * Расстановка фигур — инструмент подбора, брат `dev-shots.ts`.
 *
 * Расставляет человек, а живут координаты в `src/data/world-figures.ts`
 * (решение D4). Между подбором и данными нужен мост: поставить фигуру туда,
 * куда смотрит камера, подвинуть, повернуть, изменить рост — и выгрузить всё
 * готовым куском кода.
 *
 * Хранилище — `localStorage`: подбор идёт часами и переживает перезагрузки.
 * Оно чужое и ненадёжное, поэтому читаем с проверкой каждой записи, а отказ
 * записи не роняет вызов.
 *
 * Модуль ничего не знает про сцену: он про список фигур. Показывает их
 * `figures.ts`, связывает одно с другим `scene.ts`.
 */

import {
  FIGURE_CLIPS,
  FIGURE_MODELS,
  MAX_FIGURE_HEIGHT,
  MIN_FIGURE_HEIGHT,
  type FigureClip,
  type FigureModel,
  type WorldFigure,
} from '@/data/world-figures';

const STORE = 'world.dev.figures';

/**
 * Отдельный ключ под снятые фигуры.
 *
 * Расстановка из `src/data` заморожена, и удалить оттуда фигуру подбором
 * нельзя — можно только пометить её снятой. Пометки живут своим списком имён:
 * так черновик остаётся списком фигур, а не смесью фигур и надгробий.
 */
const DROPPED = 'world.dev.figures.dropped';

/** Приставка автоматических имён. Номер после неё продолжает нумерацию. */
const AUTO_PREFIX = 'фигура';

const AUTO_NAME = new RegExp(`^${AUTO_PREFIX}-(\\d+)$`);

/** Рост по умолчанию: между надгробием (0,3) и горшком (0,0765). */
export const DEFAULT_HEIGHT = 0.08;

const DEFAULT_MODEL: FigureModel = 'skeleton_warrior';
const DEFAULT_CLIP: FigureClip = 'Idle';

const round = (value: number): number => +value.toFixed(3);

/** Что можно задать при постановке и что — поправить потом. */
export type FigurePatch = {
  id?: string;
  model?: FigureModel;
  clip?: FigureClip;
  at?: readonly [number, number, number];
  turn?: number;
  height?: number;
};

function isPoint(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

/**
 * Годится ли запись из хранилища. Проверяется каждая: в `localStorage` могла
 * остаться фигура от прежней версии формата или с моделью, которой больше нет,
 * и одна порченая запись иначе роняет весь подбор.
 */
export function isFigure(value: unknown): value is WorldFigure {
  if (typeof value !== 'object' || value === null) return false;
  const figure = value as Partial<WorldFigure>;

  return (
    typeof figure.id === 'string' &&
    typeof figure.model === 'string' &&
    figure.model in FIGURE_MODELS &&
    typeof figure.clip === 'string' &&
    (FIGURE_CLIPS as readonly string[]).includes(figure.clip) &&
    isPoint(figure.at) &&
    typeof figure.turn === 'number' &&
    Number.isFinite(figure.turn) &&
    typeof figure.height === 'number' &&
    figure.height >= MIN_FIGURE_HEIGHT &&
    figure.height <= MAX_FIGURE_HEIGHT
  );
}

function read(): WorldFigure[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isFigure) : [];
  } catch {
    return [];
  }
}

/**
 * Пишет список фигур.
 *
 * @returns удалось ли сохранить. Отказ хранилища — не повод падать посреди
 *   подбора: фигура всё равно встанет в сцену, просто не переживёт перезагрузку.
 */
function write(figures: WorldFigure[]): boolean {
  if (typeof localStorage === 'undefined') return false;

  try {
    localStorage.setItem(STORE, JSON.stringify(figures));
    return true;
  } catch {
    console.warn('Фигура не сохранена: хранилище недоступно или переполнено');
    return false;
  }
}

/** Следующий свободный номер автоматического имени. */
function nextAutoNumber(figures: WorldFigure[]): number {
  const used = figures
    .map((figure) => AUTO_NAME.exec(figure.id)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .filter(Number.isFinite);

  return (used.length ? Math.max(...used) : 0) + 1;
}

/** Рост держим в разумных пределах: иначе фигура либо невидима, либо с башню. */
const clampHeight = (height: number): number =>
  Math.min(Math.max(height, MIN_FIGURE_HEIGHT), MAX_FIGURE_HEIGHT);

/**
 * Ставит фигуру. Точка — из `patch.at`, иначе та, куда смотрит камера.
 *
 * Фигура с уже занятым `id` заменяется: подбор — это уточнение одной фигуры,
 * а не размножение её копий.
 */
export function placeFigure(
  at: readonly [number, number, number],
  patch: FigurePatch = {},
) {
  const figures = read();
  const point = patch.at ?? at;

  const figure: WorldFigure = {
    id: patch.id ?? `${AUTO_PREFIX}-${nextAutoNumber(figures)}`,
    model: patch.model ?? DEFAULT_MODEL,
    clip: patch.clip ?? DEFAULT_CLIP,
    at: [round(point[0]), round(point[1]), round(point[2])],
    turn: round(patch.turn ?? 0),
    height: round(clampHeight(patch.height ?? DEFAULT_HEIGHT)),
  };

  write([...figures.filter((item) => item.id !== figure.id), figure]);
  return figure;
}

/** Правит поставленную фигуру. @returns новая запись или `null`, если такой нет. */
export function tweakFigure(id: string, patch: FigurePatch): WorldFigure | null {
  const figures = read();
  const found = figures.find((item) => item.id === id);
  if (!found) return null;

  const next: WorldFigure = {
    ...found,
    ...(patch.model ? { model: patch.model } : {}),
    ...(patch.clip ? { clip: patch.clip } : {}),
    ...(patch.at
      ? { at: [round(patch.at[0]), round(patch.at[1]), round(patch.at[2])] }
      : {}),
    ...(patch.turn === undefined ? {} : { turn: round(patch.turn) }),
    ...(patch.height === undefined ? {} : { height: round(clampHeight(patch.height)) }),
    ...(patch.id ? { id: patch.id } : {}),
  };

  write(figures.map((item) => (item.id === id ? next : item)));
  return next;
}

export function listFigures(): WorldFigure[] {
  return read();
}

function readDropped(): string[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(DROPPED);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeDropped(ids: string[]): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(DROPPED, JSON.stringify(ids));
  } catch {
    console.warn('Пометка не сохранена: хранилище недоступно или переполнено');
  }
}

/** Имена фигур, снятых из утверждённой расстановки. */
export function droppedFigures(): string[] {
  return readDropped();
}

/**
 * Берёт фигуру из данных в черновик как есть.
 *
 * Правка утверждённой расстановки начинается отсюда: копия ложится в
 * `localStorage`, дальше её двигают обычным `tweakFigure`, а при показе она
 * перебивает исходную по имени.
 *
 * @returns копия или та, что уже была в черновике
 */
export function adoptFigure(figure: WorldFigure): WorldFigure {
  const figures = read();
  const known = figures.find((item) => item.id === figure.id);
  if (known) return known;

  const copy: WorldFigure = { ...figure, at: [...figure.at] as WorldFigure['at'] };
  write([...figures, copy]);
  return copy;
}

/**
 * Убирает фигуру из мира.
 *
 * Черновая просто исчезает, а пришедшая из данных остаётся в файле — её имя
 * уходит в список снятых, и показ её пропускает.
 *
 * @returns была ли она вообще
 */
export function removeFigure(id: string): boolean {
  const figures = read();
  const next = figures.filter((item) => item.id !== id);
  const dropped = readDropped();

  if (!dropped.includes(id)) writeDropped([...dropped, id]);
  if (next.length !== figures.length) write(next);

  return true;
}

/** Забывает весь черновик: и правки, и пометки о снятии. */
export function clearFigures(): void {
  write([]);
  writeDropped([]);
}

/** Готовый кусок для `src/data/world-figures.ts` из любого списка фигур. */
export function formatFigures(figures: readonly WorldFigure[]): string {
  return figures
    .map((figure) => {
      // Имя задаёт человек, и апостроф в нём порвал бы строковый литерал.
      const id = figure.id.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
      return (
        `  {\n` +
        `    id: '${id}',\n` +
        `    model: '${figure.model}',\n` +
        `    clip: '${figure.clip}',\n` +
        `    at: [${figure.at.join(', ')}],\n` +
        `    turn: ${figure.turn},\n` +
        `    height: ${figure.height},\n` +
        `  },`
      );
    })
    .join('\n');
}

/** То же, но только по черновику. */
export function exportFigures(): string {
  return formatFigures(read());
}

/** Начало файла данных: всё до самого массива. */
const FIGURES_ANCHOR = 'export const worldFigures';

/**
 * Собирает новое содержимое `src/data/world-figures.ts`.
 *
 * Шапка файла — типы, список моделей, клипы и объяснение, откуда взялись
 * координаты — сохраняется как есть: меняется только массив. Так правка мышью
 * не стирает то, что писалось руками.
 */
export function figuresFileBody(
  current: string,
  figures: readonly WorldFigure[],
): string {
  const cut = current.indexOf(FIGURES_ANCHOR);
  if (cut < 0) throw new Error('в файле данных нет worldFigures');

  const head = current.slice(0, cut);
  return `${head}${FIGURES_ANCHOR}: WorldFigure[] = deepFreeze([\n${formatFigures(figures)}\n]);\n`;
}
