/** Кольцо облаков — граница мира. Круг вписывает в себя всю карту. */

import * as THREE from 'three';

import { MAP_BOUNDS, SEA_LEVEL, type WorldBounds } from './bounds';

/** Модель облака и её габарит в мире. */
export type CloudModel = {
  name: string;
  /** Длина комка вдоль его X. Ею меряется перекрытие соседей. */
  width: number;
  height: number;
  /** Толщина поперёк окружности. Ею меряется заход внутрь круга. */
  depth: number;
  bottom: number;
};

export const CLOUD_MODELS: readonly CloudModel[] = [
  { name: 'cloud_1', width: 2.972, height: 1.632, depth: 1.85, bottom: -0.828 },
  { name: 'cloud_2', width: 8.097, height: 1.306, depth: 1.85, bottom: -0.663 },
  { name: 'cloud_3', width: 4.006, height: 2.402, depth: 2.447, bottom: -0.236 },
  { name: 'cloud_5', width: 4.264, height: 2.067, depth: 1.747, bottom: -1.034 },
];

/**
 * Наибольший шаг по окружности, при котором соседи ещё перекрываются.
 * @param zoom общий множитель размера кольца — у гряды 1, у дальних колец больше
 */
export function overlapStep(zoom = 1): number {
  const narrowest = Math.min(...CLOUD_MODELS.map((model) => model.width));
  const reach = narrowest * CLOUD_SCALE_MIN * zoom * Math.cos(CLOUD_YAW);

  return (0.9 * reach) / (1 + CLOUD_SLIDE);
}

/** Разброс размера комка. */
export const CLOUD_SCALE_MIN = 1.6;
export const CLOUD_SCALE_MAX = 2.4;

/** Сдвиг середины комка поперёк окружности, юнитов. Наружу — плюс. */
export const CLOUD_OUT = 0;

/** Разброс сдвига поперёк окружности. Ряд без него читается забором. */
export const CLOUD_SWAY = 1.1;

/** Рядов в гряде. */
export const CLOUD_ROWS = 2;

/** Отступ каждого следующего ряда внутрь круга, юнитов. */
export const CLOUD_ROW_INSET = 3;

/** Разброс сдвига вдоль окружности, долей шага. */
export const CLOUD_SLIDE = 0.35;

/** Насколько низ комка уходит под уровень моря — долей его собственной высоты. */
export const CLOUD_SINK = 0.6;

/** Доворот комка вокруг вертикали, радиан. Ряд одинаково развёрнутых — гребёнка. */
export const CLOUD_YAW = 0.3;

/** Шаг гряды по окружности. */
export const CLOUD_STEP = overlapStep();

/** Сила собственного свечения комьев. */
export const CLOUD_GLOW = 0.4;

/**
 * Зазор между углом карты и кольцом, юнитов. Круг описан вокруг прямоугольника
 * границ и касался бы углов: зазор уводит от них и сами комья, и их толщину.
 */
export const HORIZON_MARGIN = 8;

/** Окружность границы мира: середина карты и радиус кольца. */
export type WorldCircle = {
  x: number;
  z: number;
  radius: number;
};

/**
 * Место одного комка. Матрица собирается уже в `attachClouds`: в раскладке
 * держим числа, которые можно прочитать в тесте, а не готовый `Matrix4`.
 */
export type CloudPlacement = {
  /** Номер модели в `CLOUD_MODELS`. */
  model: number;
  x: number;
  /** Середина комка по высоте: низ утоплен под `SEA_LEVEL` на долю высоты. */
  y: number;
  z: number;
  /** Поворот вокруг вертикали. Длинная ось комка идёт по касательной. */
  yaw: number;
  scale: number;
};

/**
 * Устойчивый псевдослучай по числу — тот же, что разводит прыжки горшков
 * (`pots.ts`) и распорядок фигур (`routine.ts`). Разброс важнее качества
 * распределения: комьев полторы сотни, и одинаковыми они должны быть от
 * загрузки к загрузке — гряда часть кадра, а не украшение.
 */
function hash(value: number): number {
  const noise = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return noise - Math.floor(noise);
}

/** Середина прямоугольника границ. */
export function boundsCenter(bounds: WorldBounds = MAP_BOUNDS) {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
}

/**
 * The radius of the cloud ring that wraps the 3d model of the world with water plain.
 */
export const CLOUD_BOUNDARY_RADIUS = 50

/**
 * Круг границы мира. Он не обрамляет карту по кромке, а вписывает её в себя
 * целиком: до кольца от берега везде остаётся открытая вода.
 */
export function cloudCircle(bounds: WorldBounds = MAP_BOUNDS): WorldCircle {
  return {
    ...boundsCenter(bounds),
    radius: CLOUD_BOUNDARY_RADIUS + HORIZON_MARGIN,
  };
}

/** Половина толщины самого крупного комка кольца. */
function bodyReach(zoom: number): number {
  const thickest = Math.max(...CLOUD_MODELS.map((model) => model.depth));

  return (thickest * zoom * CLOUD_SCALE_MAX) / 2;
}

/** Точка на окружности и внешняя нормаль в ней. */
function walk(circle: WorldCircle, distance: number) {
  const angle = distance / circle.radius;
  const nx = Math.cos(angle);
  const nz = Math.sin(angle);

  return {
    x: circle.x + nx * circle.radius,
    z: circle.z + nz * circle.radius,
    nx,
    nz,
    /** Касательная: длинная ось комка идёт вдоль края, а не поперёк. */
    yaw: Math.PI / 2 - angle,
  };
}

/** Гряда по кругу: где стоит каждый комок. */
export function cloudRing(bounds: WorldBounds = MAP_BOUNDS): CloudPlacement[] {
  const circle = cloudCircle(bounds);
  const count = Math.round((2 * Math.PI * circle.radius) / CLOUD_STEP);

  const ring: CloudPlacement[] = [];

  for (let row = 0; row < CLOUD_ROWS; row++) {
    const seed = row * 1531;
    /** Внутренний ряд идёт по своему кругу, но тем же числом комьев. */
    const lane: WorldCircle = {
      ...circle,
      radius: circle.radius - row * CLOUD_ROW_INSET,
    };
    const step = (2 * Math.PI * lane.radius) / count;
    const phase = row * step * 0.5;

    for (let index = 0; index < count; index++) {
      const model =
        Math.floor(hash(index + seed) * CLOUD_MODELS.length) % CLOUD_MODELS.length;
      const scale =
        CLOUD_SCALE_MIN +
        hash(index + seed + 101) * (CLOUD_SCALE_MAX - CLOUD_SCALE_MIN);

      const slide = (hash(index + seed + 211) - 0.5) * step * CLOUD_SLIDE;
      const point = walk(lane, index * step + phase + slide);

      const sway = CLOUD_OUT + (hash(index + seed + 307) - 0.5) * 2 * CLOUD_SWAY;
      const shape = CLOUD_MODELS[model]!;
      const bottom = shape.bottom * scale;
      const sink = shape.height * scale * CLOUD_SINK;

      ring.push({
        model,
        x: point.x + point.nx * sway,
        z: point.z + point.nz * sway,
        y: SEA_LEVEL - sink - bottom,
        yaw: point.yaw + (hash(index + seed + 419) - 0.5) * 2 * CLOUD_YAW,
        scale,
      });
    }
  }

  return ring;
}

/** Поле облаков за кольцом: насколько кольцо отодвинуто наружу и во сколько раз крупнее. */
export const CLOUD_FIELD: readonly { out: number; scale: number }[] = [
  { out: 4, scale: 2.2 },
  { out: 13, scale: 2.9 },
  { out: 24, scale: 3.6 },
  { out: 37, scale: 4.4 },
  { out: 52, scale: 5.2 },
];

/** Разброс кольца поперёк, долей расстояния до дальнего соседа. */
const FIELD_SPREAD = 0.35;

export function fieldSway(order: number): number {
  const here = CLOUD_FIELD[order]!;
  const next = CLOUD_FIELD[order + 1];
  const previous = CLOUD_FIELD[order - 1];

  const outward = next ? next.out - here.out : here.out - (previous?.out ?? 0);
  const inward = previous ? here.out - previous.out : here.out;

  return Math.max(outward, inward) * FIELD_SPREAD;
}

/** Все комья границы: гряда по кругу и, если позволено, поле за ней. */
export function cloudPlaces(
  bounds: WorldBounds = MAP_BOUNDS,
  field = true,
): CloudPlacement[] {
  return field ? [...cloudRing(bounds), ...cloudField(bounds)] : cloudRing(bounds);
}

export function cloudField(bounds: WorldBounds = MAP_BOUNDS): CloudPlacement[] {
  const circle = cloudCircle(bounds);
  const field: CloudPlacement[] = [];

  CLOUD_FIELD.forEach((ring, order) => {
    const outer: WorldCircle = { ...circle, radius: circle.radius + ring.out };

    const count = Math.round((2 * Math.PI * outer.radius) / overlapStep(ring.scale));
    const step = (2 * Math.PI * outer.radius) / count;
    const spread = fieldSway(order);
    const seed = 7717 + order * 2311;

    for (let index = 0; index < count; index++) {
      const model =
        Math.floor(hash(index + seed) * CLOUD_MODELS.length) % CLOUD_MODELS.length;
      const scale =
        ring.scale *
        (CLOUD_SCALE_MIN +
          hash(index + seed + 101) * (CLOUD_SCALE_MAX - CLOUD_SCALE_MIN));

      const slide = (hash(index + seed + 211) - 0.5) * step * CLOUD_SLIDE;
      const point = walk(outer, index * step + slide);
      const sway = (hash(index + seed + 307) - 0.5) * 2 * spread;

      const shape = CLOUD_MODELS[model]!;
      const sink = shape.height * scale * CLOUD_SINK;

      field.push({
        model,
        x: point.x + point.nx * sway,
        z: point.z + point.nz * sway,
        y: SEA_LEVEL - sink - shape.bottom * scale,
        yaw: point.yaw + (hash(index + seed + 419) - 0.5) * 2 * CLOUD_YAW,
        scale,
      });
    }
  });

  return field;
}

/** Докуда достаёт самый дальний комок поля: радиус от середины карты. */
export function cloudReach(bounds: WorldBounds = MAP_BOUNDS): number {
  const last = CLOUD_FIELD.length - 1;
  const ring = CLOUD_FIELD[last]!;

  return (
    cloudCircle(bounds).radius + ring.out + fieldSway(last) + bodyReach(ring.scale)
  );
}

/** Цвет воды, к которому уводится внутренний край подложки. */
const WATER_TINT = 0x46d3dd;

/** Насколько внутренний край подложки уведён от неба к воде. */
const FLOOR_SEA = 0.35;

/** Насколько подложка выходит за последнее кольцо поля, юнитов. */
export const FLOOR_MARGIN = 12;

/** Заход подложки внутрь карты, юнитов. */
const FLOOR_BITE = 0.5;

/** Насколько подложка ниже уровня моря. Только чтобы не спорить с водой за глубину. */
const FLOOR_DROP = 0.01;

/** Долей окружности на одну грань внешнего края подложки. */
const FLOOR_SEGMENTS = 96;

/** Радиус подложки от середины карты: она кончается дальше самого дальнего комка. */
export function floorRadius(bounds: WorldBounds = MAP_BOUNDS): number {
  return cloudReach(bounds) + FLOOR_MARGIN;
}

/**
 * Углы, по которым нарезается подложка: равномерный обход плюс углы карты.
 * Без них грань перекрыла бы угол хордой и подложка залезла бы на сушу.
 */
function floorAngles(inner: WorldBounds, center: { x: number; z: number }): number[] {
  const turn = Math.PI * 2;
  const angles: number[] = [];

  for (let index = 0; index < FLOOR_SEGMENTS; index++) {
    angles.push((index / FLOOR_SEGMENTS) * turn);
  }

  for (const x of [inner.minX, inner.maxX]) {
    for (const z of [inner.minZ, inner.maxZ]) {
      angles.push((Math.atan2(z - center.z, x - center.x) + turn) % turn);
    }
  }

  return angles.sort((a, b) => a - b);
}

/** Где луч из середины карты под этим углом протыкает прямоугольник. */
function rayToBounds(
  inner: WorldBounds,
  center: { x: number; z: number },
  angle: number,
): [number, number] {
  const nx = Math.cos(angle);
  const nz = Math.sin(angle);

  const reach = Math.min(
    Math.abs(nx) < 1e-9 ? Infinity : (inner.maxX - inner.minX) / 2 / Math.abs(nx),
    Math.abs(nz) < 1e-9 ? Infinity : (inner.maxZ - inner.minZ) / 2 / Math.abs(nz),
  );

  return [center.x + nx * reach, center.z + nz * reach];
}

/**
 * Подложка под полем облаков: кольцо от кромки карты до края круга. Она даёт
 * морю продолжение там, где тайлы уже кончились, и уводит его в цвет неба.
 */
function cloudFloor(bounds: WorldBounds, radius: number): THREE.Mesh {
  const inner: WorldBounds = {
    minX: bounds.minX + FLOOR_BITE,
    maxX: bounds.maxX - FLOOR_BITE,
    minZ: bounds.minZ + FLOOR_BITE,
    maxZ: bounds.maxZ - FLOOR_BITE,
  };

  const center = boundsCenter(bounds);
  const angles = floorAngles(inner, center);

  const y = SEA_LEVEL - FLOOR_DROP;
  const positions: number[] = [];
  const indices: number[] = [];

  for (const angle of angles) {
    const [x, z] = rayToBounds(inner, center, angle);
    positions.push(x, y, z);
    positions.push(
      center.x + Math.cos(angle) * radius,
      y,
      center.z + Math.sin(angle) * radius,
    );
  }

  for (let edge = 0; edge < angles.length; edge++) {
    const here = edge * 2;
    const next = ((edge + 1) % angles.length) * 2;
    indices.push(here, here + 1, next + 1, here, next + 1, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(new Array(positions.length).fill(1), 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = 'CloudFloor';
  mesh.renderOrder = -1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return mesh;
}

export type Clouds = {
  /** Ставит цвет свечения комьев под набор освещения. */
  setLight: (disc: number, sky: number) => void;
  dispose: () => void;
};

/** Геометрия комка из загруженного файла, с запечённой нодой. */
function bakedGeometry(gltf: { scene: THREE.Object3D }): THREE.BufferGeometry {
  let found: THREE.BufferGeometry | null = null;

  gltf.scene.updateWorldMatrix(true, true);
  gltf.scene.traverse((object) => {
    if (found || !(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    found = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  });

  if (!found) throw new Error('мир: в модели облака нет меша');
  return found;
}

/**
 * Ставит кольцо в сцену.
 * @param models загруженные `cloud_1..5.glb` — в порядке `CLOUD_MODELS`
 */
export function attachClouds(
  parent: THREE.Object3D,
  models: readonly { scene: THREE.Object3D }[],
  bounds: WorldBounds = MAP_BOUNDS,
  field = true,
): Clouds {
  if (models.length !== CLOUD_MODELS.length) {
    throw new Error(
      `мир: гряде нужно ${CLOUD_MODELS.length} моделей облаков, пришло ${models.length}`,
    );
  }

  const group = new THREE.Group();
  group.name = 'Clouds';

  const floor = cloudFloor(bounds, floorRadius(bounds));
  group.add(floor);

  const geometries = models.map((model) => bakedGeometry(model));

  /**
   * Комья в тумане наравне с миром: без этого кольцо стояло бы чёткой стеной
   * там, где всё остальное уже ушло в небо.
   */
  const material = new THREE.MeshStandardMaterial({
    color: 0xdfe6f0,
    roughness: 0.95,
    metalness: 0,
    emissiveIntensity: CLOUD_GLOW,
  });

  const places = cloudPlaces(bounds, field);

  const meshes = geometries.map((geometry, model) => {
    const count = places.filter((place) => place.model === model).length;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `Cloud_${CLOUD_MODELS[model]!.name}`;

    mesh.castShadow = false;
    mesh.receiveShadow = false;

    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const measured = box.max.y - box.min.y;
    const expected = CLOUD_MODELS[model]!.height;
    if (Math.abs(measured - expected) > 0.05) {
      throw new Error(
        `мир: у ${CLOUD_MODELS[model]!.name} высота ${measured.toFixed(3)}, а раскладка считает ${expected}`,
      );
    }

    group.add(mesh);
    return mesh;
  });

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const filled = new Array(meshes.length).fill(0) as number[];

  for (const place of places) {
    position.set(place.x, place.y, place.z);
    quaternion.setFromAxisAngle(up, place.yaw);
    scale.set(place.scale, place.scale, place.scale);
    matrix.compose(position, quaternion, scale);

    const mesh = meshes[place.model]!;
    const next = filled[place.model]!;
    mesh.setMatrixAt(next, matrix);
    filled[place.model] = next + 1;
  }

  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  parent.add(group);

  return {
    setLight: (disc: number, sky: number) => {
      material.emissive.setHex(disc);

      const far = new THREE.Color(sky);
      const near = far.clone().lerp(new THREE.Color(WATER_TINT), FLOOR_SEA);

      const colors = floor.geometry.getAttribute('color') as THREE.BufferAttribute;
      for (let edge = 0; edge < colors.count / 2; edge++) {
        colors.setXYZ(edge * 2, near.r, near.g, near.b);
        colors.setXYZ(edge * 2 + 1, far.r, far.g, far.b);
      }
      colors.needsUpdate = true;
    },

    dispose: () => {
      parent.remove(group);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      for (const mesh of meshes) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
    },
  };
}
