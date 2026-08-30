import { describe, expect, it } from 'vitest';

import { frameDelta, MAX_FRAME_SECONDS } from '@/lib/world/frame';
import { idlePhase, REST_AFTER } from '@/lib/world/idle';

/** Кадр при шестидесяти в секунду. */
const FRAME = 1 / 60;

describe('дельта кадра', () => {
  it('обычный кадр проходит как есть', () => {
    expect(frameDelta(FRAME)).toBe(FRAME);
    expect(frameDelta(1 / 30)).toBe(1 / 30);
  });

  it('честная просадка не замедляется', () => {
    expect(frameDelta(MAX_FRAME_SECONDS)).toBe(MAX_FRAME_SECONDS);
  });

  it('пропущенное время режется потолком', () => {
    expect(frameDelta(600)).toBe(MAX_FRAME_SECONDS);
  });

  it('ноль, минус и нечисло дают неподвижный кадр', () => {
    expect(frameDelta(0)).toBe(0);
    expect(frameDelta(-5)).toBe(0);
    expect(frameDelta(Number.NaN)).toBe(0);
  });

  it('одного кадра после скрытой вкладки не хватает на облёт', () => {
    const hidden = 10 * 60;

    expect(idlePhase(hidden)).toBe('rest');
    expect(idlePhase(frameDelta(hidden))).toBe('active');
  });

  it('потолок много меньше порога облёта', () => {
    expect(MAX_FRAME_SECONDS).toBeLessThan(REST_AFTER / 100);
  });
});
