import { describe, expect, it } from 'vitest';

import {
  BAKE_DEFAULTS,
  auditRoute,
  bakeRoute,
  buildRibbon,
  centerOnRibbon,
  formatRoute,
  type Point3,
  type Triangle,
} from '@/lib/world/dev-patrols';

/**
 * Кусок ленты: полоса вдоль оси Z, разбитая на клетки по два треугольника.
 *
 * Высота задаётся функцией от Z — так одной строкой получается и ровная
 * дорога, и подъём, и гребень, на котором хорда между узлами проваливается.
 */
function strip(
  fromX: number,
  toX: number,
  fromZ: number,
  toZ: number,
  height: (z: number) => number,
  step = 0.1,
): Triangle[] {
  const triangles: Triangle[] = [];

  for (let z = fromZ; z < toZ - 1e-9; z += step) {
    const near = z;
    const far = Math.min(z + step, toZ);
    const a: Point3 = [fromX, height(near), near];
    const b: Point3 = [toX, height(near), near];
    const c: Point3 = [toX, height(far), far];
    const d: Point3 = [fromX, height(far), far];
    triangles.push([a, b, c], [a, c, d]);
  }

  return triangles;
}

/** Высота ломаной там, где она пересекает заданный Z. Ломаные тут идут вдоль Z. */
function heightAlong(route: readonly Point3[], z: number): number {
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]!;
    const to = route[i]!;
    if (z < Math.min(from[2], to[2]) || z > Math.max(from[2], to[2])) continue;

    const span = to[2] - from[2];
    const part = span === 0 ? 0 : (z - from[2]) / span;
    return from[1] + (to[1] - from[1]) * part;
  }

  throw new Error(`ломаная не доходит до z = ${z}`);
}

/** Ровная лента шириной 0,08 вдоль оси Z: центр на x = 0. */
const flat = buildRibbon(strip(-0.04, 0.04, 0, 4, () => 1));

describe('buildRibbon', () => {
  it('отдаёт высоту внутри ленты и молчит за её краем', () => {
    expect(flat.heightsAt(0, 2)).toEqual([1]);
    expect(flat.heightsAt(0.2, 2)).toEqual([]);
  });

  it('считает высоту наклонного куска по месту, а не по узлу', () => {
    // Лента поднимается на юнит за юнит пути: на середине звена — половина.
    const slope = buildRibbon(strip(-0.04, 0.04, 0, 2, (z) => z));
    expect(slope.heightsAt(0, 0.55)[0]).toBeCloseTo(0.55, 6);
  });

  it('на мосту отдаёт оба яруса сверху вниз', () => {
    const bridge = buildRibbon([
      ...strip(-0.04, 0.04, 0, 2, () => 1),
      ...strip(-0.04, 0.04, 0, 2, () => 2),
    ]);
    expect(bridge.heightsAt(0, 1)).toEqual([2, 1]);
  });
});

describe('levelAt', () => {
  const bridge = buildRibbon([
    ...strip(-0.04, 0.04, 0, 2, () => 1),
    ...strip(-0.04, 0.04, 0, 2, () => 2),
  ]);

  it('выбирает ярус по непрерывности хода, а не самый верхний', () => {
    // Шли по нижнему — остаёмся на нижнем, хотя над головой настил моста.
    expect(bridge.levelAt(0, 1, 1.02)).toBe(1);
    expect(bridge.levelAt(0, 1, 1.98)).toBe(2);
  });

  it('у съезда под мост держится верхнего яруса, а не ближайшего', () => {
    // Две ленты рядом: настил на 1 и уходящий под него съезд на 0,88. Ближайший
    // к ожиданию — нижний, и маршрут шаг за шагом уехал бы под настил.
    const ramp = buildRibbon([
      ...strip(-0.04, 0.04, 0, 2, () => 1),
      ...strip(-0.04, 0.04, 0, 2, () => 0.88),
    ]);
    expect(ramp.levelAt(0, 1, 0.9)).toBe(1);
  });

  it('молчит, если ближайший ярус дальше допуска', () => {
    expect(bridge.levelAt(0, 1, 5)).toBeNull();
    expect(bridge.levelAt(0, 1, 5, 4)).toBe(2);
  });
});

describe('centerOnRibbon', () => {
  it('сводит точку на середину ленты', () => {
    const centered = centerOnRibbon(flat, 0.03, 2, 1, 1, 0);
    expect(centered).not.toBeNull();
    expect(centered!.x).toBeCloseTo(0, 2);
    expect(centered!.half).toBeCloseTo(0.04, 2);
    expect(centered!.y).toBe(1);
  });

  it('подбирает точку, уже сошедшую с ленты', () => {
    const centered = centerOnRibbon(flat, 0.09, 2, 1, 1, 0);
    expect(centered!.x).toBeCloseTo(0, 2);
  });

  it('молчит там, где ленты нет в пределах поиска', () => {
    expect(centerOnRibbon(flat, 1, 2, 1, 1, 0)).toBeNull();
  });

  it('на перекрёстке держит замер в пределах разумной ширины', () => {
    // Площадь два на два: без ограничителя середина «ленты» уехала бы на метр.
    const square = buildRibbon(strip(-1, 1, 0, 2, () => 1));
    const centered = centerOnRibbon(square, 0.5, 1, 1, 1, 0);
    expect(centered!.half).toBeCloseTo(BAKE_DEFAULTS.halfWidth, 2);
    expect(Math.abs(centered!.shift)).toBeLessThanOrEqual(BAKE_DEFAULTS.halfWidth);
  });
});

describe('auditRoute', () => {
  it('находит провал под ленту', () => {
    const sunk: Point3[] = [
      [0, 0.95, 0.5],
      [0, 0.95, 3.5],
    ];
    const report = auditRoute(flat, sunk);
    expect(report.sink).toBeCloseTo(0.05, 6);
    expect(report.float).toBe(0);
  });

  it('считает ногу вне ленты, когда идущий свисает с края', () => {
    const edge: Point3[] = [
      [0.03, 1, 0.5],
      [0.03, 1, 3.5],
    ];
    // Полуширина фигуры 0,02, край ленты на 0,04: правая нога на траве.
    expect(auditRoute(flat, edge).footOffShare).toBe(100);
    expect(
      auditRoute(flat, [
        [0, 1, 0.5],
        [0, 1, 3.5],
      ]).footOffShare,
    ).toBe(0);
  });

  it('меряет длину по земле, не считая подъёма', () => {
    expect(
      auditRoute(flat, [
        [0, 1, 0.5],
        [0, 3, 3.5],
      ]).length,
    ).toBeCloseTo(3, 6);
  });
});

describe('bakeRoute', () => {
  it('возвращает сошедший с ленты маршрут на её середину', () => {
    const drifting: Point3[] = [
      [0.05, 1, 0.2],
      [0.06, 1, 2],
      [0.05, 1, 3.8],
    ];
    const baked = bakeRoute(flat, drifting);

    expect(baked.report.footOff).toBe(0);
    expect(baked.report.sink).toBeCloseTo(0, 2);
    for (const [x] of baked.route) expect(Math.abs(x)).toBeLessThan(0.01);
  });

  it('на гребне ставит точку вместо хорды, режущей склон', () => {
    // Лента горбом: подъём до z = 2 и спуск после, вершина на 0,1 выше концов.
    // Прямая между концами проходит под вершиной — идущий шёл бы в земле.
    const hill = buildRibbon(
      strip(-0.04, 0.04, 0, 4, (z) => 1 + 0.05 * (2 - Math.abs(z - 2))),
    );
    const chord: Point3[] = [
      [0, 1.01, 0.2],
      [0, 1.01, 3.8],
    ];

    expect(auditRoute(hill, chord).sink).toBeGreaterThan(0.08);

    const baked = bakeRoute(hill, chord);
    expect(baked.report.sink).toBeLessThanOrEqual(BAKE_DEFAULTS.keepY * 2);
    expect(baked.route.length).toBeGreaterThan(2);
  });

  it('не плодит точек на прямом и ровном куске', () => {
    const baked = bakeRoute(flat, [
      [0, 1, 0.2],
      [0, 1, 3.8],
    ]);
    expect(baked.route.length).toBeLessThanOrEqual(3);
  });

  it('на разрыве ленты ведёт высоту по прямой между её краями', () => {
    // Брод: лента до z = 1 на высоте 1, после z = 2 — на высоте 2, между ними
    // ленты нет вовсе.
    const ford = buildRibbon([
      ...strip(-0.04, 0.04, 0, 1, () => 1),
      ...strip(-0.04, 0.04, 2, 3, () => 2),
    ]);
    const baked = bakeRoute(ford, [
      [0, 1, 0.2],
      [0, 2, 2.8],
    ]);

    const middle = heightAlong(baked.route, 1.5);
    expect(middle).toBeGreaterThan(1.2);
    expect(middle).toBeLessThan(1.8);
  });

  it('оставляет концы маршрута на своих местах', () => {
    const baked = bakeRoute(flat, [
      [0.02, 1, 0.2],
      [0.02, 1, 3.8],
    ]);
    expect(baked.route[0]![2]).toBeCloseTo(0.2, 2);
    expect(baked.route[baked.route.length - 1]![2]).toBeCloseTo(3.8, 2);
  });
});

describe('bakeRoute у съезда под настил', () => {
  /** Настил на 1 и уходящая под него лента на 0,6: разница в четыре роста. */
  const ramp = buildRibbon([
    ...strip(-0.04, 0.04, 0, 4, () => 1),
    ...strip(-0.04, 0.04, 0, 4, () => 0.6),
  ]);

  it('начинает с верхнего яруса, даже если запись начала ушла под него', () => {
    const baked = bakeRoute(ramp, [
      [0, 0.62, 0.2],
      [0, 0.62, 3.8],
    ]);
    for (const [, y] of baked.route) expect(y).toBe(1);
    expect(baked.report.covered).toBe(0);
  });

  it('считает замеры, над которыми низко висит вторая лента', () => {
    const under = auditRoute(ramp, [
      [0, 0.6, 0.2],
      [0, 0.6, 3.8],
    ]);
    expect(under.covered).toBe(under.samples);
  });
});

describe('bakeRoute с препятствиями', () => {
  /** Куст на середине ленты: квадрат 0,05 × 0,4 поперёк дороги на z ≈ 2. */
  const bush = (x: number, z: number): string | null =>
    Math.abs(x + 0.015) < 0.025 && Math.abs(z - 2) < 0.2 ? 'bush' : null;

  const straight: Point3[] = [
    [0, 1, 0.2],
    [0, 1, 3.8],
  ];

  it('обходит куст, не сходя с ленты', () => {
    const baked = bakeRoute(flat, straight, { ...BAKE_DEFAULTS, blocked: bush });

    expect(baked.report.touches).toBe(0);
    expect(baked.report.footOff).toBe(0);
    for (const [x] of baked.route) expect(Math.abs(x)).toBeLessThanOrEqual(0.04);
  });

  it('без следа инстансов идёт напролом — обход стоит точек', () => {
    const plain = bakeRoute(flat, straight);
    expect(
      auditRoute(flat, plain.route, { ...BAKE_DEFAULTS, blocked: bush }).touches,
    ).toBeGreaterThan(0);
  });

  it('не сворачивает там, где обходить нечего', () => {
    const free = () => null;
    const baked = bakeRoute(flat, straight, { ...BAKE_DEFAULTS, blocked: free });
    for (const [x] of baked.route) expect(Math.abs(x)).toBeLessThan(0.01);
  });
});

describe('formatRoute', () => {
  it('выдаёт готовые строки для данных', () => {
    expect(formatRoute([[1, 2, 3]], '  ')).toBe('  [1, 2, 3],');
  });
});
