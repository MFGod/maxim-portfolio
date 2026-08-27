import { describe, expect, it } from 'vitest';

import { samplePath, type PathKey } from '@/lib/world/camera-path';
import { planFlight, type CeilingProbe } from '@/lib/world/flight-plan';

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
  // Ищем долю пути, на которой кривая проходит нужную координату.
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

    // Над серединой холма камера должна идти выше его верхушки.
    expect(heightAt(path, 20)).toBeGreaterThan(8);
  });

  it('прямая шла бы сквозь: подъём нужен, а не декоративен', () => {
    // Без плана камера осталась бы на высоте 2 — внутри восьмиюнитовой башни.
    expect(heightAt([from, to], 20)).toBeCloseTo(2, 1);
  });

  it('обходит оба препятствия, когда их два', () => {
    const path = planFlight(from, to, twoHills);

    expect(heightAt(path, 11)).toBeGreaterThan(6);
    expect(heightAt(path, 29)).toBeGreaterThan(7);
  });

  it('не взмывает у самой станции: там объекты стоят вплотную к камере', () => {
    // Полтора юнита у конца план не трогает: у благодати камера стоит под
    // кроной, и требовать зазора там значит взмывать сразу после старта.
    const atStation: CeilingProbe = (x) => (x < 1.2 ? 9 : 0);
    expect(planFlight(from, to, atStation)).toEqual([from, to]);
  });

  it('слепая зона мерится юнитами, а не долей пути', () => {
    /*
     * Доля растёт вместе с перелётом: на шестидесяти юнитах прежние 0.18
     * ослепляли план на одиннадцать юнитов у каждого конца, и камера входила
     * в скалу, которую он не искал. Замер давал там рывок в 1607 юнитов в
     * секунду за секунду. Препятствие в трёх юнитах от станции — уже не «у
     * самой станции», его надо обходить.
     */
    const nearby: CeilingProbe = (x) => (x > 2.5 && x < 5 ? 9 : 0);
    expect(planFlight(from, to, nearby).length).toBeGreaterThan(2);
  });

  it('взгляд опоры — тот же, что у перелёта без обхода', () => {
    const path = planFlight(from, to, hill);

    for (const key of path.slice(1, -1)) {
      // Направление совпадает с прямым перелётом, а высота — нет: подъём
      // меняет, где камера, а не куда она смотрит.
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
    // Опоры снимаются с профиля равномерно, а не по краям каждой кочки:
    // рябь под путём больше не превращается в десяток изломов.
    const rough: CeilingProbe = (x) => 5 + Math.sin(x) * 2;
    expect(planFlight(from, to, rough)).toHaveLength(8);
    expect(planFlight(from, to, hill)).toHaveLength(8);
  });

  it('высота набирается постепенно, а не одним рывком у станции', () => {
    const path = planFlight(from, to, hill);
    const lifts = path.slice(1, -1).map((key) => key.at[1] - from.at[1]);
    const apex = Math.max(...lifts);

    // Опора у станции берёт меньше половины подъёма: остальное добирается
    // дальше. Взмыть на всю высоту за один шаг — это и был прежний излом.
    expect(lifts[0]!).toBeLessThan(apex / 2);
    expect(lifts.at(-1)!).toBeLessThan(apex / 2);
  });

  it('профиль — дуга: вершина в середине, к краям сходит', () => {
    const lifts = planFlight(from, to, hill)
      .slice(1, -1)
      .map((key) => key.at[1] - from.at[1]);

    const apex = Math.max(...lifts);
    const top = lifts.indexOf(apex);

    // Вершина приходится на середину списка опор, а не на его край.
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(lifts.length - 1);

    // Соседи ниже вершины: это дуга, а не полка с обрывами по бокам.
    expect(lifts[top - 1]!).toBeLessThan(apex);
    expect(lifts[top + 1]!).toBeLessThanOrEqual(apex);
  });
});

/**
 * Плавность считается по самой кривой: равномерными шагами по длине.
 *
 * Замер до перехода на дугу — скорость гуляла в 2.14 раза, поворот доходил до
 * 2.5° на сотую долю пути. Пороги ниже держат достигнутое.
 */
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

  // Радиус поворота: чем он меньше, тем сильнее камеру уводит вбок.
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
      /*
       * Порог по радиусу поворота, а не по градусам: градус зависит от шага
       * выборки, радиус — нет. При скорости 8.25 юнита в секунду радиус в 2.5
       * юнита даёт около 27 юнитов в секунду за секунду вбок — предел, за
       * которым камеру уже видно, что «кидает».
       *
       * Замер на этих же пробах: было 8.6 / 1.65 / 8.6, стало 4.1 / 5.5 / 2.9.
       * Прежний код на двух препятствиях заваливался в 1.65 — вот это и было
       * рывком; на одиноком шпиле он, наоборот, размазывал подъём на весь
       * перелёт, отчего камера всплывала над станцией ещё до препятствия.
       */
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
