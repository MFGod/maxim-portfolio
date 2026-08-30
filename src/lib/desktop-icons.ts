import type { Workspace } from '@/lib/window-manager/types';
import { intersects, type Rect } from '@/lib/selection';

export type IconPosition = { x: number; y: number };
export type IconPositions = Record<string, IconPosition>;

/**
 * Габарит ярлыка и шаг колонки. Ширину задаёт настройка «Размер значков», всё
 * остальное считается от неё: подпись под значком добавляет к высоте немного,
 * а колонка расходится ещё на просвет между ярлыками.
 */
export type IconMetrics = { width: number; height: number; step: number };

/** Просвет между ярлыками в раскладке по умолчанию. */
const COLUMN_GAP = 8;

/** Плитка квадратная: подпись масштабируется вместе со значком. */
export function iconMetrics(size: number): IconMetrics {
  return { width: size, height: size, step: size + COLUMN_GAP };
}

/** Шаг сетки привязки. Кратен базовому интервалу интерфейса. */
const ICON_SNAP = 12;

export const ICON_STORAGE_KEY = 'portfolio:desktop-icons';

/**
 * Зона под Hero в центре рабочей области. У ярлыков тот же
 * `z-(--z-desktop-icons)`, поэтому без исключения они встают поверх текста.
 * Внутри только заголовок, роль и описание — отсюда узкая зона.
 */
const HERO_KEEPOUT = { width: 460, height: 190 };

export function snapToGrid(value: number): number {
  return Math.round(value / ICON_SNAP) * ICON_SNAP;
}

function heroKeepoutRect(workspace: Workspace) {
  const width = Math.min(HERO_KEEPOUT.width, workspace.width);
  const height = Math.min(HERO_KEEPOUT.height, workspace.height);
  return {
    x: workspace.x + (workspace.width - width) / 2,
    y: workspace.y + (workspace.height - height) / 2,
    width,
    height,
  };
}

/**
 * Выталкивает ярлык из зоны Hero к ближайшему краю по горизонтали. Сторона
 * выбирается по близости, но только если ярлык туда помещается: на узком
 * экране ближайший край вынес бы его за рабочую область. Не помещается ни
 * слева, ни справа — позиция остаётся исходной.
 */
function avoidHero(
  position: IconPosition,
  workspace: Workspace,
  metrics: IconMetrics,
): IconPosition {
  const hero = heroKeepoutRect(workspace);
  const overlaps =
    position.x < hero.x + hero.width &&
    position.x + metrics.width > hero.x &&
    position.y < hero.y + hero.height &&
    position.y + metrics.height > hero.y;
  if (!overlaps) return position;

  const left = hero.x - metrics.width;
  const right = hero.x + hero.width;
  const fitsLeft = left >= workspace.x;
  const fitsRight = right + metrics.width <= workspace.x + workspace.width;

  const iconCenterX = position.x + metrics.width / 2;
  const heroCenterX = hero.x + hero.width / 2;
  const nearestIsLeft = iconCenterX < heroCenterX;

  if (nearestIsLeft && fitsLeft) return { x: left, y: position.y };
  if (!nearestIsLeft && fitsRight) return { x: right, y: position.y };
  if (fitsLeft) return { x: left, y: position.y };
  if (fitsRight) return { x: right, y: position.y };
  return position;
}

/**
 * Прижимает ярлык к границам рабочей области. Без учёта Hero: вызывается на
 * каждом кадре перетаскивания, и выталкивание сделало бы центр непроходимым.
 */
export function clampIconPosition(
  position: IconPosition,
  workspace: Workspace,
  metrics: IconMetrics,
): IconPosition {
  const maxX = workspace.x + workspace.width - metrics.width;
  const maxY = workspace.y + workspace.height - metrics.height;
  return {
    x: Math.round(
      Math.min(Math.max(position.x, workspace.x), Math.max(maxX, workspace.x)),
    ),
    y: Math.round(
      Math.min(Math.max(position.y, workspace.y), Math.max(maxY, workspace.y)),
    ),
  };
}

/**
 * Сдвигает группу ярлыков на общее смещение: привязка к сетке и границы
 * рабочей области. Общий шаг для перетаскивания и для стрелок — разница между
 * ними только в источнике смещения.
 */
export function shiftPositions(
  starts: IconPositions,
  delta: { dx: number; dy: number },
  workspace: Workspace,
  metrics: IconMetrics,
): IconPositions {
  const next: IconPositions = {};
  for (const [key, start] of Object.entries(starts)) {
    next[key] = clampIconPosition(
      { x: snapToGrid(start.x + delta.dx), y: snapToGrid(start.y + delta.dy) },
      workspace,
      metrics,
    );
  }
  return next;
}

/** Префикс ключа: у программ ключ — их идентификатор, у файлов — с префиксом. */
const FILE_KEY_PREFIX = 'file:';

/**
 * Ключ позиции ярлыка файла. У программ это их идентификатор — так сохранённые
 * раскладки переживают появление файлов.
 */
export function fileKey(id: string): string {
  return `${FILE_KEY_PREFIX}${id}`;
}

/** Идентификатор файла из ключа ярлыка. Ярлык программы — не файл. */
export function fileIdOf(key: string): string | null {
  return key.startsWith(FILE_KEY_PREFIX) ? key.slice(FILE_KEY_PREFIX.length) : null;
}

/** Только файлы группы: ярлыки программ нельзя ни удалить, ни перенести. */
export function fileIdsOf(keys: Iterable<string>): string[] {
  const ids: string[] = [];
  for (const key of keys) {
    const id = fileIdOf(key);
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Позиция для автоматической раскладки: в границах рабочей области и вне зоны
 * Hero. Только для расчёта раскладки по умолчанию — там ярлык ставит программа,
 * и накрывать им заголовок нельзя.
 */
export function layoutIconPosition(
  position: IconPosition,
  workspace: Workspace,
  metrics: IconMetrics,
): IconPosition {
  return clampIconPosition(
    avoidHero(clampIconPosition(position, workspace, metrics), workspace, metrics),
    workspace,
    metrics,
  );
}

/**
 * Раскладка по умолчанию: колонки вдоль левого края рабочей области. Колонка
 * упёрлась в низ — следующий ярлык уходит правее, иначе на невысоких экранах
 * хвост списка схлопнется у нижней границы.
 */
export function defaultPositions(
  ids: string[],
  workspace: Workspace,
  metrics: IconMetrics,
): IconPositions {
  const positions: IconPositions = {};
  const rows = Math.max(1, Math.floor(workspace.height / metrics.step));
  ids.forEach((id, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    positions[id] = layoutIconPosition(
      { x: workspace.x + column * metrics.step, y: workspace.y + row * metrics.step },
      workspace,
      metrics,
    );
  });
  return positions;
}

/**
 * Ярлык под точкой: попадание считается по прямоугольнику ярлыка. Нужно, чтобы
 * при перетаскивании понять, над какой папкой отпустили файл — без обращения к
 * DOM, по тем же координатам, что рисуют ярлыки.
 */
export function findIconAt(
  positions: IconPositions,
  ids: string[],
  point: IconPosition,
  metrics: IconMetrics,
): string | null {
  for (const id of ids) {
    const position = positions[id];
    if (!position) continue;
    const hit =
      point.x >= position.x &&
      point.x <= position.x + metrics.width &&
      point.y >= position.y &&
      point.y <= position.y + metrics.height;
    if (hit) return id;
  }
  return null;
}

/**
 * Ярлыки, которых коснулась рамка выделения. Как и `findIconAt`, считается по
 * координатам ярлыков, без обращения к DOM.
 */
export function iconsInRect(
  positions: IconPositions,
  ids: string[],
  rect: Rect,
  metrics: IconMetrics,
): string[] {
  return ids.filter((id) => {
    const position = positions[id];
    if (!position) return false;
    return intersects(rect, {
      ...position,
      width: metrics.width,
      height: metrics.height,
    });
  });
}

function isPosition(value: unknown): value is IconPosition {
  if (typeof value !== 'object' || value === null) return false;
  const { x, y } = value as Record<string, unknown>;
  return (
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y)
  );
}

/**
 * Содержимое localStorage — внешние данные. Берём только известные
 * идентификаторы и только валидные координаты.
 */
export function parseStoredPositions(
  raw: string | null,
  knownIds: string[],
): IconPositions {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null) return {};

  const allowed = new Set(knownIds);
  const result: IconPositions = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (allowed.has(id) && isPosition(value)) result[id] = { x: value.x, y: value.y };
  }
  return result;
}

/** Сохранённые позиции поверх раскладки по умолчанию, всё в границах экрана. */
export function resolvePositions(
  ids: string[],
  stored: IconPositions,
  workspace: Workspace,
  metrics: IconMetrics,
): IconPositions {
  const positions = defaultPositions(ids, workspace, metrics);
  for (const id of ids) {
    const saved = stored[id];
    if (saved) positions[id] = clampIconPosition(saved, workspace, metrics);
  }
  return positions;
}
