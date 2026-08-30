'use client';

import { useCallback, useRef, type RefObject } from 'react';

import type { Highlight } from '@/hooks/use-graph-painter';
import { clampCamera, type Camera } from '@/lib/tech-graph/camera';
import { clamp } from '@/lib/tech-graph/render';

/** Собственное вращение шара, рад/с. Оборот примерно за полторы минуты. */
const IDLE_SPIN = 0.07;
/** Предел скорости после броска или подталкивания курсором. */
const MAX_SPIN = 0.9;
/** Скорость возврата к спокойному вращению, доля в секунду. */
const SPIN_SETTLE = 1.1;
/** Плавность выхода на целевую скорость. */
const SPIN_EASE = 5;
/** Ниже этого шар считается стоящим и кадры больше не запрашиваются. */
const SPIN_EPSILON = 0.002;

/**
 * Знак рыскания: при росте `yaw` передняя сторона шара уезжает влево, поэтому
 * жест, инерция и собственный ход считают скорость в экранных направлениях и
 * переводятся в угол через этот множитель. «Вправо» везде значит вправо.
 */
export const YAW_DIRECTION = -1;

/**
 * Собственное вращение шара. Скорость тянется к цели, цель — к спокойному
 * значению, так что бросок плавно переходит в неспешный ход планеты.
 */
type Options = {
  cameraRef: RefObject<Camera>;
  highlightRef: RefObject<Highlight>;
  /** Идёт жест: собственное вращение на это время замирает. */
  interactingRef: RefObject<boolean>;
  autoSpin: boolean;
};

export function useGraphSpin({
  cameraRef,
  highlightRef,
  interactingRef,
  autoSpin,
}: Options) {
  /** Текущая угловая скорость шара, рад/с. */
  const spinRef = useRef({ yaw: IDLE_SPIN, pitch: 0 });
  /** Куда шар разгоняется: курсор и броски пишут сюда, скорость тянется следом. */
  const targetRef = useRef({ yaw: IDLE_SPIN, pitch: 0 });

  /** Двигает камеру за прошедшее время. `true`, пока шар ещё движется. */
  const applySpin = useCallback(
    (seconds: number): boolean => {
      if (!autoSpin || interactingRef.current) return false;

      const spin = spinRef.current;
      const target = targetRef.current;
      const settle = Math.min(1, SPIN_SETTLE * seconds);

      const paused = highlightRef.current.activeId !== null;
      const sign = target.yaw < 0 ? -1 : 1;
      target.yaw += (IDLE_SPIN * sign - target.yaw) * settle;
      target.pitch += (0 - target.pitch) * settle;

      const ease = Math.min(1, SPIN_EASE * seconds);
      spin.yaw += ((paused ? 0 : target.yaw) - spin.yaw) * ease;
      spin.pitch += ((paused ? 0 : target.pitch) - spin.pitch) * ease;

      if (Math.abs(spin.yaw) < SPIN_EPSILON && Math.abs(spin.pitch) < SPIN_EPSILON) {
        return false;
      }

      const camera = cameraRef.current;
      cameraRef.current = clampCamera({
        ...camera,
        yaw: camera.yaw + YAW_DIRECTION * spin.yaw * seconds,
        pitch: camera.pitch + spin.pitch * seconds,
      });
      return true;
    },
    [autoSpin, cameraRef, highlightRef, interactingRef],
  );

  /** Бросок: скорость жеста переходит в инерцию шара. */
  const push = (yaw: number, pitch: number) => {
    targetRef.current = {
      yaw: clamp(yaw, MAX_SPIN),
      pitch: clamp(pitch, MAX_SPIN * 0.5),
    };
    spinRef.current = { ...targetRef.current };
  };

  return { applySpin, push };
}
