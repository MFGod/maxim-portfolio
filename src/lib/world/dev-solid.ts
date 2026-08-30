/** Занятость места телом объекта — по настоящей геометрии, а не по габариту. */

import * as THREE from 'three';

/** Сторона плитки, по которой кэшируются треугольники, юниты. */
const TILE = 0.5;

/** Сторона клетки, по которой разложены сами инстансы. */
const BUCKET = 2;

/** Треугольник в мировых координатах: проекция на землю и полоса высот. */
type Facet = {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cx: number;
  cz: number;
  low: number;
  high: number;
  kind: string;
};

type Placed = {
  mesh: THREE.InstancedMesh;
  index: number;
  /** Габарит в мире — по нему инстанс отбирается в плитку. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
};

export type SolidTools = {
  /**
   * Чьё тело стоит в точке между высотами `low` и `high`.
   * @returns имя инстанса с номером экземпляра или `null`, если место свободно
   */
  at: (x: number, z: number, low: number, high: number) => string | null;
  /** Что собрано к этой минуте: плитки, треугольники, время. */
  stats: () => Record<string, number>;
};

const keyOf = (cx: number, cz: number): string => `${cx}:${cz}`;

/** Треугольники инстанса в мировых координатах. */
function facetsOf(placed: Placed, out: Facet[]): void {
  const { mesh, index } = placed;
  const m = mesh.instanceMatrix.array;
  const at = index * 16;

  const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
  const indices = mesh.geometry.index;
  const count = indices ? indices.count : position.count;
  const kind = `${mesh.name}#${index}`;

  const wx = (x: number, y: number, z: number): number =>
    m[at]! * x + m[at + 4]! * y + m[at + 8]! * z + m[at + 12]!;
  const wy = (x: number, y: number, z: number): number =>
    m[at + 1]! * x + m[at + 5]! * y + m[at + 9]! * z + m[at + 13]!;
  const wz = (x: number, y: number, z: number): number =>
    m[at + 2]! * x + m[at + 6]! * y + m[at + 10]! * z + m[at + 14]!;

  for (let t = 0; t < count; t += 3) {
    const ia = indices ? indices.getX(t) : t;
    const ib = indices ? indices.getX(t + 1) : t + 1;
    const ic = indices ? indices.getX(t + 2) : t + 2;

    const lax = position.getX(ia);
    const lay = position.getY(ia);
    const laz = position.getZ(ia);
    const lbx = position.getX(ib);
    const lby = position.getY(ib);
    const lbz = position.getZ(ib);
    const lcx = position.getX(ic);
    const lcy = position.getY(ic);
    const lcz = position.getZ(ic);

    const ay = wy(lax, lay, laz);
    const by = wy(lbx, lby, lbz);
    const cy = wy(lcx, lcy, lcz);

    out.push({
      ax: wx(lax, lay, laz),
      az: wz(lax, lay, laz),
      bx: wx(lbx, lby, lbz),
      bz: wz(lbx, lby, lbz),
      cx: wx(lcx, lcy, lcz),
      cz: wz(lcx, lcy, lcz),
      low: Math.min(ay, by, cy),
      high: Math.max(ay, by, cy),
      kind,
    });
  }
}

/** Накрывает ли проекция треугольника точку. Общее ребро считается своим. */
function covers(facet: Facet, x: number, z: number): boolean {
  const d1 =
    (x - facet.bx) * (facet.az - facet.bz) - (facet.ax - facet.bx) * (z - facet.bz);
  const d2 =
    (x - facet.cx) * (facet.bz - facet.cz) - (facet.bx - facet.cx) * (z - facet.cz);
  const d3 =
    (x - facet.ax) * (facet.cz - facet.az) - (facet.cx - facet.ax) * (z - facet.az);

  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;

  return !(negative && positive);
}

export function createSolidTools(scene: THREE.Object3D): SolidTools {
  const started = performance.now();

  const buckets = new Map<string, Placed[]>();
  let placedCount = 0;
  const box = new THREE.Box3();
  const geometryBox = new THREE.Box3();
  const matrix = new THREE.Matrix4();

  scene.traverse((node) => {
    const mesh = node as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) return;

    mesh.geometry.computeBoundingBox();
    const source = mesh.geometry.boundingBox;
    if (!source) return;

    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      geometryBox.copy(source);
      box.copy(geometryBox).applyMatrix4(matrix);

      const placed: Placed = {
        mesh,
        index: i,
        minX: box.min.x,
        maxX: box.max.x,
        minZ: box.min.z,
        maxZ: box.max.z,
        minY: box.min.y,
        maxY: box.max.y,
      };

      placedCount++;
      for (
        let cx = Math.floor(box.min.x / BUCKET);
        cx <= Math.floor(box.max.x / BUCKET);
        cx++
      )
        for (
          let cz = Math.floor(box.min.z / BUCKET);
          cz <= Math.floor(box.max.z / BUCKET);
          cz++
        ) {
          const key = keyOf(cx, cz);
          const list = buckets.get(key) ?? [];
          list.push(placed);
          buckets.set(key, list);
        }
    }
  });

  const sorted = performance.now() - started;

  const tiles = new Map<string, Facet[]>();
  let facets = 0;
  let built = 0;

  const tileAt = (x: number, z: number): Facet[] => {
    const tx = Math.floor(x / TILE);
    const tz = Math.floor(z / TILE);
    const key = keyOf(tx, tz);
    const ready = tiles.get(key);
    if (ready) return ready;

    const at = performance.now();
    const minX = tx * TILE;
    const minZ = tz * TILE;
    const maxX = minX + TILE;
    const maxZ = minZ + TILE;

    const seen = new Set<Placed>();
    for (let cx = Math.floor(minX / BUCKET); cx <= Math.floor(maxX / BUCKET); cx++)
      for (let cz = Math.floor(minZ / BUCKET); cz <= Math.floor(maxZ / BUCKET); cz++)
        for (const placed of buckets.get(keyOf(cx, cz)) ?? []) {
          if (placed.maxX < minX || placed.minX > maxX) continue;
          if (placed.maxZ < minZ || placed.minZ > maxZ) continue;
          seen.add(placed);
        }

    const list: Facet[] = [];
    for (const placed of seen) facetsOf(placed, list);

    tiles.set(key, list);
    facets += list.length;
    built += performance.now() - at;

    return list;
  };

  return {
    at: (x, z, low, high) => {
      for (const facet of tileAt(x, z)) {
        if (facet.high < low || facet.low > high) continue;
        if (covers(facet, x, z)) return facet.kind;
      }
      return null;
    },
    stats: () => ({
      инстансов: placedCount,
      плиток: tiles.size,
      треугольников: facets,
      разборМс: +sorted.toFixed(1),
      плиткиМс: +built.toFixed(1),
    }),
  };
}
