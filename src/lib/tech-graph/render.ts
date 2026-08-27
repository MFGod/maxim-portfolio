import {
  ZOOM_RANGE,
  cardScale,
  clampCamera,
  projectPoint,
  type Camera,
  type ProjectedPoint,
  type Viewport,
} from '@/lib/tech-graph/camera';
import type { LayoutLink, LayoutNode } from '@/lib/tech-graph/layout';
import type { TechEdge, TechNode } from '@/data/tech-graph';

/** Высота карточки узла. Ширину задаёт подпись. */
export const NODE_HEIGHT = 28;
/** Средняя ширина знака моноширинного шрифта карточки. */
const CHAR_WIDTH = 7.1;
/** Поля карточки по горизонтали. */
const LABEL_PADDING = 26;

/** Ширина карточки под подпись: считается без обращения к DOM. */
export function nodeWidth(label: string): number {
  return label.length * CHAR_WIDTH + LABEL_PADDING;
}

/** Ограничивает значение симметричным пределом. */
export function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

/** Отрезок связи в команде пути SVG. Координаты округляются: доли пикселя не видны. */
function segment(from: ProjectedPoint, to: ProjectedPoint): string {
  return `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}

/** Три пути связей: за шаром, перед ним и подсвеченные у активного узла. */
export type EdgePaths = { far: string; near: string; active: string };

/**
 * Связи, сведённые в три пути вместо шести десятков линий: один узел SVG на
 * слой — это и меньше записей в DOM, и меньше работы растеризатору на каждом
 * кадре поворота. Связь уходит в `far`, когда её середина за центром шара.
 */
export function edgePaths(
  points: ProjectedPoint[],
  links: readonly LayoutLink[],
  /** Идентификатор узла по индексу и подсвеченный узел. Без него активных связей нет. */
  options: {
    idAt?: (index: number) => string | undefined;
    activeId?: string | null;
  } = {},
): EdgePaths {
  const { idAt, activeId = null } = options;
  const paths: EdgePaths = { far: '', near: '', active: '' };

  for (const link of links) {
    const from = points[link.source];
    const to = points[link.target];
    if (!from || !to) continue;

    const line = segment(from, to);
    const touchesActive =
      activeId !== null &&
      (idAt?.(link.source) === activeId || idAt?.(link.target) === activeId);

    if (touchesActive) paths.active += line;
    else if ((from.depth + to.depth) / 2 > 0) paths.far += line;
    else paths.near += line;
  }

  return paths;
}

/**
 * Порядок отрисовки узлов: ближние рисуются последними — иначе дальняя карточка
 * перекрывает ближнюю, и глубина читается наоборот.
 */
export function depthOrder(points: ProjectedPoint[]): number[] {
  return points
    .map((point, index) => ({ index, depth: point.depth }))
    .sort((a, b) => b.depth - a.depth)
    .map((entry) => entry.index);
}

/** Совпадают ли два порядка отрисовки: при повороте меняются единицы позиций. */
export function sameOrder(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((index, position) => b[position] === index);
}

/** Поле между графом и краем сцены при автоподгонке. */
const FIT_MARGIN = 40;

/**
 * Камера, при которой граф целиком помещается в сцену. Габарит считается по
 * карточкам, а не по точкам: подпись у края не должна уезжать за границу.
 * Возвращает исходную камеру, когда габарит вырожденный — подгонять нечего.
 */
export function fitCamera(
  nodes: readonly LayoutNode[],
  labelOf: (id: string) => string,
  camera: Camera,
  baseZoom: number,
  viewport: Viewport,
): Camera {
  const card = cardScale(baseZoom);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const point = projectPoint(node.position, camera, camera.zoom * baseZoom, viewport);
    const halfWidth = (nodeWidth(labelOf(node.id)) / 2) * card;
    const halfHeight = (NODE_HEIGHT / 2) * card;
    minX = Math.min(minX, point.x - halfWidth);
    maxX = Math.max(maxX, point.x + halfWidth);
    minY = Math.min(minY, point.y - halfHeight);
    maxY = Math.max(maxY, point.y + halfHeight);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || width <= 0 || height <= 0) return camera;

  const factor = Math.min(
    (viewport.width - FIT_MARGIN * 2) / width,
    (viewport.height - FIT_MARGIN * 2) / height,
    ZOOM_RANGE.max / camera.zoom,
  );

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return clampCamera({
    ...camera,
    zoom: camera.zoom * factor,
    panX: -(centerX - viewport.width / 2 - camera.panX) * factor,
    panY: -(centerY - viewport.height / 2 - camera.panY) * factor,
  });
}

/** Соседи каждого узла: по ним подсвечиваются связи активной карточки. */
export function neighbourMap(
  nodes: readonly TechNode[],
  edges: readonly TechEdge[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const node of nodes) map.set(node.id, new Set());
  for (const edge of edges) {
    map.get(edge.source)?.add(edge.target);
    map.get(edge.target)?.add(edge.source);
  }
  return map;
}
