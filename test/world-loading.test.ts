import { describe, expect, it } from 'vitest';

import { INSTANCED } from '@/lib/world/assets';
import { LANDMARKS, loadWaves } from '@/lib/world/loading';

const waves = loadWaves();

describe('волны загрузки', () => {
  it('вместе покрывают всё, что грузится, ровно по разу', () => {
    const all = [...waves.landmarks, ...waves.scatter];

    expect(all).toHaveLength(INSTANCED.length);
    expect(new Set(all).size).toBe(INSTANCED.length);
    expect([...all].sort()).toEqual([...INSTANCED].sort());
  });

  it('ни одна волна не пуста', () => {
    expect(waves.landmarks.length).toBeGreaterThan(0);
    expect(waves.scatter.length).toBeGreaterThan(0);
  });

  it('ориентиры существуют среди загружаемого', () => {
    for (const name of LANDMARKS) {
      expect(INSTANCED, name).toContain(name);
    }
  });

  it('ориентиров заметно меньше россыпи', () => {
    expect(waves.landmarks.length).toBeLessThan(waves.scatter.length / 2);
  });

  it('растительность целиком во второй волне', () => {
    const green = waves.scatter.filter(
      (name) => name.startsWith('tree_') || name.startsWith('bush_'),
    );

    expect(green.length).toBeGreaterThan(20);
    expect(waves.landmarks.some((name) => name.startsWith('tree_'))).toBe(false);
    expect(waves.landmarks.some((name) => name.startsWith('bush_'))).toBe(false);
  });

  it('порядок внутри волны — как в описи ассетов', () => {
    const order = INSTANCED.indexOf.bind(INSTANCED);

    for (const wave of [waves.landmarks, waves.scatter]) {
      const positions = wave.map(order);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});
