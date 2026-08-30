import { describe, expect, it } from 'vitest';

import { worldPatrols } from '@/data/world-patrols';
import { foldDistance, routeLength, stepAt, walkerStep } from '@/lib/world/patrol';

/** Прямой отрезок вдоль оси Z длиной 3: удобно считать в уме. */
const straight = [
  [0, 1, 0],
  [0, 1, 1],
  [0, 1, 2],
  [0, 1, 3],
] as const;

/** Угол: два юнита на север, потом два на восток. Высота растёт на повороте. */
const corner = [
  [0, 1, 0],
  [0, 1, 2],
  [2, 2, 2],
] as const;

describe('routeLength', () => {
  it('меряет длину по горизонтали, не считая подъёма', () => {
    expect(routeLength(corner)).toBe(4);
  });

  it('у маршрута из одной точки длины нет', () => {
    expect(routeLength([[1, 2, 3]])).toBe(0);
  });
});

describe('foldDistance', () => {
  it('на первой половине круга идёт вперёд', () => {
    expect(foldDistance(1, 4)).toEqual({ at: 1, forward: true });
  });

  it('за концом маршрута разворачивается', () => {
    expect(foldDistance(5, 4)).toEqual({ at: 3, forward: false });
  });

  it('замыкает круг: два маршрута туда-обратно — снова начало', () => {
    expect(foldDistance(8, 4)).toEqual({ at: 0, forward: true });
  });

  it('отрицательное расстояние отстающего не ломает счёт', () => {
    expect(foldDistance(-1, 4)).toEqual({ at: 1, forward: false });
  });

  it('нулевая длина не делит на ноль', () => {
    expect(foldDistance(3, 0)).toEqual({ at: 0, forward: true });
  });
});

describe('stepAt', () => {
  it('идёт по звеньям, а не по прямой между концами', () => {
    const step = stepAt(corner, 3);

    expect(step.x).toBeCloseTo(1, 6);
    expect(step.z).toBeCloseTo(2, 6);
    expect(step.y).toBeCloseTo(1.5, 6);
  });

  it('курс берёт у звена, по которому идут', () => {
    expect(stepAt(corner, 1).heading).toBeCloseTo(0, 6);
    expect(stepAt(corner, 3).heading).toBeCloseTo(Math.PI / 2, 6);
  });

  it('на обратном ходу смотрит назад', () => {
    expect(Math.abs(stepAt(straight, 1, false).heading)).toBeCloseTo(Math.PI, 6);
  });

  it('за концом маршрута остаётся на его конце', () => {
    const step = stepAt(straight, 99);
    expect([step.x, step.y, step.z]).toEqual([0, 1, 3]);
  });
});

describe('walkerStep', () => {
  it('держит строй: промежуток между соседями равен заданному', () => {
    const first = walkerStep(straight, 4, 0, 0.5, 0.4, 3);
    const second = walkerStep(straight, 4, 1, 0.5, 0.4, 3);

    expect(second.z - first.z).toBeCloseTo(0.4, 6);
  });

  it('идущие не проходят сквозь друг друга — ни на ходу, ни на развороте', () => {
    const spacing = 0.4;
    const walkers = 3;
    let ближе = Infinity;

    for (let t = 0; t < 40; t += 0.05) {
      const места = [0, 1, 2].map((i) =>
        walkerStep(straight, t, i, 0.5, spacing, walkers),
      );
      for (let a = 0; a < места.length; a++) {
        for (let b = a + 1; b < места.length; b++) {
          ближе = Math.min(
            ближе,
            Math.hypot(места[a]!.x - места[b]!.x, места[a]!.z - места[b]!.z),
          );
        }
      }
    }

    expect(ближе).toBeCloseTo(spacing, 6);
  });

  it('строй целиком остаётся на маршруте: хвост не свисает за край', () => {
    const spacing = 0.4;
    const длина = routeLength(straight);

    for (let t = 0; t < 40; t += 0.1) {
      for (const i of [0, 1, 2]) {
        const шаг = walkerStep(straight, t, i, 0.5, spacing, 3);
        expect(шаг.z).toBeGreaterThanOrEqual(-1e-6);
        expect(шаг.z).toBeLessThanOrEqual(длина + 1e-6);
      }
    }
  });

  it('вся тройка идёт в одну сторону', () => {
    const heads = [0, 1, 2].map((i) => walkerStep(straight, 4, i, 0.5, 0.4, 3).heading);
    expect(new Set(heads.map((h) => h.toFixed(3))).size).toBe(1);
  });

  it('после разворота идёт обратно тем же путём', () => {
    const length = routeLength(straight);
    const there = walkerStep(straight, length / 0.5 - 2, 0, 0.5, 0.4, 1);
    const back = walkerStep(straight, length / 0.5 + 2, 0, 0.5, 0.4, 1);

    expect(there.z).toBeCloseTo(back.z, 6);
    expect(there.heading).toBeCloseTo(0, 6);
    expect(Math.abs(back.heading)).toBeCloseTo(Math.PI, 6);
  });
});

describe('данные дозоров', () => {
  it('маршруты длинные и не выходят за карту', () => {
    for (const patrol of worldPatrols) {
      expect(routeLength(patrol.route)).toBeGreaterThan(2.5);
      for (const [x, y, z] of patrol.route) {
        expect(x).toBeGreaterThan(-48);
        expect(x).toBeLessThan(72);
        expect(z).toBeGreaterThan(-77);
        expect(z).toBeLessThan(39);
        expect(y).toBeGreaterThan(0.09);
      }
    }
  });

  it('дозоры не встречаются: любые два маршрута разнесены', () => {
    for (let i = 0; i < worldPatrols.length; i++) {
      for (let j = i + 1; j < worldPatrols.length; j++) {
        let closest = Infinity;
        for (const a of worldPatrols[i]!.route)
          for (const b of worldPatrols[j]!.route) {
            closest = Math.min(
              closest,
              Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
            );
          }

        expect(
          closest,
          `«${worldPatrols[i]!.id}» и «${worldPatrols[j]!.id}» сходятся`,
        ).toBeGreaterThan(4);
      }
    }
  });

  it('у каждого дозора своё имя', () => {
    const ids = new Set(worldPatrols.map((patrol) => patrol.id));
    expect(ids.size).toBe(worldPatrols.length);
  });

  it('профиль без обрывов: соседние точки не расходятся выше колена', () => {
    for (const patrol of worldPatrols) {
      for (let i = 1; i < patrol.route.length; i++) {
        const from = patrol.route[i - 1]!;
        const to = patrol.route[i]!;
        const climb = Math.abs(to[1] - from[1]);

        expect(climb, `ступень между ${from} и ${to}`).toBeLessThan(0.35);
      }
    }
  });

  it('звенья не тянутся через полкарты', () => {
    for (const patrol of worldPatrols) {
      if (patrol.id.startsWith('дракон')) continue;

      for (let i = 1; i < patrol.route.length; i++) {
        const from = patrol.route[i - 1]!;
        const to = patrol.route[i]!;
        const шаг = Math.hypot(to[0] - from[0], to[2] - from[2]);

        expect(шаг, `звено ${from} → ${to}`).toBeLessThan(1);
      }
    }
  });

  it('строй помещается на маршруте', () => {
    for (const patrol of worldPatrols) {
      expect((patrol.walkers - 1) * patrol.spacing).toBeLessThan(
        routeLength(patrol.route) / 2,
      );
    }
  });

  it('заморожены: маршрут нельзя править из сцены', () => {
    expect(Object.isFrozen(worldPatrols)).toBe(true);
  });
});
