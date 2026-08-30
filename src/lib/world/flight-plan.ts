/** Планирование перелёта: как обойти то, что стоит на пути. */

import { samplePath, type PathKey, type Point3 } from './camera-path';

/** Высота всего, что мешает, в точке: рельеф, оболочка, объекты. */
export type CeilingProbe = (x: number, z: number) => number | null;

/** На сколько камера проходит выше препятствия. */
const CLEARANCE = 0.8;

/** Сколько точек проверяем вдоль отрезка. */
const SAMPLES = 60;

/** Сколько юнитов у концов пути подъём не применяется. */
const EDGE_UNITS = 1.6;

/** Больше прежней доли слепая зона не станет: на коротких шагах она и была права. */
const EDGE_MAX = 0.18;

/** Ниже этого подъём не стоит опоры: дуга пройдёт и так. */
const MIN_LIFT = 0.25;

/** Бугор в вершине, доля подъёма: дуга, а не полка. */
const APEX = 0.14;

/** Юбка: доля подъёма, которую забирает соседняя с дугой опора. */
const SKIRT = 0.45;

/** Сколько опор ставится между станциями, когда путь гнётся. */
const INNER_KEYS = 6;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpPoint = (a: Point3, b: Point3, t: number): Point3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

/** Луч вдоль прямой: на какой высоте камере разрешено идти в каждой выборке. */
function probeCeilings(
  from: PathKey,
  to: PathKey,
  ceiling: CeilingProbe,
  edge: number,
): number[] {
  const needs: number[] = [];

  for (let step = 0; step <= SAMPLES; step++) {
    const t = step / SAMPLES;
    const inside = t >= edge && t <= 1 - edge;

    const point = lerpPoint(from.at, to.at, t);
    const top = inside ? ceiling(point[0], point[2]) : null;

    needs.push(top === null ? -Infinity : top + CLEARANCE);
  }

  return needs;
}

/** Подъём опоры: наибольшее требование в её зоне влияния. */
function keyLift(needs: number[], t: number, reach: number, floor: number): number {
  const first = Math.max(0, Math.ceil((t - reach) * SAMPLES));
  const last = Math.min(SAMPLES, Math.floor((t + reach) * SAMPLES));

  let top = -Infinity;
  for (let index = first; index <= last; index++) {
    if (needs[index]! > top) top = needs[index]!;
  }

  const lift = top - floor;
  return lift < MIN_LIFT ? 0 : lift;
}

/** Бугор поверх ровного участка подъёма. */
function bulge(lifts: number[], index: number): number {
  let first = index;
  while (first > 0 && lifts[first - 1]! > 0) first--;

  let last = index;
  while (last < lifts.length - 1 && lifts[last + 1]! > 0) last++;

  if (first === last) return 0;

  const middle = (first + last) / 2;
  const half = (last - first) / 2 + 1;

  return APEX * Math.cos((Math.PI / 2) * ((index - middle) / half)) ** 2;
}

/** Окно у станций: подъём гасится к концам пути. */
function edgeWindow(t: number, edge: number): number {
  const away = Math.min(t, 1 - t);
  if (away >= edge) return 1;

  return 0.5 * (1 - Math.cos(Math.PI * (away / edge)));
}

/**
 * Строит путь от станции к станции, обходя препятствия по дуге.
 * @param from откуда камера летит — обычно её текущее положение
 * @param to куда: утверждённый ракурс, его трогать нельзя
 * @param ceiling высота препятствий; `null` там, где ничего нет
 * @returns опоры пути, включая концы. Без препятствий — просто `[from, to]`
 */
export function planFlight(
  from: PathKey,
  to: PathKey,
  ceiling: CeilingProbe,
): PathKey[] {
  const span = Math.hypot(
    to.at[0] - from.at[0],
    to.at[1] - from.at[1],
    to.at[2] - from.at[2],
  );
  const edge = span > 0 ? Math.min(EDGE_MAX, EDGE_UNITS / span) : EDGE_MAX;

  const probed = probeCeilings(from, to, ceiling, edge);
  const reach = 1 / (INNER_KEYS + 1);

  const raw = Array.from({ length: INNER_KEYS }, (_, index) => {
    const t = (index + 1) * reach;
    return keyLift(probed, t, reach, lerp(from.at[1], to.at[1], t));
  });

  if (raw.every((lift) => lift === 0)) return [from, to];

  const lifts = raw.map((lift, index) =>
    Math.max(lift, SKIRT * Math.max(raw[index - 1] ?? 0, raw[index + 1] ?? 0)),
  );

  const chord: PathKey[] = [from, to];

  const raised: Point3[] = lifts.map((lift, index) => {
    const t = (index + 1) * reach;
    const flat = lerpPoint(from.at, to.at, t);

    return [
      flat[0],
      flat[1] + lift * (1 + bulge(lifts, index)) * edgeWindow(t, edge),
      flat[2],
    ];
  });

  const points: Point3[] = [from.at, ...raised, to.at];
  const marks = [0];
  for (let index = 1; index < points.length; index++) {
    marks.push(
      marks[index - 1]! +
        Math.hypot(
          points[index]![0] - points[index - 1]![0],
          points[index]![1] - points[index - 1]![1],
          points[index]![2] - points[index - 1]![2],
        ),
    );
  }
  const length = marks.at(-1)!;

  const inner = raised.map((at, index) => {
    const along = length === 0 ? 0 : marks[index + 1]! / length;
    const aimed = samplePath(chord, along);

    return {
      at,
      look: [
        at[0] + (aimed.look[0] - aimed.position[0]),
        at[1] + (aimed.look[1] - aimed.position[1]),
        at[2] + (aimed.look[2] - aimed.position[2]),
      ] as Point3,
    };
  });

  return [from, ...inner, to];
}
