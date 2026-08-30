/** Запекание маршрутов дозоров — инструмент, брат `dev-crowd.ts`. */

import * as THREE from 'three';

import type { WorldPatrol } from '@/data/world-patrols';

export type Point3 = readonly [number, number, number];
export type Triangle = readonly [Point3, Point3, Point3];

/** Лента дороги как таблица высот: вопрос в точку, ответ — ярусы сверху вниз. */
export type Ribbon = {
  /** Все высоты ленты в точке, сверху вниз. Пусто — ленты тут нет. */
  heightsAt: (x: number, z: number) => number[];
  /** Верхний ярус в пределах допуска от ожидаемой высоты, или `null`. */
  levelAt: (x: number, z: number, expect: number, tolerance?: number) => number | null;
  /** Сколько треугольников в индексе. Для отчёта инструмента. */
  size: number;
};

/** Сторона клетки индекса, юниты. */
const INDEX_CELL = 0.5;

/** Допуск барицентрической проверки: точка на общем ребре принадлежит обоим. */
const EDGE_SLACK = 1e-6;

/** Ближе этого две высоты — один и тот же ярус, посчитанный дважды. */
const SAME_LEVEL = 1e-4;

/** Треугольники карты в мировых координатах, отобранные по имени материала. */
export function surfaceTriangles(
  root: THREE.Object3D,
  match: (material: string, first: THREE.Material) => boolean,
): Triangle[] {
  const triangles: Triangle[] = [];
  const vertex = new THREE.Vector3();

  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;

    const first = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!first || !match(first.name, first)) return;

    const position = mesh.geometry.attributes.position;
    if (!position) return;

    const index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    const corner = (at: number): Point3 => {
      const id = index ? index.array[at]! : at;
      vertex.fromBufferAttribute(position, id).applyMatrix4(mesh.matrixWorld);
      return [vertex.x, vertex.y, vertex.z];
    };

    for (let at = 0; at + 2 < count; at += 3) {
      triangles.push([corner(at), corner(at + 1), corner(at + 2)]);
    }
  });

  return triangles;
}

/** Треугольники ленты дорог. */
export const ribbonTriangles = (root: THREE.Object3D, material = 'Path'): Triangle[] =>
  surfaceTriangles(root, (name) => name === material);

/** Индекс ленты: треугольники по клеткам сетки в плоскости XZ. */
export function buildRibbon(triangles: readonly Triangle[], cell = INDEX_CELL): Ribbon {
  const cells = new Map<string, number[]>();

  const key = (x: number, z: number): string =>
    `${Math.floor(x / cell)},${Math.floor(z / cell)}`;

  triangles.forEach(([a, b, c], id) => {
    const minX = Math.min(a[0], b[0], c[0]);
    const maxX = Math.max(a[0], b[0], c[0]);
    const minZ = Math.min(a[2], b[2], c[2]);
    const maxZ = Math.max(a[2], b[2], c[2]);

    for (let x = Math.floor(minX / cell); x <= Math.floor(maxX / cell); x++) {
      for (let z = Math.floor(minZ / cell); z <= Math.floor(maxZ / cell); z++) {
        const at = `${x},${z}`;
        const bucket = cells.get(at);
        if (bucket) bucket.push(id);
        else cells.set(at, [id]);
      }
    }
  });

  function heightsAt(x: number, z: number): number[] {
    const bucket = cells.get(key(x, z));
    if (!bucket) return [];

    const heights: number[] = [];
    for (const id of bucket) {
      const [a, b, c] = triangles[id]!;

      const area = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(area) < 1e-12) continue;

      const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / area;
      const wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / area;
      const wc = 1 - wa - wb;
      if (wa < -EDGE_SLACK || wb < -EDGE_SLACK || wc < -EDGE_SLACK) continue;

      heights.push(wa * a[1] + wb * b[1] + wc * c[1]);
    }

    heights.sort((first, second) => second - first);

    return heights.filter(
      (height, at) => at === 0 || Math.abs(height - heights[at - 1]!) > SAME_LEVEL,
    );
  }

  return {
    heightsAt,
    levelAt: (x, z, expect, tolerance = LEVEL_TOLERANCE) => {
      for (const height of heightsAt(x, z)) {
        if (Math.abs(height - expect) <= tolerance) return height;
      }
      return null;
    },
    size: triangles.length,
  };
}

/** Насколько ярус может отстоять от ожидаемой высоты, чтобы считаться тем же. */
const LEVEL_TOLERANCE = 0.15;

export type BakeOptions = {
  /** Шаг плотной выборки вдоль исходной ломаной, юниты. */
  step: number;
  /** Как далеко искать ленту вбок от исходной точки, юниты. */
  reach: number;
  /** Шаг поперечного прохода, юниты. */
  across: number;
  /** Допуск выбора яруса, юниты. */
  tolerance: number;
  /** Предел полуширины ленты, юниты. */
  halfWidth: number;
  /** Полуширина фигуры: по ней проверяется, стоят ли на ленте обе ноги. */
  figureHalf: number;
  /** Допуск упрощения по горизонтали, юниты. */
  keepXZ: number;
  /** Допуск упрощения по высоте, юниты. */
  keepY: number;
  /** Сколько раз чинить упрощённую ломаную по замеру ленты. */
  repairs: number;
  /** Насколько обход вправе сойти с ленты на обочину, юниты. */
  stray: number;
  /** Что стоит на дороге: имя мешающего инстанса или `null`. */
  blocked?: (x: number, z: number, low?: number, high?: number) => string | null;
  /** Рост фигуры, юниты. По нему считается полоса высот для `blocked`. */
  figureHeight: number;
};

export const BAKE_DEFAULTS: BakeOptions = {
  step: 0.02,
  reach: 0.25,
  across: 0.0025,
  tolerance: LEVEL_TOLERANCE,
  halfWidth: 0.12,
  figureHalf: 0.02,
  keepXZ: 0.008,
  keepY: 0.004,
  repairs: 8,
  figureHeight: 0.117,
  stray: 0,
};

/** На сколько щиколотки подняты над настилом при замере тела. */
const FOOT_CLEARANCE = 0.015;

/** Точка ленты под ногами: где её середина и на какой она высоте. */
export type Centered = {
  x: number;
  z: number;
  y: number;
  /** Полуширина ленты в этом сечении. */
  half: number;
  /** Смещение от исходной точки вдоль нормали. */
  shift: number;
};

/**
 * Середина ленты в сечении по нормали к ходу.
 * @returns `null`, если ленты в пределах `reach` нет вовсе (брод, разрыв)
 */
export function centerOnRibbon(
  ribbon: Ribbon,
  x: number,
  z: number,
  expect: number,
  nx: number,
  nz: number,
  options: BakeOptions = BAKE_DEFAULTS,
): Centered | null {
  const { across, reach, tolerance, halfWidth } = options;
  const onRibbon = (shift: number): boolean =>
    ribbon.levelAt(x + nx * shift, z + nz * shift, expect, tolerance) !== null;

  let start = 0;
  if (!onRibbon(0)) {
    let found: number | null = null;
    for (let shift = across; shift <= reach; shift += across) {
      if (onRibbon(shift)) {
        found = shift;
        break;
      }
      if (onRibbon(-shift)) {
        found = -shift;
        break;
      }
    }
    if (found === null) return null;
    start = found;
  }

  let low = start;
  while (low - across >= start - halfWidth && onRibbon(low - across)) low -= across;

  let high = start;
  while (high + across <= start + halfWidth && onRibbon(high + across)) high += across;

  const middle = (low + high) / 2;
  const y = ribbon.levelAt(x + nx * middle, z + nz * middle, expect, tolerance);
  if (y === null) return null;

  return {
    x: x + nx * middle,
    z: z + nz * middle,
    y,
    half: (high - low) / 2,
    shift: middle,
  };
}

/** Занято ли место под идущим — по кресту из его собственных размеров. */
function blockedNear(
  options: BakeOptions,
  x: number,
  z: number,
  nx: number,
  nz: number,
  y: number,
): boolean {
  const { blocked, figureHalf, figureHeight } = options;
  if (!blocked) return false;

  const low = y + FOOT_CLEARANCE;
  const high = y + figureHeight;
  const tx = nz;
  const tz = -nx;

  return (
    blocked(x, z, low, high) !== null ||
    blocked(x + nx * figureHalf, z + nz * figureHalf, low, high) !== null ||
    blocked(x - nx * figureHalf, z - nz * figureHalf, low, high) !== null ||
    blocked(x + tx * figureHalf, z + tz * figureHalf, low, high) !== null ||
    blocked(x - tx * figureHalf, z - tz * figureHalf, low, high) !== null
  );
}

/** Чьё тело стоит ровно здесь: без запаса на шаг вперёд и назад. */
function bodyAt(options: BakeOptions, x: number, z: number, y: number): string | null {
  return options.blocked?.(x, z, y + FOOT_CLEARANCE, y + options.figureHeight) ?? null;
}

/** Ближайшее свободное место в стороне от середины ленты. */
function stepAside(
  ribbon: Ribbon,
  centered: Centered,
  nx: number,
  nz: number,
  options: BakeOptions,
): Centered {
  const { blocked, across, tolerance } = options;
  if (!blocked || !blockedNear(options, centered.x, centered.z, nx, nz, centered.y))
    return centered;

  const clearance = across * 2;

  const limit = centered.half + Math.max(options.stray, 0);
  for (let shift = across; shift <= limit; shift += across) {
    for (const side of [1, -1]) {
      const x = centered.x + nx * shift * side;
      const z = centered.z + nz * shift * side;

      const y =
        ribbon.levelAt(x, z, centered.y, tolerance) ??
        (shift > centered.half ? centered.y : null);
      if (y === null) continue;

      if (blockedNear(options, x, z, nx, nz, y)) continue;
      if (
        blockedNear(
          options,
          x - nx * clearance * side,
          z - nz * clearance * side,
          nx,
          nz,
          y,
        )
      )
        continue;

      return { x, z, y, half: centered.half, shift: centered.shift + shift * side };
    }
  }

  return centered;
}

/** Единичная нормаль к звену, влево по ходу. */
function normalOf(from: Point3, to: Point3): [number, number] {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length === 0) return [0, 0];
  return [-dz / length, dx / length];
}

type Sample = { x: number; y: number; z: number; onRibbon: boolean };

/** С какой высоты начинать ход. */
function startLevel(ribbon: Ribbon, first: Point3): number {
  const top = ribbon.heightsAt(first[0], first[2])[0];
  return top !== undefined && Math.abs(top - first[1]) <= START_REACH ? top : first[1];
}

/** Насколько верх ленты может отстоять от записанной высоты начала. */
const START_REACH = 0.5;

/** Плотная выборка по исходной ломаной, сведённая на середину ленты. */
function densify(
  ribbon: Ribbon,
  route: readonly Point3[],
  options: BakeOptions,
): Sample[] {
  const samples: Sample[] = [];
  let expect = startLevel(ribbon, route[0]!);

  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]!;
    const to = route[i]!;
    const span = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const steps = Math.max(Math.ceil(span / options.step), 1);
    const [nx, nz] = normalOf(from, to);

    for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
      const part = k / steps;
      const x = from[0] + (to[0] - from[0]) * part;
      const z = from[2] + (to[2] - from[2]) * part;
      const y = from[1] + (to[1] - from[1]) * part;

      const centered = centerOnRibbon(ribbon, x, z, expect, nx, nz, options);
      if (centered) {
        const free = stepAside(ribbon, centered, nx, nz, options);
        samples.push({ x: free.x, y: free.y, z: free.z, onRibbon: true });
        expect = free.y;
      } else {
        samples.push({ x, y, z, onRibbon: false });
        expect = y;
      }
    }
  }

  return samples;
}

/** Высота на разрыве ленты — по прямой между её краями. */
function fillGaps(samples: Sample[]): void {
  for (let i = 0; i < samples.length; i++) {
    if (samples[i]!.onRibbon) continue;

    let end = i;
    while (end < samples.length && !samples[end]!.onRibbon) end++;

    const before = i > 0 ? samples[i - 1]! : null;
    const after = end < samples.length ? samples[end]! : null;

    for (let k = i; k < end; k++) {
      if (before && after) {
        const part = (k - i + 1) / (end - i + 1);
        samples[k]!.y = before.y + (after.y - before.y) * part;
      } else if (before) samples[k]!.y = before.y;
      else if (after) samples[k]!.y = after.y;
    }

    i = end;
  }
}

/**
 * Сглаживание боковых рывков: поперечный замер шумит на четверть ширины ленты,
 * и без него ломаная виляет внутри дороги. Высота после сдвига берётся заново
 * у ленты — сглаженная высота увела бы точку под настил на переломе.
 */
function smooth(ribbon: Ribbon, samples: Sample[], options: BakeOptions): void {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < samples.length - 1; i++) {
      const previous = samples[i - 1]!;
      const current = samples[i]!;
      const next = samples[i + 1]!;
      if (!current.onRibbon) continue;

      const x = (previous.x + current.x * 2 + next.x) / 4;
      const z = (previous.z + current.z * 2 + next.z) / 4;
      const y = ribbon.levelAt(x, z, current.y, options.tolerance);
      if (y === null) continue;

      const [nx, nz] = normalOf(
        [previous.x, previous.y, previous.z],
        [next.x, next.y, next.z],
      );
      if (
        blockedNear(options, x, z, nx, nz, y) &&
        !blockedNear(options, current.x, current.z, nx, nz, current.y)
      )
        continue;

      current.x = x;
      current.z = z;
      current.y = y;
    }
  }
}

/** Отклонение точки от хорды: по земле и по высоте порознь. */
function offChord(
  from: Sample,
  to: Sample,
  point: Sample,
): { across: number; height: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const square = dx * dx + dz * dz;
  const part =
    square > 0
      ? Math.min(
          Math.max(((point.x - from.x) * dx + (point.z - from.z) * dz) / square, 0),
          1,
        )
      : 0;

  return {
    across: Math.hypot(point.x - (from.x + dx * part), point.z - (from.z + dz * part)),
    height: Math.abs(point.y - (from.y + (to.y - from.y) * part)),
  };
}

/**
 * Упрощение по Дугласу—Пекеру: выбрасывает всё, без чего ломаная не расходится
 * с плотной выборкой больше допуска. Допуски по земле и по высоте раздельные:
 * провал в сантиметр виден, а сдвиг вбок на тот же сантиметр — нет.
 */
function simplify(samples: readonly Sample[], options: BakeOptions): number[] {
  const kept = new Set<number>([0, samples.length - 1]);
  const queue: [number, number][] = [[0, samples.length - 1]];

  while (queue.length > 0) {
    const [from, to] = queue.pop()!;
    if (to - from < 2) continue;

    let worst = 0;
    let at = -1;
    for (let i = from + 1; i < to; i++) {
      const gap = offChord(samples[from]!, samples[to]!, samples[i]!);
      const score = Math.max(gap.across / options.keepXZ, gap.height / options.keepY);
      if (score > worst) {
        worst = score;
        at = i;
      }
    }

    if (worst <= 1 || at < 0) continue;
    kept.add(at);
    queue.push([from, at], [at, to]);
  }

  return [...kept].sort((first, second) => first - second);
}

export type Audit = {
  /** Сколько замеров сделано вдоль ломаной. */
  samples: number;
  /** Худший провал под ленту, юниты. Положительное — идущий в земле. */
  sink: number;
  /** Худший подъём над лентой, юниты. */
  float: number;
  /** Замеры, где под ногой нет ленты (свисает или брод). */
  footOff: number;
  /** Их доля, проценты. */
  footOffShare: number;
  /** Замеры, где ленты нет вовсе — разрывы маршрута. */
  gaps: number;
  /** Замеры, где идущий задевает след инстанса. Считается, если задана `blocked`. */
  touches: number;
  /** Замеры, где тело идущего входит в чужое тело. */
  hits: number;
  /** Их доля, проценты. */
  hitShare: number;
  /** Замеры, над которыми низко висит другой ярус ленты. */
  covered: number;
  /** Длина ломаной по земле, юниты. */
  length: number;
};

/** Проверка ломаной по ленте: провал, свисание, разрывы. */
export function auditRoute(
  ribbon: Ribbon,
  route: readonly Point3[],
  options: BakeOptions = BAKE_DEFAULTS,
): Audit {
  const report: Audit = {
    samples: 0,
    sink: 0,
    float: 0,
    footOff: 0,
    footOffShare: 0,
    gaps: 0,
    touches: 0,
    hits: 0,
    hitShare: 0,
    covered: 0,
    length: 0,
  };

  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]!;
    const to = route[i]!;
    const span = Math.hypot(to[0] - from[0], to[2] - from[2]);
    report.length += span;

    const steps = Math.max(Math.ceil(span / options.step), 1);
    const [nx, nz] = normalOf(from, to);

    for (let k = 0; k <= steps; k++) {
      const part = k / steps;
      const x = from[0] + (to[0] - from[0]) * part;
      const z = from[2] + (to[2] - from[2]) * part;
      const y = from[1] + (to[1] - from[1]) * part;
      report.samples++;
      if (options.blocked?.(x, z) != null) report.touches++;
      if (bodyAt(options, x, z, y) !== null) report.hits++;

      const under = ribbon.levelAt(x, z, y, options.tolerance);
      if (under === null) {
        report.gaps++;
        report.footOff++;
        continue;
      }

      report.sink = Math.max(report.sink, under - y);
      report.float = Math.max(report.float, y - under);

      const above = ribbon.heightsAt(x, z)[0]!;
      if (above - y > options.tolerance && above - y < COVER_REACH) report.covered++;

      const half = options.figureHalf;
      const left = ribbon.levelAt(x + nx * half, z + nz * half, y, options.tolerance);
      const right = ribbon.levelAt(x - nx * half, z - nz * half, y, options.tolerance);
      if (left === null || right === null) report.footOff++;
    }
  }

  report.footOffShare =
    report.samples > 0 ? (100 * report.footOff) / report.samples : 0;
  report.hitShare = report.samples > 0 ? (100 * report.hits) / report.samples : 0;
  return report;
}

/**
 * Выше этого ярус над головой — мост, а не беда: под ним идут, и это замысел.
 * Ниже — идущий уехал под настил соседней ленты.
 */
const COVER_REACH = 0.6;

const round = (value: number): number => +value.toFixed(3);

export type Baked = {
  route: Point3[];
  /** Проверка запечённой ломаной. */
  report: Audit;
  /** Сколько точек было в плотной выборке до упрощения. */
  dense: number;
  /** Сколько точек плотной выборки осталось в чужом теле. */
  denseHits: number;
  /** Сама плотная выборка: по ней видно, где обход есть, а где его срезали. */
  samples: Point3[];
};

/** Заново прокладывает маршрут по ленте, оставляя его там же, где он был. */
export function bakeRoute(
  ribbon: Ribbon,
  route: readonly Point3[],
  options: BakeOptions = BAKE_DEFAULTS,
): Baked {
  const samples = densify(ribbon, route, options);
  fillGaps(samples);
  smooth(ribbon, samples, options);

  let kept = simplify(samples, options);

  for (let attempt = 0; attempt < options.repairs; attempt++) {
    const broken = worstSpan(ribbon, samples, kept, options);
    if (broken === null) break;
    kept = [...kept, broken].sort((first, second) => first - second);
  }

  const line: Point3[] = kept.map((at) => {
    const sample = samples[at]!;
    return [round(sample.x), round(sample.y), round(sample.z)];
  });

  let denseHits = 0;
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1]!;
    const sample = samples[i]!;
    const [nx, nz] = normalOf(
      [previous.x, previous.y, previous.z],
      [sample.x, sample.y, sample.z],
    );
    if (blockedNear(options, sample.x, sample.z, nx, nz, sample.y)) denseHits++;
  }

  return {
    route: line,
    report: auditRoute(ribbon, line, options),
    dense: samples.length,
    denseHits,
    samples: samples.map(({ x, y, z }) => [round(x), round(y), round(z)]),
  };
}

/**
 * Точка плотной выборки, возвращение которой чинит худшее звено, или `null`,
 * если чинить нечего.
 */
function worstSpan(
  ribbon: Ribbon,
  samples: readonly Sample[],
  kept: readonly number[],
  options: BakeOptions,
): number | null {
  let worst = 0;
  let at: number | null = null;

  for (let i = 1; i < kept.length; i++) {
    const from = kept[i - 1]!;
    const to = kept[i]!;
    if (to - from < 2) continue;

    const start = samples[from]!;
    const end = samples[to]!;
    const [nx, nz] = normalOf([start.x, start.y, start.z], [end.x, end.y, end.z]);

    for (let k = from + 1; k < to; k++) {
      const inner = samples[k]!;
      if (!inner.onRibbon) continue;

      const gap = offChord(start, end, inner);
      const part = (k - from) / (to - from);
      const x = start.x + (end.x - start.x) * part;
      const z = start.z + (end.z - start.z) * part;
      const y = start.y + (end.y - start.y) * part;

      const under = ribbon.levelAt(x, z, y, options.tolerance);
      const half = options.figureHalf;
      const left = ribbon.levelAt(x + nx * half, z + nz * half, y, options.tolerance);
      const right = ribbon.levelAt(x - nx * half, z - nz * half, y, options.tolerance);

      const sink = under === null ? 0 : Math.max(under - y, 0);
      const loose = under === null || left === null || right === null;
      const caught =
        blockedNear(options, x, z, nx, nz, y) &&
        !blockedNear(options, inner.x, inner.z, nx, nz, inner.y);
      const score = loose || caught ? 1 + gap.across : sink / options.keepY;
      if (score > worst && score > 1) {
        worst = score;
        at = k;
      }
    }
  }

  return at;
}

/** Ломаная маршрута готовым куском для `src/data/world-patrols.ts`. */
export function formatRoute(route: readonly Point3[], indent = '      '): string {
  return route.map(([x, y, z]) => `${indent}[${x}, ${y}, ${z}],`).join('\n');
}

export type PatrolTools = {
  /** Индекс ленты. Собирается один раз и живёт со сценой. */
  ribbon: () => Ribbon;
  /** Проверка того, что лежит в данных сейчас. */
  audit: (list: readonly WorldPatrol[]) => Record<string, Audit>;
  /** Перепечь один маршрут. */
  bake: (patrol: WorldPatrol, options?: Partial<BakeOptions>) => Baked;
  /** Перепечь все пешие дозоры и выдать готовые куски для данных. */
  bakeAll: (
    list: readonly WorldPatrol[],
    options?: Partial<BakeOptions>,
  ) => Record<string, Baked>;
};

/** Допуск, по которому маршрут признаётся пешим. */
const ON_ROUTE_TOLERANCE = 0.5;

export type PatrolToolsOptions = {
  scene: THREE.Object3D;
  /** Имя материала ленты. Вынесено ради тестов и правок карты. */
  material?: string;
  /** Что занимает место: след инстансов из `dev-crowd.ts`, уточнённый телом. */
  blocked?: (x: number, z: number, low?: number, high?: number) => string | null;
};

export function createPatrolTools({
  scene,
  material = 'Path',
  blocked,
}: PatrolToolsOptions): PatrolTools {
  let index: Ribbon | null = null;
  const ribbon = (): Ribbon =>
    (index ??= buildRibbon(ribbonTriangles(scene, material)));
  const settings = (options?: Partial<BakeOptions>): BakeOptions => ({
    ...BAKE_DEFAULTS,
    blocked,
    ...options,
  });

  const walking = (list: readonly WorldPatrol[]): readonly WorldPatrol[] => {
    const map = ribbon();
    return list.filter((patrol) => {
      const onRibbon = patrol.route.filter(
        ([x, y, z]) => map.levelAt(x, z, y, ON_ROUTE_TOLERANCE) !== null,
      ).length;
      return onRibbon * 2 > patrol.route.length;
    });
  };

  return {
    ribbon,
    audit: (list) => {
      const map = ribbon();
      const report: Record<string, Audit> = {};
      for (const patrol of walking(list)) {
        report[patrol.id] = auditRoute(
          map,
          patrol.route,
          settings({ figureHeight: patrol.height }),
        );
      }
      return report;
    },
    bake: (patrol, options) =>
      bakeRoute(
        ribbon(),
        patrol.route,
        settings({ figureHeight: patrol.height, ...options }),
      ),
    bakeAll: (list, options) => {
      const map = ribbon();
      const baked: Record<string, Baked> = {};
      for (const patrol of walking(list)) {
        baked[patrol.id] = bakeRoute(
          map,
          patrol.route,
          settings({ figureHeight: patrol.height, ...options }),
        );
      }
      return baked;
    },
  };
}
