'use client';

import { useEffect, useState } from 'react';

import { loadDuration, toMegabytes } from '@/lib/runtime/environment';

/** Нестандартное расширение Chromium. В типах браузера его нет. */
type MemoryInfo = { usedJSHeapSize: number; jsHeapSizeLimit: number };

/** Период публикации показателей. Он же окно усреднения FPS. */
const SAMPLE_MS = 1000;

type LiveMetrics = {
  /** Кадров в секунду. `null` — вкладка скрыта, кадров нет. */
  fps: number | null;
  /** Использовано и доступно куче, МБ. `null` — API нет (все, кроме Chromium). */
  memory: { used: number; limit: number } | null;
  /** Полная загрузка страницы, мс. `null` — Navigation Timing недоступен. */
  loadMs: number | null;
};

function readMemory(): LiveMetrics['memory'] {
  const info = (performance as Performance & { memory?: MemoryInfo }).memory;
  if (!info) return null;
  return {
    used: toMegabytes(info.usedJSHeapSize),
    limit: toMegabytes(info.jsHeapSizeLimit),
  };
}

function readLoadMs(): number | null {
  const [entry] = performance.getEntriesByType('navigation');
  return loadDuration(entry as PerformanceNavigationTiming | undefined);
}

/**
 * Живые показатели рантайма. Кадры считает `requestAnimationFrame`, публикует
 * таймер раз в секунду вместе с памятью и временем загрузки. Недоступный
 * показатель остаётся `null`, окно печатает «Недоступно».
 */
export function useLiveMetrics(): LiveMetrics {
  const [metrics, setMetrics] = useState<LiveMetrics>({
    fps: null,
    memory: null,
    loadMs: null,
  });

  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let raf = 0;

    const count = () => {
      frames += 1;
      raf = requestAnimationFrame(count);
    };

    const startCounting = () => {
      frames = 0;
      windowStart = performance.now();
      raf = requestAnimationFrame(count);
    };

    const stopCounting = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const publish = () => {
      const now = performance.now();
      const elapsed = now - windowStart;
      const visible = document.visibilityState === 'visible';
      const fps = visible && elapsed > 0 ? Math.round((frames * 1000) / elapsed) : null;
      frames = 0;
      windowStart = now;
      setMetrics({ fps, memory: readMemory(), loadMs: readLoadMs() });
    };

    const onVisibility = () => {
      stopCounting();
      if (document.visibilityState === 'visible') startCounting();
    };

    if (document.visibilityState === 'visible') startCounting();
    const first = window.setTimeout(publish, 0);
    const timer = window.setInterval(publish, SAMPLE_MS);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopCounting();
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return metrics;
}
