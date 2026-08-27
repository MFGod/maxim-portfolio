import { describe, expect, it } from 'vitest';

import { INSTANCED } from '@/lib/world/assets';
import { LANDMARKS, loadWaves } from '@/lib/world/loading';

const waves = loadWaves();

describe('волны загрузки', () => {
  it('вместе покрывают всё, что грузится, ровно по разу', () => {
    // Иначе добавленный в карту объект либо потеряется между волнами, либо
    // приедет дважды — а вторая копия встанет поверх первой.
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
    // Опечатка в имени иначе тиха: объект просто уедет во вторую волну.
    for (const name of LANDMARKS) {
      expect(INSTANCED, name).toContain(name);
    }
  });

  it('ориентиров заметно меньше россыпи', () => {
    /*
     * Смысл первой волны — короткое ожидание. Если в неё попадёт половина
     * списка, первый кадр придёт не раньше, чем раньше, и разбиение окажется
     * лишней сложностью.
     */
    expect(waves.landmarks.length).toBeLessThan(waves.scatter.length / 2);
  });

  it('растительность целиком во второй волне', () => {
    // Деревья и кусты — самая многочисленная часть списка: они и должны
    // достраиваться на глазах, а не задерживать первый кадр.
    const green = waves.scatter.filter(
      (name) => name.startsWith('tree_') || name.startsWith('bush_'),
    );

    expect(green.length).toBeGreaterThan(20);
    expect(waves.landmarks.some((name) => name.startsWith('tree_'))).toBe(false);
    expect(waves.landmarks.some((name) => name.startsWith('bush_'))).toBe(false);
  });

  it('порядок внутри волны — как в описи ассетов', () => {
    // Опись перенесена из форка и правится только вместе с файлами; своего
    // порядка у волн нет, чтобы разница с описью не читалась решением.
    const order = INSTANCED.indexOf.bind(INSTANCED);

    for (const wave of [waves.landmarks, waves.scatter]) {
      const positions = wave.map(order);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});
