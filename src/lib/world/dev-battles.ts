/** Подбор площадок под стычки — инструмент, брат `dev-patrols.ts`. */

import type * as THREE from 'three';

import { allShots } from '@/data/world-shots';

import { battleRadius, type WorldBattle } from './battle';
import { buildRibbon, surfaceTriangles, type Ribbon } from './dev-patrols';

/** Материалы, которые считаются землёй: по ним ходят. */
const GROUND = /Grass|Ground|Dirt|Sand/i;

/** А это — вода: она тоже «песок» по имени, но стоять на ней нельзя. */
const WATER = /Water/i;

/** Цвет водного слоя карты. */
const WATER_COLOUR = '46d3dd';

/** Земля карты как таблица высот. Тот же индекс, что и у ленты дорог. */
export function buildGround(root: THREE.Object3D): Ribbon {
  return buildRibbon(
    surfaceTriangles(root, (name) => GROUND.test(name) && !WATER.test(name)),
  );
}

/** Вода карты как таблица высот. */
export function buildWater(root: THREE.Object3D): Ribbon {
  return buildRibbon(
    surfaceTriangles(root, (name: string, material: THREE.Material) => {
      if (WATER.test(name)) return true;
      const colour = (material as THREE.MeshStandardMaterial).color;
      return (
        name === '' &&
        material.transparent === true &&
        colour !== undefined &&
        colour.getHexString() === WATER_COLOUR
      );
    }),
  );
}

export type SurveyOptions = {
  /** Длина полосы под стычку в одну сторону от середины, юниты. */
  reach: number;
  /** Полуширина полосы: шеренга плюс запас, юниты. */
  half: number;
  /** Шаг замера, юниты. */
  step: number;
  /** Какой перепад от плоскости площадки ещё терпим, юниты. */
  bumps: number;
  /** Сколько разворотов фронта перебирать. */
  turns: number;
  /** Сколько лучей пускать вдоль полосы при проверке видимой поверхности. */
  rays: number;
};

export const SURVEY_DEFAULTS: SurveyOptions = {
  reach: 1.25,
  half: 0.35,
  step: 0.1,
  bumps: 0.03,
  turns: 24,
  rays: 5,
};

export type Survey = {
  /** Высота середины площадки. */
  y: number;
  /** Наклон: прирост высоты на юнит по X и по Z. */
  slope: [number, number];
  /** Лучший разворот фронта, радианы. */
  facing: number;
  /** Худший бугор относительно плоскости площадки, юниты. */
  bumps: number;
  /** Сколько замеров упёрлось в инстанс. */
  blocked: number;
  /** Сколько замеров осталось без земли под ногами. */
  missing: number;
  /** Насколько глубоко площадка под водой, юниты. */
  depth: number;
  /** Годится ли площадка как есть. */
  ok: boolean;
};

/** Плоскость наименьших квадратов по замерам: y = a + gx·dx + gz·dz. */
function fitPlane(points: readonly [number, number, number][]): {
  a: number;
  gx: number;
  gz: number;
} {
  let n = 0;
  let sx = 0;
  let sz = 0;
  let sy = 0;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  let sxy = 0;
  let szy = 0;

  for (const [dx, dz, y] of points) {
    n++;
    sx += dx;
    sz += dz;
    sy += y;
    sxx += dx * dx;
    szz += dz * dz;
    sxz += dx * dz;
    sxy += dx * y;
    szy += dz * y;
  }

  if (n === 0) return { a: 0, gx: 0, gz: 0 };

  const det3 = (
    m: readonly [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ],
  ): number =>
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);

  const base = det3([n, sx, sz, sx, sxx, sxz, sz, sxz, szz]);
  if (Math.abs(base) < 1e-12) return { a: sy / n, gx: 0, gz: 0 };

  return {
    a: det3([sy, sx, sz, sxy, sxx, sxz, szy, sxz, szz]) / base,
    gx: det3([n, sy, sz, sx, sxy, sxz, sz, szy, szz]) / base,
    gz: det3([n, sx, sy, sx, sxx, sxy, sz, sxz, szy]) / base,
  };
}

/** Замер площадки под стычку. */
export function surveySite(
  ground: Ribbon,
  blocked: (x: number, z: number) => string | null,
  at: readonly [number, number],
  options: SurveyOptions = SURVEY_DEFAULTS,
  water?: Ribbon,
): Survey {
  const { reach, half, step, turns } = options;
  let best: Survey | null = null;

  for (let turn = 0; turn < turns; turn++) {
    const facing = (turn / turns) * Math.PI;
    const forward = { x: Math.sin(facing), z: Math.cos(facing) };
    const side = { x: forward.z, z: -forward.x };

    const points: [number, number, number][] = [];
    let missing = 0;
    let stuck = 0;
    let deep = 0;

    for (let along = -reach; along <= reach + 1e-9; along += step) {
      for (let across = -half; across <= half + 1e-9; across += step) {
        const dx = forward.x * along + side.x * across;
        const dz = forward.z * along + side.z * across;
        const x = at[0] + dx;
        const z = at[1] + dz;

        const heights = ground.heightsAt(x, z);
        if (heights.length === 0) {
          missing++;
          continue;
        }
        if (blocked(x, z)) stuck++;

        const surface = heights[0]!;
        for (const level of water?.heightsAt(x, z) ?? []) {
          if (level > surface) deep = Math.max(deep, level - surface);
        }

        points.push([dx, dz, surface]);
      }
    }

    const plane = fitPlane(points);
    let bumps = 0;
    for (const [dx, dz, y] of points) {
      bumps = Math.max(bumps, Math.abs(y - (plane.a + plane.gx * dx + plane.gz * dz)));
    }

    const survey: Survey = {
      y: +plane.a.toFixed(3),
      slope: [+plane.gx.toFixed(4), +plane.gz.toFixed(4)],
      facing: +facing.toFixed(3),
      bumps: +bumps.toFixed(3),
      blocked: stuck,
      missing,
      depth: +deep.toFixed(3),
      ok: stuck === 0 && missing === 0 && deep === 0 && bumps <= options.bumps,
    };

    const better =
      !best ||
      survey.blocked + survey.missing < best.blocked + best.missing ||
      (survey.blocked + survey.missing === best.blocked + best.missing &&
        survey.bumps < best.bumps);
    if (better) best = survey;
  }

  return best!;
}

export type Probe = {
  /** Сколько замеров полосы накрыто чем-то сверху. */
  covered: number;
  /** Худший зазор между видимой поверхностью и землёй, юниты. */
  gap: number;
  /** Сколько замеров луч не нашёл поверхности вовсе. */
  missing: number;
};

/** Проверка полосы лучом по видимой поверхности. */
export function probeSite(
  ground: Ribbon,
  surfaceAt: (x: number, z: number) => number | null,
  at: readonly [number, number],
  facing: number,
  options: SurveyOptions = SURVEY_DEFAULTS,
): Probe {
  const { reach, half, rays } = options;
  const forward = { x: Math.sin(facing), z: Math.cos(facing) };
  const side = { x: forward.z, z: -forward.x };

  const probe: Probe = { covered: 0, gap: 0, missing: 0 };

  const step = (reach * 2) / Math.max(rays - 1, 1);

  for (let along = -reach; along <= reach + 1e-9; along += step) {
    for (const across of [-half, 0, half]) {
      const x = at[0] + forward.x * along + side.x * across;
      const z = at[1] + forward.z * along + side.z * across;

      const earth = ground.heightsAt(x, z)[0];
      const top = surfaceAt(x, z);
      if (earth === undefined || top === null) {
        probe.missing++;
        continue;
      }

      const gap = Math.abs(top - earth);
      probe.gap = Math.max(probe.gap, gap);
      if (gap > COVER_GAP) probe.covered++;
    }
  }

  probe.gap = +probe.gap.toFixed(3);
  return probe;
}

/** Насколько видимая поверхность может отстоять от земли, оставаясь той же. */
const COVER_GAP = 0.05;

/** Что перебирает поиск площадок и чем ограничен. */
export type ScanOptions = {
  /** Шаг перебора по карте, юниты. */
  step: number;
  /** Не дальше этого от ближайшего ракурса маршрута камеры, юниты. */
  near: number;
  /** Ближе этого друг к другу площадки не берутся, юниты. */
  apart: number;
  /** Сколько площадок вернуть. */
  limit: number;
  /** Границы перебора. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Чем мерить площадку: размер полосы, допуск на бугры, число разворотов. */
  survey: Partial<SurveyOptions>;
};

export const SCAN_DEFAULTS: ScanOptions = {
  step: 0.5,
  near: 22,
  apart: 6,
  limit: 8,
  bounds: { minX: -48, maxX: 71.7, minZ: -76.6, maxZ: 38.2 },
  survey: {},
};

/** Насколько площадка удалена от ближайшего ракурса маршрута камеры. */
function nearestView(at: readonly [number, number]): number {
  let best = Infinity;
  for (const shot of allShots()) {
    best = Math.min(best, Math.hypot(at[0] - shot.at[0], at[1] - shot.at[2]));
  }
  return best;
}

/** Годится ли точка на первый взгляд: земля есть, воды нет, инстанс не мешает. */
function clearSpot(
  ground: Ribbon,
  water: Ribbon,
  blocked: (x: number, z: number) => string | null,
  x: number,
  z: number,
): boolean {
  const around: readonly (readonly [number, number])[] = [
    [0, 0],
    [0.5, 0],
    [-0.5, 0],
    [0, 0.5],
    [0, -0.5],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (const [dx, dz] of around) {
    const heights = ground.heightsAt(x + dx, z + dz);
    if (heights.length === 0) return false;
    if (water.heightsAt(x + dx, z + dz).some((level) => level > heights[0]!))
      return false;
    if (blocked(x + dx, z + dz)) return false;
  }

  return true;
}

/** Найденная площадка: замер плюс расстояние до ближайшего ракурса. */
export type Site = Survey & Probe & { x: number; z: number; away: number };

export type BattleTools = {
  /** Земля карты. Собирается один раз и живёт со сценой. */
  ground: () => Ribbon;
  /** Вода карты: море, озёра и пруды — по слою, а не по имени материала. */
  water: () => Ribbon;
  /** Замер площадки в точке: годится ли и с каким разворотом. */
  survey: (x: number, z: number, options?: Partial<SurveyOptions>) => Survey;
  /** Проверка полосы лучом: не накрыта ли площадка постройкой. */
  probe: (
    x: number,
    z: number,
    facing: number,
    options?: Partial<SurveyOptions>,
  ) => Probe;
  /** Перебор карты в поисках площадок. */
  scan: (options?: Partial<ScanOptions>) => Site[];
  /** Проверка того, что лежит в данных сейчас. */
  audit: (
    list: readonly WorldBattle[],
  ) => Record<string, Survey & Probe & { radius: number }>;
};

export type BattleToolsOptions = {
  scene: THREE.Object3D;
  blocked: (x: number, z: number) => string | null;
  /** Высота видимой поверхности лучом сверху. Даёт `scene.ts`. */
  surfaceAt: (x: number, z: number) => number | null;
};

export function createBattleTools({
  scene,
  blocked,
  surfaceAt,
}: BattleToolsOptions): BattleTools {
  let index: Ribbon | null = null;
  const ground = (): Ribbon => (index ??= buildGround(scene));

  let wet: Ribbon | null = null;
  const water = (): Ribbon => (wet ??= buildWater(scene));

  const survey = (x: number, z: number, options?: Partial<SurveyOptions>): Survey =>
    surveySite(ground(), blocked, [x, z], { ...SURVEY_DEFAULTS, ...options }, water());

  const probe = (
    x: number,
    z: number,
    facing: number,
    options?: Partial<SurveyOptions>,
  ): Probe =>
    probeSite(ground(), surfaceAt, [x, z], facing, { ...SURVEY_DEFAULTS, ...options });

  const scan = (options?: Partial<ScanOptions>): Site[] => {
    const {
      step,
      near,
      apart,
      limit,
      bounds,
      survey: measure,
    } = { ...SCAN_DEFAULTS, ...options };
    const map = ground();
    const wet = water();

    const rough: { x: number; z: number; away: number; bumps: number }[] = [];
    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
        const away = nearestView([x, z]);
        if (away > near) continue;

        if (!clearSpot(map, wet, blocked, x, z)) continue;

        const quick = surveySite(
          map,
          blocked,
          [x, z],
          { ...SURVEY_DEFAULTS, ...measure, turns: 2, step: 0.25 },
          wet,
        );
        if (!quick.ok) continue;
        rough.push({ x, z, away, bumps: quick.bumps });
      }
    }

    rough.sort(
      (first, second) => first.bumps - second.bumps || first.away - second.away,
    );

    const sites: Site[] = [];
    for (const spot of rough) {
      if (sites.some((site) => Math.hypot(site.x - spot.x, site.z - spot.z) < apart)) {
        continue;
      }

      const full = survey(spot.x, spot.z, measure);
      if (!full.ok) continue;

      const rays = probe(spot.x, spot.z, full.facing, measure);
      if (rays.covered > 0 || rays.missing > 0) continue;

      sites.push({
        ...full,
        ...rays,
        x: +spot.x.toFixed(2),
        z: +spot.z.toFixed(2),
        away: +spot.away.toFixed(1),
      });
      if (sites.length >= limit) break;
    }

    return sites;
  };

  return {
    ground,
    water,
    survey,
    probe,
    scan,
    audit: (list) => {
      const report: Record<string, Survey & Probe & { radius: number }> = {};
      for (const battle of list) {
        const reach = battleRadius(battle);
        report[battle.id] = {
          ...survey(battle.at[0], battle.at[2], { reach }),
          ...probe(battle.at[0], battle.at[2], battle.facing, { reach }),
          radius: +reach.toFixed(3),
        };
      }
      return report;
    },
  };
}
