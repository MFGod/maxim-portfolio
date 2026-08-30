import { describe, expect, it } from 'vitest';

import { samplePath, type PathKey } from '@/lib/world/camera-path';
import {
  edgeShare,
  edgeWindow,
  liftAbove,
  planFlight,
  shortfallAt,
  type CeilingProbe,
} from '@/lib/world/flight-plan';
import { POCKET_SLACK } from '@/lib/world/shots';

const from: PathKey = { at: [0, 2, 0], look: [0, 2, -10] };
const to: PathKey = { at: [40, 2, 0], look: [40, 2, -10] };

/** Ровное поле: препятствий нет вовсе. */
const flat: CeilingProbe = () => null;

/** Холм посреди пути: башня высотой 8 юнитов между 15 и 25 по X. */
const hill: CeilingProbe = (x) => (x > 15 && x < 25 ? 8 : 0);

/** Два препятствия — по одному в каждой половине пути. */
const twoHills: CeilingProbe = (x) => {
  if (x > 8 && x < 14) return 6;
  if (x > 26 && x < 32) return 7;
  return 0;
};

const heightAt = (keys: PathKey[], x: number): number => {
  for (let step = 0; step <= 400; step++) {
    const pose = samplePath(keys, step / 400);
    if (pose.position[0] >= x) return pose.position[1];
  }
  return samplePath(keys, 1).position[1];
};

describe('план перелёта', () => {
  it('на чистом пути не добавляет ничего лишнего', () => {
    expect(planFlight(from, to, flat)).toEqual([from, to]);
  });

  it('концы остаются нетронутыми: станции подбирали вживую', () => {
    const path = planFlight(from, to, hill);
    expect(path[0]).toBe(from);
    expect(path.at(-1)).toBe(to);
  });

  it('поднимает дугу над препятствием', () => {
    const path = planFlight(from, to, hill);
    expect(path.length).toBeGreaterThan(2);

    expect(heightAt(path, 20)).toBeGreaterThan(8);
  });

  it('прямая шла бы сквозь: подъём нужен, а не декоративен', () => {
    expect(heightAt([from, to], 20)).toBeCloseTo(2, 1);
  });

  it('обходит оба препятствия, когда их два', () => {
    const path = planFlight(from, to, twoHills);

    expect(heightAt(path, 11)).toBeGreaterThan(6);
    expect(heightAt(path, 29)).toBeGreaterThan(7);
  });

  it('не взмывает у самой станции: там объекты стоят вплотную к камере', () => {
    const atStation: CeilingProbe = (x) => (x < 1.2 ? 9 : 0);
    expect(planFlight(from, to, atStation)).toEqual([from, to]);
  });

  it('слепая зона мерится юнитами, а не долей пути', () => {
    const nearby: CeilingProbe = (x) => (x > 2.5 && x < 5 ? 9 : 0);
    expect(planFlight(from, to, nearby).length).toBeGreaterThan(2);
  });

  it('взгляд опоры — тот же, что у перелёта без обхода', () => {
    const path = planFlight(from, to, hill);

    for (const key of path.slice(1, -1)) {
      const away = [
        key.look[0] - key.at[0],
        key.look[1] - key.at[1],
        key.look[2] - key.at[2],
      ];
      const reach = Math.hypot(...away);

      expect(away[1]! / reach).toBeCloseTo(0, 5);
      expect(away[2]! / reach).toBeCloseTo(-1, 5);
    }
  });

  it('число опор не зависит от изрезанности рельефа', () => {
    const rough: CeilingProbe = (x) => 5 + Math.sin(x) * 2;
    expect(planFlight(from, to, rough)).toHaveLength(8);
    expect(planFlight(from, to, hill)).toHaveLength(8);
  });

  it('высота набирается постепенно, а не одним рывком у станции', () => {
    const path = planFlight(from, to, hill);
    const lifts = path.slice(1, -1).map((key) => key.at[1] - from.at[1]);
    const apex = Math.max(...lifts);

    expect(lifts[0]!).toBeLessThan(apex / 2);
    expect(lifts.at(-1)!).toBeLessThan(apex / 2);
  });

  it('профиль — дуга: вершина в середине, к краям сходит', () => {
    const lifts = planFlight(from, to, hill)
      .slice(1, -1)
      .map((key) => key.at[1] - from.at[1]);

    const apex = Math.max(...lifts);
    const top = lifts.indexOf(apex);

    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(lifts.length - 1);

    expect(lifts[top - 1]!).toBeLessThan(apex);
    expect(lifts[top + 1]!).toBeLessThanOrEqual(apex);
  });
});

/** Плавность считается по самой кривой: равномерными шагами по длине. */
function smoothness(keys: PathKey[]) {
  const steps = 600;
  const points = Array.from(
    { length: steps + 1 },
    (_, index) => samplePath(keys, index / steps).position,
  );

  const spans: number[] = [];
  for (let index = 1; index <= steps; index++) {
    spans.push(
      Math.hypot(
        points[index]![0] - points[index - 1]![0],
        points[index]![1] - points[index - 1]![1],
        points[index]![2] - points[index - 1]![2],
      ),
    );
  }

  const mean = spans.reduce((sum, span) => sum + span, 0) / spans.length;

  let radius = Infinity;
  for (let index = 1; index < steps; index++) {
    const start = points[index - 1]!;
    const before = points[index]!;
    const after = points[index + 1]!;

    const a = [before[0] - start[0], before[1] - start[1], before[2] - start[2]];
    const b = [after[0] - before[0], after[1] - before[1], after[2] - before[2]];
    const la = Math.hypot(...a);
    const lb = Math.hypot(...b);
    if (la < 1e-9 || lb < 1e-9) continue;

    const cos = (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (la * lb);
    const turn = Math.acos(Math.min(1, Math.max(-1, cos)));
    if (turn < 1e-9) continue;

    radius = Math.min(radius, (la + lb) / 2 / turn);
  }

  return {
    fastest: Math.max(...spans) / mean,
    slowest: Math.min(...spans) / mean,
    radius,
  };
}

describe('плавность пути', () => {
  const cases: [string, CeilingProbe][] = [
    ['холм', hill],
    ['два холма', twoHills],
    ['шпиль', (x) => (x > 19 && x < 20.5 ? 12 : 0)],
  ];

  for (const [name, probe] of cases) {
    it(`${name}: скорость держится ровно`, () => {
      const { fastest, slowest } = smoothness(planFlight(from, to, probe));

      expect(fastest).toBeLessThan(1.1);
      expect(slowest).toBeGreaterThan(0.9);
    });

    it(`${name}: путь идёт без углов`, () => {
      expect(smoothness(planFlight(from, to, probe)).radius).toBeGreaterThan(2.5);
    });

    it(`${name}: препятствие не задето ни на одном кадре`, () => {
      const keys = planFlight(from, to, probe);

      for (let step = 0; step <= 600; step++) {
        const { position } = samplePath(keys, step / 600);
        const top = probe(position[0], position[2]);
        if (top === null) continue;

        expect(position[1], `доля ${step / 600}`).toBeGreaterThan(top);
      }
    });
  }
});

/**
 * Подъём на самом пролёте. Риг собирает его из этих частей, но сам под тест не идёт:
 * ему нужны живой холст и `OrbitControls`, а тесты гоняются в `node`.
 */
describe('подъём на пролёте', () => {
  const edges = [0.01, 0.036, 0.1, 0.18];

  it('у концов пути подъём погашен целиком', () => {
    for (const edge of edges) {
      expect(edgeWindow(0, edge), `слепая зона ${edge}`).toBe(0);
      expect(edgeWindow(1, edge), `слепая зона ${edge}`).toBe(0);
    }
  });

  it('гейт нарастает без излома и доходит до единицы', () => {
    const edge = 0.1;
    const steps = 200;

    let previous = edgeWindow(0, edge);
    for (let step = 1; step <= steps; step++) {
      const value = edgeWindow((step / steps) * edge, edge);
      expect(value, `шаг ${step}`).toBeGreaterThanOrEqual(previous);
      previous = value;
    }

    expect(previous).toBeCloseTo(1, 10);

    /**
     * У самого края наклон практически нулевой: приподнятый косинус входит гладко,
     * а не изломом. Мерим против среднего наклона гейта — `1 / edge`.
     */
    const step = edge / steps;
    expect(edgeWindow(step, edge) / step).toBeLessThan(0.05 / edge);
  });

  it('слепая зона мерится юнитами, пока не упрётся в прежнюю долю', () => {
    expect(edgeShare(45)).toBeCloseTo(1.6 / 45, 10);
    expect(edgeShare(4)).toBeCloseTo(0.18, 10);
    expect(edgeShare(0)).toBeCloseTo(0.18, 10);
  });

  it('в кармане ракурса камера не под пределом: жёсткой недостачи нет', () => {
    const y = 1.56;
    const { hard, soft } = shortfallAt(y, y - POCKET_SLACK);

    expect(hard).toBe(0);
    expect(soft).toBeCloseTo(0.0446, 4);
  });

  it('камера ровно на куполе тоже не под пределом', () => {
    const y = 1.56;
    const { hard, soft } = shortfallAt(y, y);

    expect(hard).toBe(0);
    expect(soft).toBeCloseTo(0.0875, 4);
  });

  it('под пределом жёсткая часть вынимает камеру целиком', () => {
    expect(shortfallAt(3, 5).hard).toBeCloseTo(2, 10);
  });

  it('выше полосы сглаживания подъёма нет вовсе', () => {
    expect(shortfallAt(5, 1).hard).toBe(0);
    expect(shortfallAt(5, 1).soft).toBe(0);
  });

  it('жёсткая и мягкая вместе дают прежнюю недостачу', () => {
    const limit = 4;

    for (let step = -20; step <= 20; step++) {
      const y = limit + step / 20;
      const { hard, soft } = shortfallAt(y, limit);

      expect(hard + soft, `высота ${y}`).toBeCloseTo(
        Math.max(liftAbove(y, limit) - y, 0),
        10,
      );
    }
  });
});
