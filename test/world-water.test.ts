import { describe, expect, it } from 'vitest';

import { WATER_PERIOD, WAVES } from '@/lib/world/water';

/** Медиана длины ребра водного меша, замер живой сцены. */
const EDGE_MEDIAN = 0.97;

describe('набор волн', () => {
  it('волн три: одна крупная, одна средняя, одна мелкая', () => {
    expect(WAVES).toHaveLength(3);
  });

  it('длины идут по убыванию и не кратны друг другу', () => {
    /*
     * Кратные длины складываются в правильную клетку, и вода читается тканью.
     * Проверяется остаток от деления соседних: у кратных он около нуля.
     */
    for (let index = 1; index < WAVES.length; index++) {
      const long = WAVES[index - 1]!.length;
      const short = WAVES[index]!.length;

      expect(short).toBeLessThan(long);
      expect(Math.abs((long / short) % 1)).toBeGreaterThan(0.1);
    }
  });

  it('направления не совпадают и не противоположны', () => {
    const unit = ({ dir }: (typeof WAVES)[number]) => {
      const length = Math.hypot(dir[0], dir[1]);
      return [dir[0] / length, dir[1] / length] as const;
    };

    for (let a = 0; a < WAVES.length; a++) {
      for (let b = a + 1; b < WAVES.length; b++) {
        const first = unit(WAVES[a]!);
        const second = unit(WAVES[b]!);
        const cosine = first[0] * second[0] + first[1] * second[1];

        expect(Math.abs(cosine), `волны ${a} и ${b}`).toBeLessThan(0.9);
      }
    }
  });

  it('направления заданы почти единичными: нормировка не выправляет опечатку', () => {
    // Шейдер нормирует сам, но `dir: [9.4, 3.4]` вместо `[0.94, 0.34]` прошёл
    // бы молча — и остался бы незамеченным до следующей правки.
    for (const wave of WAVES) {
      expect(Math.hypot(wave.dir[0], wave.dir[1])).toBeCloseTo(1, 1);
    }
  });

  it('крутизна убывает вместе с длиной и остаётся рябью', () => {
    // Наклон нормали больше десятой доли превращает воду в мятую фольгу.
    for (let index = 1; index < WAVES.length; index++) {
      expect(WAVES[index]!.steep).toBeLessThan(WAVES[index - 1]!.steep);
    }

    for (const wave of WAVES) {
      expect(wave.steep).toBeGreaterThan(0);
      expect(wave.steep).toBeLessThan(0.1);
    }
  });

  it('самая короткая волна крупнее ячейки геометрии', () => {
    /*
     * Рябь живёт в нормали, но точка её опоры — мировые координаты вершин.
     * Волна короче ребра меша не рисуется: между вершинами интерполировать
     * нечего, и она рассыпается в шум на скользящих углах.
     */
    const shortest = WAVES[WAVES.length - 1]!.length;

    expect(shortest).toBeGreaterThan(EDGE_MEDIAN);
  });
});

describe('период воды', () => {
  it('на круге каждая волна заворачивается без скачка', () => {
    /*
     * Иначе раз в десять минут рисунок ряби прыгает разом. Проверяется тем,
     * что за период волна проходит целое число своих длин.
     */
    for (const wave of WAVES) {
      const turns = (WATER_PERIOD * wave.speed) / wave.length;

      expect(Math.abs(turns - Math.round(turns)), `волна ${wave.length}`).toBeLessThan(
        0.01,
      );
    }
  });

  it('круг достаточно длинный, чтобы повтор не читался', () => {
    expect(WATER_PERIOD).toBeGreaterThanOrEqual(300);
  });

  it('скорости положительные и медленнее бега', () => {
    for (const wave of WAVES) {
      expect(wave.speed).toBeGreaterThan(0);
      expect(wave.speed).toBeLessThan(2);
    }
  });
});
