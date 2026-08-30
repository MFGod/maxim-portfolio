'use client';

import { useRef, useState } from 'react';

import { useTranslate } from '@/lib/i18n';

/** Экранный стик для режима «от первого лица». */
type Props = {
  /** Оба значения в пределах −1…1: `x` вбок, `z` вперёд-назад. */
  onMove: (x: number, z: number) => void;
};

/** Радиус хода ручки в пикселях. Дальше отклонение упирается в единицу. */
const RADIUS = 34;

export function WorldStick({ onMove }: Props) {
  const t = useTranslate();
  const padRef = useRef<HTMLDivElement>(null);
  /**
   * Палец, который сейчас держит стик. Свой учёт, а не `hasPointerCapture`:
   * второй палец на экране приходит в тот же обработчик, и без этого ход
   * дёргался бы между двумя касаниями.
   */
  const activeRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  /**
   * Центр берётся у самой площадки, а не у точки нажатия: иначе стик каждый
   * раз переезжал бы под палец и ход зависел бы от того, куда попали.
   */
  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const pad = padRef.current;
    if (!pad) return;

    const box = pad.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);

    const distance = Math.hypot(dx, dy);
    const scale = distance > RADIUS ? RADIUS / distance : 1;
    const x = dx * scale;
    const y = dy * scale;

    setKnob({ x, y });
    onMove(x / RADIUS, y / RADIUS);
  };

  const release = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeRef.current !== event.pointerId) return;

    activeRef.current = null;
    try {
      padRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // Указатель успели отпустить: захвата уже нет, и снимать нечего.
    }
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={padRef}
      role="application"
      aria-label={t('world.stick.label')}
      onPointerDown={(event) => {
        if (activeRef.current !== null) return;

        activeRef.current = event.pointerId;
        try {
          padRef.current?.setPointerCapture(event.pointerId);
        } catch {
          // Захват — удобство, а не условие: без него стик работает, пока
          // палец не ушёл за границы площадки.
        }
        track(event);
      }}
      onPointerMove={(event) => {
        if (activeRef.current !== event.pointerId) return;
        track(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      className="border-book-rule bg-glass-book absolute bottom-5 left-4 size-24 touch-none rounded-full border shadow-sm backdrop-blur-sm"
    >
      <span
        aria-hidden
        className="bg-book-accent/80 absolute top-1/2 left-1/2 size-9 rounded-full"
        style={{
          transform: `translate3d(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px), 0)`,
        }}
      />
    </div>
  );
}
