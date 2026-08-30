import { describe, expect, it } from 'vitest';

import {
  LITTER_LIFT,
  LITTER_RADIUS,
  LITTER_SIZE,
  litterDensityAt,
  litterRadius,
} from '@/lib/world/fallen';

/** Тот же генератор, что кладёт ковёр: раскладка должна быть повторяемой. */
function random(): () => number {
  let state = 0x1b873593;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe('плотность опавшей листвы', () => {
  it('гуще всего у ствола и нигде не растёт наружу', () => {
    let previous = litterDensityAt(0);

    expect(previous).toBeGreaterThan(0.99);

    for (let radius = 0; radius <= LITTER_RADIUS; radius += 0.01) {
      const density = litterDensityAt(radius);

      expect(density).toBeLessThanOrEqual(previous + 1e-9);
      previous = density;
    }
  });

  it('три яруса читаются плато, а не наклоном', () => {
    expect(litterDensityAt(0.5)).toBeCloseTo(litterDensityAt(0.9), 3);
    expect(litterDensityAt(2.3)).toBeCloseTo(litterDensityAt(2.6), 3);
    expect(litterDensityAt(4.4)).toBeCloseTo(litterDensityAt(5.0), 3);

    expect(litterDensityAt(0.5) / litterDensityAt(2.4)).toBeGreaterThan(2);
    expect(litterDensityAt(2.4) / litterDensityAt(4.6)).toBeGreaterThan(2);
  });

  it('переход между ярусами плавный', () => {
    const drop = litterDensityAt(0) - litterDensityAt(LITTER_RADIUS - 0.01);
    const step = 0.05;

    for (let radius = 0; radius < LITTER_RADIUS - step; radius += step) {
      const change = litterDensityAt(radius) - litterDensityAt(radius + step);

      expect(change).toBeLessThan(drop / 20);
    }
  });

  it('за кромкой листвы нет', () => {
    expect(litterDensityAt(LITTER_RADIUS)).toBe(0);
    expect(litterDensityAt(LITTER_RADIUS + 1)).toBe(0);
  });

  it('раскладка ложится по ярусам, а не по площади кольца', () => {
    const next = random();
    const COUNT = 20000;
    const bands = [0, 1.2, 3.0, LITTER_RADIUS];
    const hits = [0, 0, 0];

    for (let leaf = 0; leaf < COUNT; leaf++) {
      const radius = litterRadius(next);

      expect(radius).toBeLessThan(LITTER_RADIUS);

      for (let band = 0; band < hits.length; band++) {
        if (radius >= bands[band]! && radius < bands[band + 1]!) hits[band]!++;
      }
    }

    expect(hits[0]! + hits[1]! + hits[2]!).toBe(COUNT);

    const density = hits.map(
      (count, band) => count / (Math.PI * (bands[band + 1]! ** 2 - bands[band]! ** 2)),
    );

    expect(density[0]!).toBeGreaterThan(density[1]! * 2);
    expect(density[1]!).toBeGreaterThan(density[2]! * 2);
  });
});

describe('подъём листа над землёй', () => {
  it('меряется листом, а не юнитами', () => {
    expect(LITTER_LIFT).toBeLessThan(0.25);
    expect(LITTER_LIFT).toBeGreaterThan(0);
  });

  it('не виден даже у самого крупного листа', () => {
    expect(LITTER_SIZE.max * LITTER_LIFT).toBeLessThan(0.01);
  });
});
