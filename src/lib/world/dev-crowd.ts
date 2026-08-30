/** Заселение мира — инструмент запекания, брат `dev-figures.ts`. */

import * as THREE from 'three';

/** Точка стояния: X, Y, Z и поворот к цели. */
export type Spot = readonly [number, number, number, number];

export type CrowdTools = {
  /** Свободна ли точка от инстансов. Возвращает имя мешающего типа. */
  blocking: (x: number, z: number) => string | null;
  /** Годится ли площадка под фигуру: ровная, без стены вплотную. */
  flat: (x: number, z: number, y: number) => boolean;
  /** Сколько сторон вокруг точки открыто и куда смотреть. */
  openness: (x: number, z: number, y: number) => { open: number; facing: number };
  /** Ходовая ли это земля, а не крыша постройки. */
  walkable: (x: number, z: number, y: number) => boolean;
  /** Место рядом с объектом — по кругу радиусом `reach`. */
  spotNear: (x: number, z: number, reach: number) => Spot | null;
  /** Пара мест по разные стороны объекта, на одной высоте. */
  pairAt: (x: number, z: number, reach: number) => [Spot, Spot] | null;
  /** Места всех экземпляров инстанс-меша. */
  places: (name: string) => [number, number][];
  /** Готовый кусок для `world-figures.ts`. */
  emit: (rows: { id: string; clip: string; at: Spot }[]) => string;
};

/** Доля габарита, которую занимает плотный объект: телега, палатка, гроб. */
const SOLID = 0.75;

/** И доля для высокого и тонкого — дерева, надгробия, столба. */
const SLIM = 0.35;

/** Выше этого отношения высоты к ширине объект считается стволом, а не телом. */
const SLIM_RATIO = 1.5;

/** Полуширина самой фигуры: её тоже надо учесть, иначе она задевает плечом. */
const FIGURE_HALF = 0.02;

/** Мелочь ниже этого в высоту преградой не считается. */
const MIN_OBSTACLE = 0.06;

/** Насколько рельеф вокруг может подниматься, прежде чем встанет стеной. */
const PAD_RISE = 0.12;

/** И насколько проваливаться, прежде чем это обрыв. */
const PAD_DROP = 0.2;

/** На каком отдалении щупается площадка: половина ширины фигуры. */
const PAD_REACH = 0.05;

/** Разброс высот в паре у входа. Больше — и стражи стоят на разных ступенях. */
const PAIR_LEVEL = 0.08;

/** Куда смотреть при поиске места: восемь румбов, крестовые первыми. */
const RHUMBS = [0, 2, 4, 6, 1, 3, 5, 7];

/** На каком отдалении проверяется, открыт ли вид: полтора роста фигуры. */
const LOOK_REACH = 0.18;

/** Сколько румбов из восьми должно быть открыто. Меньше — это ниша. */
const MIN_OPEN = 5;

/** Расхождение верха рельефа и ходовой сетки, после которого это крыша. */
const ROOF_GAP = 0.5;

export type CrowdOptions = {
  scene: THREE.Object3D;
  /** Высота поверхности лучом сверху. Даёт `scene.ts`. */
  surfaceAt: (
    x: number,
    z: number,
    onto?: 'ground' | 'props' | 'road' | 'top',
  ) => number | null;
};

export function createCrowdTools({ scene, surfaceAt }: CrowdOptions): CrowdTools {
  const heights = new Map<string, number | null>();
  const topAt = (x: number, z: number): number | null => {
    const key = `${x.toFixed(2)}:${z.toFixed(2)}`;
    if (heights.has(key)) return heights.get(key)!;
    const value = surfaceAt(x, z, 'top');
    heights.set(key, value);
    return value;
  };

  type Footprint = { x: number; z: number; ex: number; ez: number; kind: string };
  const grid = new Map<string, Footprint[]>();

  scene.traverse((node) => {
    const mesh = node as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) return;

    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const height = box.max.y - box.min.y;
    if (height < MIN_OBSTACLE) return;

    const hx = (box.max.x - box.min.x) / 2;
    const hy = height / 2;
    const hz = (box.max.z - box.min.z) / 2;
    const share = height / Math.max(hx, hz) / 2 > SLIM_RATIO ? SLIM : SOLID;

    const matrices = mesh.instanceMatrix.array;

    for (let i = 0; i < mesh.count; i++) {
      const at = i * 16;
      const x = matrices[at + 12]!;
      const z = matrices[at + 14]!;

      const ex =
        Math.abs(matrices[at]!) * hx +
        Math.abs(matrices[at + 4]!) * hy +
        Math.abs(matrices[at + 8]!) * hz;
      const ez =
        Math.abs(matrices[at + 2]!) * hx +
        Math.abs(matrices[at + 6]!) * hy +
        Math.abs(matrices[at + 10]!) * hz;

      const key = `${Math.floor(x / 2)}:${Math.floor(z / 2)}`;
      const list = grid.get(key) ?? [];
      list.push({
        x,
        z,
        ex: ex * share + FIGURE_HALF,
        ez: ez * share + FIGURE_HALF,
        kind: mesh.name,
      });
      grid.set(key, list);
    }
  });

  const blocking = (x: number, z: number): string | null => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(`${Math.floor(x / 2) + dx}:${Math.floor(z / 2) + dz}`);
        if (!list) continue;
        for (const item of list) {
          if (Math.abs(x - item.x) < item.ex && Math.abs(z - item.z) < item.ez) {
            return item.kind;
          }
        }
      }
    }
    return null;
  };

  const flat = (x: number, z: number, y: number): boolean => {
    for (const [dx, dz] of [
      [PAD_REACH, 0],
      [-PAD_REACH, 0],
      [0, PAD_REACH],
      [0, -PAD_REACH],
    ]) {
      const height = topAt(x + dx!, z + dz!);
      if (height === null) return false;
      if (height - y > PAD_RISE || y - height > PAD_DROP) return false;
    }
    return true;
  };

  /** Куда смотреть: в сторону, где перед фигурой открыто. */
  const openness = (
    x: number,
    z: number,
    y: number,
  ): { open: number; facing: number } => {
    let open = 0;
    let facing = 0;
    let bestGap = -Infinity;

    for (let rhumb = 0; rhumb < 8; rhumb++) {
      const angle = (rhumb / 8) * Math.PI * 2;
      const dx = Math.cos(angle) * LOOK_REACH;
      const dz = Math.sin(angle) * LOOK_REACH;
      const height = topAt(x + dx, z + dz);
      const gap = height === null ? LOOK_REACH : y - height;
      if (gap > -PAD_RISE) open++;
      if (gap > bestGap) {
        bestGap = gap;
        facing = Math.atan2(dx, dz);
      }
    }

    return { open, facing: +facing.toFixed(2) };
  };

  /** Стоит ли точка на ходовой земле, а не на крыше или карнизе. */
  const walkable = (x: number, z: number, y: number): boolean => {
    const ground = surfaceAt(x, z, 'ground');
    return ground !== null && Math.abs(ground - y) <= ROOF_GAP;
  };

  const round = (value: number) => +value.toFixed(3);

  const spotNear = (cx: number, cz: number, reach: number): Spot | null => {
    for (const rhumb of RHUMBS) {
      const angle = (rhumb / 8) * Math.PI * 2;
      const x = +(cx + Math.cos(angle) * reach).toFixed(2);
      const z = +(cz + Math.sin(angle) * reach).toFixed(2);
      if (blocking(x, z)) continue;

      const y = topAt(x, z);
      if (y === null || y < 0.12 || !flat(x, z, y)) continue;
      if (!walkable(x, z, y)) continue;

      const view = openness(x, z, y);
      if (view.open < MIN_OPEN) continue;

      return [x, round(y), z, view.facing];
    }
    return null;
  };

  const pairAt = (cx: number, cz: number, reach: number): [Spot, Spot] | null => {
    for (const rhumb of [0, 1, 2, 3]) {
      const angle = (rhumb / 8) * Math.PI * 2;
      const ax = +(cx + Math.cos(angle) * reach).toFixed(2);
      const az = +(cz + Math.sin(angle) * reach).toFixed(2);
      const bx = +(cx - Math.cos(angle) * reach).toFixed(2);
      const bz = +(cz - Math.sin(angle) * reach).toFixed(2);
      if (blocking(ax, az) || blocking(bx, bz)) continue;

      const ay = topAt(ax, az);
      const by = topAt(bx, bz);
      if (ay === null || by === null || ay < 0.12) continue;
      if (Math.abs(ay - by) > PAIR_LEVEL) continue;
      if (!flat(ax, az, ay) || !flat(bx, bz, by)) continue;
      if (!walkable(ax, az, ay) || !walkable(bx, bz, by)) continue;

      const viewA = openness(ax, az, ay);
      const viewB = openness(bx, bz, by);
      if (viewA.open < MIN_OPEN || viewB.open < MIN_OPEN) continue;

      return [
        [ax, round(ay), az, viewA.facing],
        [bx, round(by), bz, viewB.facing],
      ];
    }
    return null;
  };

  const places = (name: string): [number, number][] => {
    const mesh = scene.getObjectByName(name) as THREE.InstancedMesh | undefined;
    if (!mesh?.isInstancedMesh) return [];

    const matrices = mesh.instanceMatrix.array;
    const out: [number, number][] = [];
    for (let i = 0; i < mesh.count; i++) {
      out.push([
        +matrices[i * 16 + 12]!.toFixed(2),
        +matrices[i * 16 + 14]!.toFixed(2),
      ]);
    }
    return out;
  };

  const emit = (rows: { id: string; clip: string; at: Spot }[]): string =>
    rows
      .map(({ id, clip, at }) =>
        [
          '  {',
          `    id: '${id.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}',`,
          "    model: 'skeleton_warrior',",
          `    clip: '${clip}',`,
          `    at: [${at[0]}, ${at[1]}, ${at[2]}],`,
          `    turn: ${at[3]},`,
          '    height: 0.117,',
          '  },',
        ].join('\n'),
      )
      .join('\n');

  return { blocking, flat, openness, walkable, spotNear, pairAt, places, emit };
}
