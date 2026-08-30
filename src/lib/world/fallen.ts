/** Опавшая листва: ковёр золота под кронами Эрдтри. */

import * as THREE from 'three';

import { notTerrain } from './map-shell';

/** Листьев вокруг одной кроны. */
const PER_CROWN = 680;

/** Радиус ковра вокруг ствола, юнитов. */
export const LITTER_RADIUS = 5.5;

/**
 * Три яруса ковра: плотность относительно ствола и радиус, до которого ярус
 * держится.
 */
const LEVELS = [
  { density: 1, until: 1.5 },
  { density: 0.4, until: 3.3 },
  { density: 0.13, until: LITTER_RADIUS },
] as const;

/** Ширина перехода между ярусами, юнитов. */
const BLEND = 1.1;

/** Попыток подобрать радиус одному листу. */
const SPOT_TRIES = 48;

/** Размер листа, юнитов — вдесятеро мельче летящего. */
export const LITTER_SIZE = { min: 0.0225, max: 0.045 };

/** Подъём над землёй — долей от размера листа, а не юнитами. */
export const LITTER_LIFT = 0.15;

/** Косинус предельного уклона: круче лист не лежит. */
const SLOPE_LIMIT = 0.72;

/** Сторона клетки, которой точки раскладываются для поиска, юнитов. */
const LOOKUP_CELL = 1;

/** Цвет материала воды: своего имени у него нет — см. `waterSurface`. */
const WATER_COLOR = '46d3dd';

export type Fallen = {
  dispose: () => void;
};

/**
 * Плотность ковра на расстоянии от ствола: единица у самого дерева, ноль за
 * кромкой.
 */
export function litterDensityAt(radius: number): number {
  if (radius >= LITTER_RADIUS) return 0;

  let density: number = LEVELS[0].density;

  for (let level = 1; level < LEVELS.length; level++) {
    const edge = LEVELS[level - 1]!.until;
    const from = edge - BLEND / 2;
    const to = edge + BLEND / 2;
    const step = Math.min(Math.max((radius - from) / (to - from), 0), 1);

    density += (LEVELS[level]!.density - density) * step * step * (3 - 2 * step);
  }

  return density;
}

/** Радиус для одного листа — отбором по плотности. */
export function litterRadius(next: () => number): number {
  for (let attempt = 0; attempt < SPOT_TRIES; attempt++) {
    const radius = LITTER_RADIUS * Math.sqrt(next());
    if (next() < litterDensityAt(radius)) return radius;
  }

  return LEVELS[0].until * Math.sqrt(next());
}

/**
 * Строит проверку «есть ли здесь вода».
 * @returns высота верхней воды в точке или `null`, если воды там нет
 */
export function waterSurface(
  scene: THREE.Object3D,
): (x: number, z: number) => number | null {
  let mesh: THREE.Mesh | null = null;

  scene.traverse((object) => {
    const candidate = object as THREE.Mesh;
    const material = candidate.material as THREE.MeshStandardMaterial | undefined;
    if (material?.color?.getHexString() === '46d3dd') mesh = candidate;
  });

  if (!mesh) return () => null;

  const found: THREE.Mesh = mesh;
  const position = found.geometry.attributes.position;
  if (!position) return () => null;

  const points: number[] = [];
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index++) {
    vertex.fromBufferAttribute(position, index);
    found.localToWorld(vertex);
    points.push(vertex.x, vertex.y, vertex.z);
  }

  return (x: number, z: number): number | null => {
    let top: number | null = null;

    for (let base = 0; base + 8 < points.length; base += 9) {
      const ax = points[base]!;
      const az = points[base + 2]!;
      const bx = points[base + 3]!;
      const bz = points[base + 5]!;
      const cx = points[base + 6]!;
      const cz = points[base + 8]!;

      const area = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(area) < 1e-9) continue;

      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / area;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / area;
      const w = 1 - u - v;

      if (u < 0 || v < 0 || w < 0) continue;

      const height =
        u * points[base + 1]! + v * points[base + 4]! + w * points[base + 7]!;
      if (top === null || height > top) top = height;
    }

    return top;
  };
}

/** Что нашлось под точкой: высота грани и её нормаль. */
type Landing = {
  y: number;
  nx: number;
  ny: number;
  nz: number;
};

/**
 * Находит поверхность под каждой точкой одним проходом по карте.
 * @param root корень сцены
 * @param spots пары `x, z` подряд — места, куда просятся листья
 * @returns по элементу на точку; `null` там, где под точкой ничего нет
 */
function landingsUnder(root: THREE.Object3D, spots: Float32Array): (Landing | null)[] {
  const count = spots.length / 2;
  const found: (Landing | null)[] = new Array(count).fill(null);

  const cells = new Map<string, number[]>();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let index = 0; index < count; index++) {
    const x = spots[index * 2]!;
    const z = spots[index * 2 + 1]!;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);

    const key = `${Math.floor(x / LOOKUP_CELL)}|${Math.floor(z / LOOKUP_CELL)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(index);
    else cells.set(key, [index]);
  }

  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;

    if (notTerrain(mesh)) return;

    const material = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (material?.color?.getHexString() === WATER_COLOR) return;

    const position = mesh.geometry.attributes.position;
    if (!position) return;

    const points = position.array;
    const index = mesh.geometry.index ? mesh.geometry.index.array : null;
    const triangles = index ? index.length / 3 : position.count / 3;
    const e = mesh.matrixWorld.elements;

    for (let t = 0; t < triangles; t++) {
      const i0 = (index ? index[t * 3]! : t * 3) * 3;
      const i1 = (index ? index[t * 3 + 1]! : t * 3 + 1) * 3;
      const i2 = (index ? index[t * 3 + 2]! : t * 3 + 2) * 3;

      const p0x = points[i0]!;
      const p0y = points[i0 + 1]!;
      const p0z = points[i0 + 2]!;
      const p1x = points[i1]!;
      const p1y = points[i1 + 1]!;
      const p1z = points[i1 + 2]!;
      const p2x = points[i2]!;
      const p2y = points[i2 + 1]!;
      const p2z = points[i2 + 2]!;

      const ax = e[0]! * p0x + e[4]! * p0y + e[8]! * p0z + e[12]!;
      const ay = e[1]! * p0x + e[5]! * p0y + e[9]! * p0z + e[13]!;
      const az = e[2]! * p0x + e[6]! * p0y + e[10]! * p0z + e[14]!;
      const bx = e[0]! * p1x + e[4]! * p1y + e[8]! * p1z + e[12]!;
      const by = e[1]! * p1x + e[5]! * p1y + e[9]! * p1z + e[13]!;
      const bz = e[2]! * p1x + e[6]! * p1y + e[10]! * p1z + e[14]!;
      const cx = e[0]! * p2x + e[4]! * p2y + e[8]! * p2z + e[12]!;
      const cy = e[1]! * p2x + e[5]! * p2y + e[9]! * p2z + e[13]!;
      const cz = e[2]! * p2x + e[6]! * p2y + e[10]! * p2z + e[14]!;

      const loX = Math.min(ax, bx, cx);
      if (loX > maxX) continue;
      const hiX = Math.max(ax, bx, cx);
      if (hiX < minX) continue;
      const loZ = Math.min(az, bz, cz);
      if (loZ > maxZ) continue;
      const hiZ = Math.max(az, bz, cz);
      if (hiZ < minZ) continue;

      const area = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(area) < 1e-9) continue;

      const fromCol = Math.floor(loX / LOOKUP_CELL);
      const toCol = Math.floor(hiX / LOOKUP_CELL);
      const fromRow = Math.floor(loZ / LOOKUP_CELL);
      const toRow = Math.floor(hiZ / LOOKUP_CELL);

      for (let col = fromCol; col <= toCol; col++) {
        for (let row = fromRow; row <= toRow; row++) {
          const bucket = cells.get(`${col}|${row}`);
          if (!bucket) continue;

          for (const spot of bucket) {
            const x = spots[spot * 2]!;
            const z = spots[spot * 2 + 1]!;

            const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / area;
            const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / area;
            const w = 1 - u - v;
            if (u < 0 || v < 0 || w < 0) continue;

            const y = u * ay + v * by + w * cy;
            const known = found[spot];
            if (known && known.y >= y) continue;

            let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
            let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
            let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            const length = Math.hypot(nx, ny, nz) || 1;
            nx /= length;
            ny /= length;
            nz /= length;
            if (ny < 0) {
              nx = -nx;
              ny = -ny;
              nz = -nz;
            }

            found[spot] = { y, nx, ny, nz };
          }
        }
      }
    }
  });

  return found;
}

/**
 * Стелет листву вокруг крон.
 * @param parent сцена мира
 * @param texture та же текстура листа, что у летящих — иначе на земле окажется
 * @param crowns центры крон в мировых координатах
 * @param root корень сцены: по его геометрии ищется поверхность под листом
 * @param waterAt высота воды в точке; `null` — воды там нет
 */
export function createFallen(
  parent: THREE.Object3D,
  texture: THREE.Texture,
  crowns: THREE.Vector3[],
  root: THREE.Object3D,
  waterAt: (x: number, z: number) => number | null,
): Fallen {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  let state = 0x1b873593;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const placed: THREE.Matrix4[] = [];

  const spots = new Float32Array(crowns.length * PER_CROWN * 2);

  for (const [crown, index] of crowns.map((one, at) => [one, at] as const)) {
    for (let leaf = 0; leaf < PER_CROWN; leaf++) {
      const angle = next() * Math.PI * 2;
      const radius = litterRadius(next);
      const at = (index * PER_CROWN + leaf) * 2;

      spots[at] = crown.x + Math.cos(angle) * radius;
      spots[at + 1] = crown.z + Math.sin(angle) * radius;
    }
  }

  const landings = landingsUnder(root, spots);

  for (const [index, landing] of landings.entries()) {
    if (!landing) continue;

    const x = spots[index * 2]!;
    const z = spots[index * 2 + 1]!;

    const water = waterAt(x, z);
    if (water !== null && landing.y <= water + 0.05) continue;

    normal.set(landing.nx, landing.ny, landing.nz);

    if (normal.y < SLOPE_LIMIT) continue;

    tilt.setFromUnitVectors(up, normal);
    spin.setFromAxisAngle(normal, next() * Math.PI * 2);
    quaternion.multiplyQuaternions(spin, tilt);

    const size = LITTER_SIZE.min + next() * (LITTER_SIZE.max - LITTER_SIZE.min);
    scale.set(size, size, size);

    position.set(x, landing.y, z).addScaledVector(normal, size * LITTER_LIFT);

    placed.push(matrix.clone().compose(position, quaternion, scale));
  }

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(placed.length, 1));
  mesh.name = 'world-fallen-leaves';
  mesh.count = placed.length;

  for (const [index, transform] of placed.entries()) mesh.setMatrixAt(index, transform);
  mesh.instanceMatrix.needsUpdate = true;

  mesh.computeBoundingSphere();

  mesh.castShadow = false;
  mesh.receiveShadow = true;

  parent.add(mesh);

  return {
    dispose: () => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
