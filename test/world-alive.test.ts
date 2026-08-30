import { describe, expect, it } from 'vitest';

import { worldBattles } from '@/data/world-battles';
import { worldFigures } from '@/data/world-figures';
import { worldPatrols } from '@/data/world-patrols';
import { ALIVE_LABELS, aliveStops, stepAlive } from '@/lib/world/dev-alive';

/** Три коротких списка вместо мира: порядок обхода виден на них целиком. */
const patrols = [{ id: 'дозор-1' }, { id: 'дозор-2' }];
const battles = [{ id: 'стычка-1' }];
const figures = [{ id: 'башня-1' }, { id: 'лагерь-1' }, { id: 'лагерь-2' }];

describe('aliveStops', () => {
  it('ведёт сперва к дозорам, потом к стычкам, потом к одиночкам', () => {
    expect(aliveStops(patrols, battles, figures).map((stop) => stop.kind)).toEqual([
      'patrol',
      'patrol',
      'battle',
      'figure',
      'figure',
      'figure',
    ]);
  });

  it('сохраняет порядок данных внутри сорта', () => {
    const stops = aliveStops(patrols, battles, figures);

    expect(stops.map((stop) => stop.id)).toEqual([
      'дозор-1',
      'дозор-2',
      'стычка-1',
      'башня-1',
      'лагерь-1',
      'лагерь-2',
    ]);
  });

  it('берёт всё живое, ничего не теряя', () => {
    expect(aliveStops(patrols, battles, figures)).toHaveLength(
      patrols.length + battles.length + figures.length,
    );
  });

  it('на пустом мире даёт пустой обход, а не падает', () => {
    expect(aliveStops([], [], [])).toEqual([]);
  });

  it('обходит весь мир из данных', () => {
    const stops = aliveStops(worldPatrols, worldBattles, worldFigures);

    expect(stops).toHaveLength(
      worldPatrols.length + worldBattles.length + worldFigures.length,
    );
    expect(new Set(stops.map((stop) => `${stop.kind}:${stop.id}`)).size).toBe(
      stops.length,
    );
  });
});

describe('stepAlive', () => {
  it('с непройденного места ведёт к первой остановке', () => {
    expect(stepAlive(6, -1, 1)).toBe(0);
  });

  it('идёт вперёд по одной', () => {
    expect(stepAlive(6, 2, 1)).toBe(3);
  });

  it('после последней возвращается к первой', () => {
    expect(stepAlive(6, 5, 1)).toBe(0);
  });

  it('идёт назад', () => {
    expect(stepAlive(6, 3, -1)).toBe(2);
  });

  it('с первой назад уходит к последней, а не за край массива', () => {
    expect(stepAlive(6, 0, -1)).toBe(5);
  });

  it('с непройденного места назад ведёт к предпоследней', () => {
    expect(stepAlive(6, -1, -1)).toBe(4);
  });

  it('на любом шаге остаётся внутри списка', () => {
    for (let step = -20; step <= 20; step++) {
      for (let cursor = -1; cursor < 6; cursor++) {
        const next = stepAlive(6, cursor, step);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(6);
      }
    }
  });

  it('на единственной остановке стоит на месте в обе стороны', () => {
    expect(stepAlive(1, 0, 1)).toBe(0);
    expect(stepAlive(1, 0, -1)).toBe(0);
  });

  it('на пустом мире не даёт номера', () => {
    expect(stepAlive(0, -1, 1)).toBe(-1);
  });

  it('за круг обходит каждую остановку ровно раз', () => {
    const seen = new Set<number>();
    let cursor = -1;

    for (let visit = 0; visit < 6; visit++) {
      cursor = stepAlive(6, cursor, 1);
      seen.add(cursor);
    }

    expect(seen.size).toBe(6);
  });
});

describe('ALIVE_LABELS', () => {
  it('называет каждый сорт живого', () => {
    for (const stop of aliveStops(patrols, battles, figures)) {
      expect(ALIVE_LABELS[stop.kind]).toBeTruthy();
    }
  });
});
