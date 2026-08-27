'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Счётчик кадров. Живёт только в разработке.
 *
 * Считает кадры браузера, а не отрисовки сцены: цикл мира сидит на том же
 * `requestAnimationFrame`, и расхождение между ними означало бы, что кадры
 * теряет не сцена, а вкладка, — а это тоже надо видеть.
 *
 * Заодно ловит случай, когда кадров нет вовсе: панель предпросмотра, уйдя в
 * фон, замораживает `requestAnimationFrame` целиком, и тогда «стоящая
 * анимация» — свойство панели, а не книги. На этом уже был потерян час.
 */
const SAMPLE_MS = 500;

/** Пороги, ниже которых счётчик меняет цвет: плавно, приемлемо, рвано. */
const SMOOTH = 50;
const ROUGH = 30;

export function WorldFps() {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let frames = 0;
    let since = performance.now();
    let frame = requestAnimationFrame(function tick() {
      frames += 1;

      const now = performance.now();
      if (now - since >= SAMPLE_MS) {
        setFps(Math.round((frames * 1000) / (now - since)));
        frames = 0;
        since = now;
      }

      frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <p
      className={cn(
        'text-2xs pointer-events-none absolute top-3 left-3 rounded-sm bg-black/70 px-2 py-1 font-mono',
        fps === null || fps >= SMOOTH
          ? 'text-white'
          : fps >= ROUGH
            ? 'text-amber-300'
            : 'text-red-400',
      )}
    >
      {fps === null ? '— fps' : `${fps} fps`}
    </p>
  );
}
