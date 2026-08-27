import { describe, expect, it } from 'vitest';

import {
  driftYaw,
  idlePhase,
  DRIFT_AFTER,
  DRIFT_EASE,
  DRIFT_SPEED,
  REST_AFTER,
} from '@/lib/world/idle';

/** Кадр при шестидесяти в секунду. */
const FRAME = 1 / 60;

describe('покой мира', () => {
  it('пока трогают — ничего не происходит', () => {
    expect(idlePhase(0)).toBe('active');
    expect(idlePhase(DRIFT_AFTER - 0.1)).toBe('active');
  });

  it('через порог камера поводит взглядом', () => {
    expect(idlePhase(DRIFT_AFTER)).toBe('drift');
    expect(idlePhase(REST_AFTER - 0.1)).toBe('drift');
  });

  it('через минуту с четвертью мир уходит в облёт', () => {
    expect(idlePhase(REST_AFTER)).toBe('rest');
    expect(idlePhase(REST_AFTER + 600)).toBe('rest');
  });

  it('пороги идут по возрастанию', () => {
    // Иначе облёт включался бы раньше поворота и ступень «дышащего кадра»
    // пропадала бы вовсе.
    expect(DRIFT_AFTER).toBeLessThan(REST_AFTER);
  });
});

describe('поворот взгляда в покое', () => {
  it('до порога взгляд стоит', () => {
    expect(driftYaw(0, FRAME)).toBe(0);
    expect(driftYaw(DRIFT_AFTER - 0.01, FRAME)).toBe(0);
  });

  it('трогается с нуля, а не рывком', () => {
    // Рывок ровно на двадцатой секунде читается сбоем, а не движением.
    expect(driftYaw(DRIFT_AFTER, FRAME)).toBe(0);
    expect(driftYaw(DRIFT_AFTER + 0.5, FRAME)).toBeGreaterThan(0);
  });

  it('разгон идёт вверх и упирается в полную скорость', () => {
    const early = driftYaw(DRIFT_AFTER + 1, FRAME);
    const later = driftYaw(DRIFT_AFTER + 3, FRAME);
    const full = driftYaw(DRIFT_AFTER + DRIFT_EASE, FRAME);

    expect(later).toBeGreaterThan(early);
    expect(full).toBeCloseTo(DRIFT_SPEED * FRAME, 10);
    expect(driftYaw(DRIFT_AFTER + DRIFT_EASE + 10, FRAME)).toBeCloseTo(full, 10);
  });

  it('на облёте камеру не трогает: её ведёт риг', () => {
    expect(driftYaw(REST_AFTER, FRAME)).toBe(0);
    expect(driftYaw(REST_AFTER + 30, FRAME)).toBe(0);
  });

  it('скорость не зависит от частоты кадров', () => {
    // За секунду поворот один и тот же, сколькими бы кадрами её ни набрали.
    const idle = DRIFT_AFTER + DRIFT_EASE + 1;
    const oneStep = driftYaw(idle, 1);
    const sixty = Array.from({ length: 60 }, () => driftYaw(idle, FRAME)).reduce(
      (sum, step) => sum + step,
      0,
    );

    expect(sixty).toBeCloseTo(oneStep, 10);
  });
});
