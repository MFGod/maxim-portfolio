'use client';

import { useCallback, useRef, type RefObject } from 'react';

import {
  cardScale,
  depthFactor,
  projectPoint,
  type Camera,
  type ProjectedPoint,
  type Viewport,
} from '@/lib/tech-graph/camera';
import type { LayoutState } from '@/lib/tech-graph/layout';
import { depthOrder, edgePaths, sameOrder } from '@/lib/tech-graph/render';

/** Что подсвечено сейчас. Читает отрисовка, чтобы не перерисовывать React. */
export type Highlight = { activeId: string | null; neighbours: Set<string> };

/** Узлы SVG, в которые пишется кадр. Создаются в компоненте: их же вешает разметка. */
export type GraphLayers = {
  nodeLayerRef: RefObject<SVGGElement | null>;
  nodeElementsRef: RefObject<(SVGGElement | null)[]>;
  edgeLayersRef: RefObject<{
    far: SVGPathElement | null;
    near: SVGPathElement | null;
    active: SVGPathElement | null;
  }>;
  haloRef: RefObject<SVGCircleElement | null>;
};

type Options = GraphLayers & {
  cameraRef: RefObject<Camera>;
  viewportRef: RefObject<Viewport>;
  /** Базовый масштаб под размер сцены. Умножается на зум камеры. */
  baseZoomRef: RefObject<number>;
  simulationRef: RefObject<LayoutState | null>;
  highlightRef: RefObject<Highlight>;
};

/**
 * Отрисовка кадра: положение карточек, три пути связей и ореол активного узла
 * пишутся прямо в DOM. React в кадре не участвует — иначе поворот шара стоил бы
 * полного рендера сорока с лишним узлов.
 */
export function useGraphPainter({
  nodeLayerRef,
  nodeElementsRef,
  edgeLayersRef,
  haloRef,
  cameraRef,
  viewportRef,
  baseZoomRef,
  simulationRef,
  highlightRef,
}: Options) {
  const orderRef = useRef<number[]>([]);
  const frameRef = useRef(0);

  const paint = useCallback(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    const camera = cameraRef.current;
    const zoom = camera.zoom * baseZoomRef.current;
    const card = cardScale(baseZoomRef.current);
    const highlight = highlightRef.current;

    const points = simulation.nodes.map((node) =>
      projectPoint(node.position, camera, zoom, viewportRef.current),
    );

    points.forEach((point, index) => {
      const element = nodeElementsRef.current[index];
      if (!element) return;

      const scale = Math.min(1.18, Math.max(0.72, point.scale)) * card;
      element.setAttribute(
        'transform',
        `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) scale(${scale.toFixed(3)})`,
      );

      const id = simulation.nodes[index]?.id;
      const dimmed =
        highlight.activeId !== null &&
        id !== highlight.activeId &&
        !highlight.neighbours.has(id ?? '');
      element.style.opacity = (
        (0.4 + 0.6 * depthFactor(point.depth)) *
        (dimmed ? 0.2 : 1)
      ).toFixed(3);
    });

    restack(points, orderRef, nodeLayerRef.current, nodeElementsRef.current);

    const paths = edgePaths(points, simulation.links, {
      idAt: (index) => simulation.nodes[index]?.id,
      activeId: highlight.activeId,
    });
    edgeLayersRef.current.far?.setAttribute('d', paths.far);
    edgeLayersRef.current.near?.setAttribute('d', paths.near);
    edgeLayersRef.current.active?.setAttribute('d', paths.active);

    const halo = haloRef.current;
    if (!halo) return;

    const index = highlight.activeId
      ? simulation.nodes.findIndex((node) => node.id === highlight.activeId)
      : -1;
    const point = index >= 0 ? points[index] : null;
    if (point) {
      halo.setAttribute('cx', point.x.toFixed(1));
      halo.setAttribute('cy', point.y.toFixed(1));
      halo.style.opacity = '1';
    } else {
      halo.style.opacity = '0';
    }
  }, [
    baseZoomRef,
    cameraRef,
    edgeLayersRef,
    haloRef,
    highlightRef,
    nodeElementsRef,
    nodeLayerRef,
    simulationRef,
    viewportRef,
  ]);

  /** Откладывает отрисовку до ближайшего кадра: за кадр она нужна ровно одна. */
  const schedulePaint = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      paint();
    });
  }, [paint]);

  return { paint, schedulePaint };
}

/**
 * Переставляет карточки по глубине. Перестановок ровно столько, сколько узлов
 * реально поменялись местами: при повороте это единицы, а не все сорок четыре.
 */
function restack(
  points: ProjectedPoint[],
  orderRef: { current: number[] },
  layer: SVGGElement | null,
  elements: (SVGGElement | null)[],
) {
  if (!layer) return;

  const order = depthOrder(points);
  if (sameOrder(order, orderRef.current)) return;
  orderRef.current = order;

  let reference: ChildNode | null = null;
  for (let position = order.length - 1; position >= 0; position -= 1) {
    const element = elements[order[position]!];
    if (!element) continue;
    if (element.nextSibling !== reference) layer.insertBefore(element, reference);
    reference = element;
  }
}
