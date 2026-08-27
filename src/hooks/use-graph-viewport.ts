'use client';

import { useEffect, useRef, type RefObject } from 'react';

import { cardScale, fitZoom, type Viewport } from '@/lib/tech-graph/camera';
import { setSpacing, type LayoutState } from '@/lib/tech-graph/layout';

type Options = {
  containerRef: RefObject<HTMLElement | null>;
  svgRef: RefObject<SVGSVGElement | null>;
  viewportRef: RefObject<Viewport>;
  baseZoomRef: RefObject<number>;
  simulationRef: RefObject<LayoutState | null>;
  /** Взводится, когда сцена на экране: за ним следит цикл кадров. */
  visibleRef: RefObject<boolean>;
  schedulePaint: () => void;
  fitToViewport: () => void;
  /** Расстояния между узлами зависят от размера сцены — после смены нужен разогрев. */
  reheat: () => void;
  startLoop: () => void;
};

/**
 * Размер сцены и её видимость. Наблюдатели создаются один раз: пересоздание на
 * каждом рендере отменяло бы их единственный вызов. Первый замер снимается
 * синхронно — в фоновой вкладке ResizeObserver молчит, а сцена нужна с
 * правильным размером сразу.
 */
export function useGraphViewport({
  containerRef,
  svgRef,
  viewportRef,
  baseZoomRef,
  simulationRef,
  visibleRef,
  schedulePaint,
  fitToViewport,
  reheat,
  startLoop,
}: Options) {
  // Обработчики читаются из ссылки: наблюдатели переживают их пересоздание.
  const handlersRef = useRef({ schedulePaint, fitToViewport, reheat, startLoop });
  useEffect(() => {
    handlersRef.current = { schedulePaint, fitToViewport, reheat, startLoop };
  }, [fitToViewport, reheat, schedulePaint, startLoop]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const apply = (width: number, height: number) => {
      if (width < 1 || height < 1) return;
      const viewport = { width: Math.round(width), height: Math.round(height) };
      if (
        viewport.width === viewportRef.current.width &&
        viewport.height === viewportRef.current.height
      ) {
        return;
      }

      viewportRef.current = viewport;
      const base = fitZoom(viewport);
      baseZoomRef.current = base;
      svgRef.current?.setAttribute(
        'viewBox',
        `0 0 ${viewport.width} ${viewport.height}`,
      );

      const simulation = simulationRef.current;
      if (simulation && setSpacing(simulation, cardScale(base) / base)) {
        handlersRef.current.reheat();
      } else {
        handlersRef.current.fitToViewport();
      }
      handlersRef.current.schedulePaint();
    };

    const rect = container.getBoundingClientRect();
    apply(rect.width, rect.height);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) apply(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);

    // Вне экрана шар не крутится: незачем греть кадры ради того, чего не видно.
    const visibility = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry?.isIntersecting ?? true;
      if (visibleRef.current) handlersRef.current.startLoop();
    });
    visibility.observe(container);

    return () => {
      observer.disconnect();
      visibility.disconnect();
    };
  }, [baseZoomRef, containerRef, simulationRef, svgRef, viewportRef, visibleRef]);
}
