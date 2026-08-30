import * as THREE from 'three';

import { CAMERA_FLOOR, type WorldBounds } from './bounds';

/** Карман — место, где потолок проседает. */
export type ShellPocket = {
  x: number;
  z: number;
  /** До какой высоты опускается потолок в середине кармана. */
  floor: number;
  /** Радиус полного послабления. */
  radius: number;
  /** Радиус, на котором послабление сходит на нет. */
  fade: number;
};

/** Снятая сетка высот. `data` пересобирается при смене бокового отступа. */
type ShellField = {
  data: Float32Array;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
};

/** Сторона ячейки. */
const CELL = 0.25;

/** Порог «треугольник плоский» — такой заливается прямоугольником целиком. */
const FLAT_EPSILON = 0.15;

/** Что в оболочку не попадает. */
const EXCLUDED_MESHES = new Set(['Icosphere430_90', 'Icosphere430_91']);
const EXCLUDED_MATERIALS = /leaves|листва|painting erdtree/i;

export const shellSettings = {
  enabled: true,
  /** На сколько оболочка отстоит от рельефа вверх. */
  padding: 0.35,
  /** На сколько оболочка отходит от обрывов вбок, в юнитах мира. */
  spread: 0.5,
  visible: false,
};

/** Карманы послабления. Пустой список — оболочка работает как обычно. */
let pockets: ShellPocket[] = [];

export function setShellPockets(next: ShellPocket[]) {
  pockets = next;
}

/** Опускает потолок внутри карманов. */
function relax(x: number, z: number, ceiling: number): number {
  let result = ceiling;

  for (const pocket of pockets) {
    const distance = Math.hypot(x - pocket.x, z - pocket.z);
    if (distance >= pocket.fade) continue;

    const span = pocket.fade - pocket.radius;
    const t = distance <= pocket.radius ? 0 : (distance - pocket.radius) / span;
    const floor = Math.max(pocket.floor, CAMERA_FLOOR);
    const relaxed = floor + (ceiling - floor) * t;

    if (relaxed < result) result = relaxed;
  }

  return result;
}

let field: ShellField | null = null;
/** Сырые высоты до раздутия — чтобы менять боковой отступ без пересборки. */
let raw: Float32Array | null = null;

/** Раздувает сетку вширь: клетка забирает максимум по квадратной окрестности. */
function dilate(
  source: Float32Array,
  cols: number,
  rows: number,
  radius: number,
): Float32Array {
  if (radius <= 0) return source.slice();

  const pass = new Float32Array(source.length);
  const result = new Float32Array(source.length);

  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    for (let c = 0; c < cols; c++) {
      let best = -Infinity;
      const from = Math.max(0, c - radius);
      const to = Math.min(cols - 1, c + radius);
      for (let k = from; k <= to; k++)
        if (source[row + k]! > best) best = source[row + k]!;
      pass[row + c] = best;
    }
  }

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      let best = -Infinity;
      const from = Math.max(0, r - radius);
      const to = Math.min(rows - 1, r + radius);
      for (let k = from; k <= to; k++) {
        const value = pass[k * cols + c]!;
        if (value > best) best = value;
      }
      result[r * cols + c] = best;
    }
  }

  return result;
}

/** Пересобирает раздутие из сырых высот. Пересчёта геометрии не требует. */
export function applySpread() {
  if (!raw || !field) return null;
  const started = performance.now();
  const radius = Math.round(shellSettings.spread / CELL);
  field.data = dilate(raw, field.cols, field.rows, radius);
  return { радиусКлеток: radius, мс: +(performance.now() - started).toFixed(1) };
}

/** Не рельеф: крона Древа и всё, что помечено листвой. */
export const notTerrain = (object: THREE.Mesh): boolean =>
  EXCLUDED_MESHES.has(object.name) ||
  EXCLUDED_MATERIALS.test((object.material as THREE.Material | undefined)?.name ?? '');

/**
 * Снимает рельеф в регулярную сетку.
 * @param {THREE.Object3D} root корень карты
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds
 */
export function buildMapShell(root: THREE.Object3D, bounds: WorldBounds) {
  const started = performance.now();

  const minX = bounds.minX;
  const minZ = bounds.minZ;
  const cols = Math.ceil((bounds.maxX - minX) / CELL) + 1;
  const rows = Math.ceil((bounds.maxZ - minZ) / CELL) + 1;
  const data = new Float32Array(cols * rows).fill(-Infinity);

  const raise = (cx: number, cz: number, y: number) => {
    if (cx < 0 || cx >= cols || cz < 0 || cz >= rows) return;
    const at = cz * cols + cx;
    if (y > data[at]!) data[at] = y;
  };

  let triangles = 0;
  let ignored = 0;

  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const object = node as THREE.Mesh;
    if (!object.isMesh || (object as THREE.InstancedMesh).isInstancedMesh) return;
    if (notTerrain(object)) {
      ignored++;
      return;
    }

    const position = object.geometry.attributes.position;
    if (!position) return;

    const points = position.array;
    const index = object.geometry.index ? object.geometry.index.array : null;
    const count = index ? index.length / 3 : position.count / 3;
    const e = object.matrixWorld.elements;
    const e0 = e[0]!,
      e1 = e[1]!,
      e2 = e[2]!;
    const e4 = e[4]!,
      e5 = e[5]!,
      e6 = e[6]!;
    const e8 = e[8]!,
      e9 = e[9]!,
      e10 = e[10]!;
    const e12 = e[12]!,
      e13 = e[13]!,
      e14 = e[14]!;

    for (let t = 0; t < count; t++) {
      triangles++;

      let ax = 0,
        ay = 0,
        az = 0,
        bx = 0,
        by = 0,
        bz = 0,
        cx = 0,
        cy = 0,
        cz = 0;

      for (let k = 0; k < 3; k++) {
        const id = (index ? index[t * 3 + k]! : t * 3 + k) * 3;
        const px = points[id]!,
          py = points[id + 1]!,
          pz = points[id + 2]!;
        const x = e0 * px + e4 * py + e8 * pz + e12;
        const y = e1 * px + e5 * py + e9 * pz + e13;
        const z = e2 * px + e6 * py + e10 * pz + e14;
        if (k === 0) {
          ax = x;
          ay = y;
          az = z;
        } else if (k === 1) {
          bx = x;
          by = y;
          bz = z;
        } else {
          cx = x;
          cy = y;
          cz = z;
        }
      }

      const top = Math.max(ay, by, cy);
      const c0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - minX) / CELL));
      const c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx, cx) - minX) / CELL));
      const r0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - minZ) / CELL));
      const r1 = Math.min(rows - 1, Math.floor((Math.max(az, bz, cz) - minZ) / CELL));
      if (c1 < c0 || r1 < r0) continue;

      if (c0 === c1 && r0 === r1) {
        raise(c0, r0, top);
        continue;
      }

      if (top - Math.min(ay, by, cy) <= FLAT_EPSILON) {
        for (let r = r0; r <= r1; r++) {
          const row = r * cols;
          for (let c = c0; c <= c1; c++) if (top > data[row + c]!) data[row + c] = top;
        }
        continue;
      }

      const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (Math.abs(area) >= 1e-12) {
        const inverse = 1 / area;
        for (let r = r0; r <= r1; r++) {
          const pz = minZ + (r + 0.5) * CELL;
          const row = r * cols;
          for (let c = c0; c <= c1; c++) {
            const px = minX + (c + 0.5) * CELL;
            const wa = ((bx - px) * (cz - pz) - (bz - pz) * (cx - px)) * inverse;
            if (wa < 0) continue;
            const wb = ((cx - px) * (az - pz) - (cz - pz) * (ax - px)) * inverse;
            if (wb < 0) continue;
            const wc = 1 - wa - wb;
            if (wc < 0) continue;
            const y = wa * ay + wb * by + wc * cy;
            if (y > data[row + c]!) data[row + c] = y;
          }
        }
      }

      raise(Math.floor((ax - minX) / CELL), Math.floor((az - minZ) / CELL), ay);
      raise(Math.floor((bx - minX) / CELL), Math.floor((bz - minZ) / CELL), by);
      raise(Math.floor((cx - minX) / CELL), Math.floor((cz - minZ) / CELL), cy);
    }
  });

  raw = data;
  field = { data, cols, rows, minX, minZ };
  const spread = applySpread();

  let filled = 0;
  for (let i = 0; i < data.length; i++) if (data[i]! !== -Infinity) filled++;

  return {
    сетка: `${cols} x ${rows}`,
    заполнено: `${((100 * filled) / data.length).toFixed(0)}%`,
    треугольников: triangles,
    мешейИсключено: ignored,
    боковойОтступ: `${shellSettings.spread} юнита (${spread?.радиусКлеток ?? 0} клеток, ${spread?.мс ?? 0} мс)`,
    мс: +(performance.now() - started).toFixed(1),
    памятиМб: +((2 * data.byteLength) / 1048576).toFixed(2),
  };
}

/** Прореженная сетка высот рельефа: то, что можно отдать шейдеру текстурой. */
export type GroundField = {
  /** Высоты по строкам, снизу вверх по Z. Без карты под точкой — `-Infinity`. */
  data: Float32Array;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  /** Шаг сетки в юнитах мира. */
  cell: number;
};

/**
 * Отдаёт сетку высот, прореженную в `step` раз.
 * @returns `null`, если купол ещё не построен — карта не пришла
 */
export function groundField(step = 4): GroundField | null {
  if (!field) return null;

  const cols = Math.floor((field.cols - 1) / step) + 1;
  const rows = Math.floor((field.rows - 1) / step) + 1;
  const data = new Float32Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let lowest = Infinity;

      for (let dr = 0; dr < step; dr++) {
        for (let dc = 0; dc < step; dc++) {
          const value = cellAt(c * step + dc, r * step + dr);
          if (value !== -Infinity) lowest = Math.min(lowest, value);
        }
      }

      data[r * cols + c] = lowest === Infinity ? -Infinity : lowest;
    }
  }

  return { data, cols, rows, minX: field.minX, minZ: field.minZ, cell: CELL * step };
}

const cellAt = (cx: number, cz: number): number =>
  !field || cx < 0 || cx >= field.cols || cz < 0 || cz >= field.rows
    ? -Infinity
    : field.data[cz * field.cols + cx]!;

/**
 * Высота оболочки в точке: рельеф плюс отступ, сглаженный между клетками.
 * @returns {number|null} null — под точкой нет карты
 */
export function shellHeightAt(x: number, z: number): number | null {
  if (!field) return null;

  const fx = (x - field.minX) / CELL - 0.5;
  const fz = (z - field.minZ) / CELL - 0.5;
  const cx = Math.floor(fx);
  const cz = Math.floor(fz);
  const tx = fx - cx;
  const tz = fz - cz;

  const h00 = cellAt(cx, cz);
  const h10 = cellAt(cx + 1, cz);
  const h01 = cellAt(cx, cz + 1);
  const h11 = cellAt(cx + 1, cz + 1);

  if (
    h00 === -Infinity ||
    h10 === -Infinity ||
    h01 === -Infinity ||
    h11 === -Infinity
  ) {
    const nearest = cellAt(Math.round(fx), Math.round(fz));
    return nearest === -Infinity ? null : relax(x, z, nearest + shellSettings.padding);
  }

  const height =
    tx + tz <= 1
      ? h00 + tx * (h10 - h00) + tz * (h01 - h00)
      : h11 + (1 - tx) * (h01 - h11) + (1 - tz) * (h10 - h11);

  return relax(x, z, height + shellSettings.padding);
}

/** На сколько камера способна взойти за шаг — ниже этого уступ не считается стеной. */
const STEP_UP = 0.35;

/** Предел крутизны подъёма: тангенс угла, «метров вверх на метр вперёд». */
const SLOPE_MAX_TAN = Math.tan((60 * Math.PI) / 180);

/** Не пускает камеру под оболочку. Только вверх — вниз её ничто не тянет. */
export function clampCameraToShell(camera: THREE.Camera, target: THREE.Vector3) {
  if (!field || !shellSettings.enabled) return;

  const floor = shellHeightAt(camera.position.x, camera.position.z);
  if (floor === null || camera.position.y >= floor) return;

  const lift = floor - camera.position.y;
  camera.position.y += lift;
  target.y += lift;
}

/** Укорачивает шаг об стены оболочки. Меняет `velocity` на месте. */
export function clampMovementToShell(camera: THREE.Camera, velocity: THREE.Vector3) {
  if (!field || !shellSettings.enabled) return velocity;
  if (velocity.lengthSq() < 1e-12) return velocity;

  const { x, z, y } = camera.position;
  velocity.x *= sweep(x, z, velocity.x, 0, y);
  velocity.z *= sweep(x + velocity.x, z, 0, velocity.z, y);
  return velocity;
}

/** Какую долю смещения можно пройти, не упершись. */
function sweep(x: number, z: number, dx: number, dz: number, eye: number): number {
  const length = Math.sqrt(dx * dx + dz * dz);
  const steps = Math.max(1, Math.ceil(length / (CELL * 0.5)));

  let passed = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x + dx * t;
    const pz = z + dz * t;
    const floor = shellHeightAt(px, pz);
    if (floor === null) {
      passed = t;
      continue;
    }

    const rise = floor - eye;

    if (rise > STEP_UP && rise > SLOPE_MAX_TAN * length * t) break;

    passed = t;
  }

  return passed;
}

/**
 * Меш оболочки для показа. Шаг крупнее расчётного: глазу хватает, а
 * треугольников выходит на два порядка меньше.
 */
export function buildShellMesh(step = 4): THREE.BufferGeometry | null {
  if (!field) return null;

  const cols = Math.floor((field.cols - 1) / step) + 1;
  const rows = Math.floor((field.rows - 1) / step) + 1;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = field.minX + c * step * CELL;
      const z = field.minZ + r * step * CELL;
      positions.push(x, shellHeightAt(x, z) ?? 0, z);
    }
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
