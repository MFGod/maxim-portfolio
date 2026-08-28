/**
 * Смерч Фарум Азула и его обломки: единственное движение в неподвижном мире.
 *
 * В карте смерч — не отдельный узел, а примитив меша `Icosphere.430` с
 * материалом `Tornado`: GLTFLoader раскладывает 148 примитивов в 148 дочерних
 * мешей, и найти нужный можно только по имени материала. Крутить его «как
 * есть» нельзя — начало координат меша лежит в начале карты, и `rotation.y`
 * увёл бы столб по орбите радиусом в полсотни юнитов. Поэтому геометрия
 * сдвигается на свою ось, а меш встаёт на её прежнее место.
 *
 * Ось берётся не по центру габаритного ящика: шапка облака над воронкой
 * вытянута в одну сторону и утащила бы центр от столба. Считаем по нижней
 * четверти высоты — там смерч и есть тот вертикальный столб, вокруг которого
 * всё вертится.
 *
 * Обломки — инстанс-меш `azula_stone`, 200 камней кольцом вокруг воронки.
 * Каждый кадр их матрицы пересчитываются от снимка исходных: поворот вокруг
 * оси смерча заодно проворачивает и сам камень, что для летящего в вихре
 * обломка и нужно.
 */

import * as THREE from 'three';

/** Имя материала, по которому смерч опознаётся в мешах карты. */
const FUNNEL_MATERIAL = 'Tornado';

/** Имя инстанс-меша с обломками. Совпадает с именем в `assets.ts`. */
const DEBRIS_MESH = 'azula_stone';

/**
 * Полный оборот за столько секунд. Подобрано вживую: медленно, но заметно.
 * Экспортируется, чтобы тест мерил ту же скорость, а не свою копию числа.
 */
export const TURN_SECONDS = 91;

const ANGULAR_SPEED = (Math.PI * 2) / TURN_SECONDS;

/** Доля высоты снизу, по которой ищется ось столба. */
const AXIS_SLICE = 0.25;

export type Tornado = {
  /** Продвинуть вращение. Вызывается из цикла сцены. */
  update: (delta: number) => void;
  dispose: () => void;
};

/**
 * Ось столба в локальных координатах геометрии: среднее XZ по вершинам нижней
 * четверти высоты.
 */
function funnelAxis(geometry: THREE.BufferGeometry): { x: number; z: number } {
  const position = geometry.getAttribute('position');
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const limit = box.min.y + (box.max.y - box.min.y) * AXIS_SLICE;

  let sumX = 0;
  let sumZ = 0;
  let counted = 0;

  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > limit) continue;
    sumX += position.getX(i);
    sumZ += position.getZ(i);
    counted++;
  }

  // Вырожденный случай — плоская геометрия: тогда центр ящика не хуже.
  if (counted === 0)
    return { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };

  return { x: sumX / counted, z: sumZ / counted };
}

function findFunnel(scene: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;

  scene.traverse((object) => {
    if (found) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.Material | THREE.Material[];
    const name = Array.isArray(material) ? material[0]?.name : material.name;
    if (name === FUNNEL_MATERIAL) found = mesh;
  });

  return found;
}

/**
 * Габаритная сфера обломков на всё кольцо: инстансы разъезжаются по орбите, и
 * сфера, снятая с их начальных мест, вытолкнула бы половину кольца из отсечения
 * по пирамиде видимости — камни пропадали бы на повороте.
 */
function sweptSphere(
  matrices: Float32Array,
  count: number,
  geometry: THREE.BufferGeometry,
  axisX: number,
  axisZ: number,
): THREE.Sphere {
  geometry.computeBoundingSphere();
  const own = geometry.boundingSphere?.radius ?? 0;

  let minY = Infinity;
  let maxY = -Infinity;
  let maxRadius = 0;

  for (let i = 0; i < count; i++) {
    const at = i * 16;
    const x = matrices[at + 12]!;
    const y = matrices[at + 13]!;
    const z = matrices[at + 14]!;
    const scale = Math.hypot(matrices[at]!, matrices[at + 1]!, matrices[at + 2]!) || 1;

    maxRadius = Math.max(maxRadius, Math.hypot(x - axisX, z - axisZ) + own * scale);
    minY = Math.min(minY, y - own * scale);
    maxY = Math.max(maxY, y + own * scale);
  }

  const midY = (minY + maxY) / 2;
  const halfHeight = (maxY - minY) / 2;

  return new THREE.Sphere(
    new THREE.Vector3(axisX, midY, axisZ),
    Math.hypot(maxRadius, halfHeight),
  );
}

/**
 * Заводит вращение. Вызывать после того, как пришли и карта, и инстансы.
 *
 * @returns `null`, если смерча в сцене нет — мир от этого не ломается
 */
export function attachTornado(scene: THREE.Object3D): Tornado | null {
  const funnel = findFunnel(scene);
  if (!funnel) return null;

  const axis = funnelAxis(funnel.geometry);
  funnel.geometry.translate(-axis.x, 0, -axis.z);
  funnel.position.x += axis.x;
  funnel.position.z += axis.z;
  funnel.geometry.computeBoundingSphere();

  // Ось в мировых координатах: обломки лежат в сцене, а не внутри узла карты.
  funnel.updateWorldMatrix(true, false);
  const world = new THREE.Vector3();
  funnel.getWorldPosition(world);

  const debris = scene.getObjectByName(DEBRIS_MESH) as THREE.InstancedMesh | undefined;

  // Снимок исходных матриц: поворот считается от них, а не от прошлого кадра,
  // иначе ошибка округления за час полёта расползётся по всему кольцу.
  const base = debris ? Float32Array.from(debris.instanceMatrix.array) : null;

  if (debris && base) {
    debris.boundingSphere = sweptSphere(
      base,
      debris.count,
      debris.geometry,
      world.x,
      world.z,
    );
  }

  const pivot = new THREE.Matrix4();
  const spin = new THREE.Matrix4();
  const toAxis = new THREE.Matrix4().makeTranslation(-world.x, 0, -world.z);
  const fromAxis = new THREE.Matrix4().makeTranslation(world.x, 0, world.z);
  const instance = new THREE.Matrix4();

  let angle = 0;

  return {
    update: (delta: number) => {
      angle = (angle + ANGULAR_SPEED * delta) % (Math.PI * 2);
      funnel.rotation.y = angle;

      if (!debris || !base) return;

      pivot.copy(fromAxis).multiply(spin.makeRotationY(angle)).multiply(toAxis);

      const target = debris.instanceMatrix.array as Float32Array;
      for (let i = 0; i < debris.count; i++) {
        instance.fromArray(base, i * 16);
        instance.premultiply(pivot);
        instance.toArray(target, i * 16);
      }
      debris.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      // Геометрию и матрицы разберёт сцена: держать здесь нечего, кроме ссылок.
    },
  };
}
