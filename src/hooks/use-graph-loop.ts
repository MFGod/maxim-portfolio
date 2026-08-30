'use client';

import { useEffect, useRef, type RefObject } from 'react';

import {
  ALPHA_MIN,
  ALPHA_REHEAT,
  reheat,
  settleLayout,
  stepSimulation,
  type LayoutState,
} from '@/lib/tech-graph/layout';

type Options = {
  simulationRef: RefObject<LayoutState | null>;
  /** Вне экрана шар не крутится: незачем греть кадры ради того, чего не видно. */
  visibleRef: RefObject<boolean>;
  /** Симуляция и её оседание. Выключается настройкой движения. */
  animated: boolean;
  /** Собственное вращение: `true`, пока шар ещё движется. */
  applySpin: (seconds: number) => boolean;
  paint: () => void;
  fitToViewport: () => void;
};

/**
 * Цикл кадров: шаг симуляции, вращение, отрисовка. Кадры запрашиваются только
 * пока есть что двигать — остывшая раскладка на неподвижном шаре их не тратит.
 */
export function useGraphLoop({
  simulationRef,
  visibleRef,
  animated,
  applySpin,
  paint,
  fitToViewport,
}: Options) {
  const startLoopRef = useRef<() => void>(() => {});
  const reheatRef = useRef<() => void>(() => {});

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    let frame = 0;
    let running = false;
    let previous = 0;
    let framed = false;

    const loop = (time: number) => {
      const seconds = previous ? Math.min(0.05, (time - previous) / 1000) : 1 / 60;
      previous = time;

      const hot = animated && simulation.alpha > ALPHA_MIN;
      if (hot) stepSimulation(simulation);
      else if (!framed) {
        framed = true;
        fitToViewport();
      }

      const spinning = applySpin(seconds);
      paint();

      if (hot || spinning) {
        frame = requestAnimationFrame(loop);
      } else {
        running = false;
        frame = 0;
        previous = 0;
      }
    };

    const start = () => {
      if (running || !visibleRef.current) return;
      running = true;
      previous = 0;
      frame = requestAnimationFrame(loop);
    };

    startLoopRef.current = start;

    reheatRef.current = () => {
      if (!animated) {
        settleLayout(simulation);
        fitToViewport();
        paint();
        return;
      }
      reheat(simulation, ALPHA_REHEAT);
      start();
    };

    if (!animated) {
      settleLayout(simulation);
      fitToViewport();
      framed = true;
    }
    paint();
    start();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      running = false;
      reheatRef.current = () => {};
      startLoopRef.current = () => {};
    };
  }, [animated, applySpin, fitToViewport, paint, simulationRef, visibleRef]);

  return { startLoopRef, reheatRef };
}
