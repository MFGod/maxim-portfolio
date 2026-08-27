import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { attachTornado, TURN_SECONDS } from '@/lib/world/tornado';

const ANGULAR_SPEED = (Math.PI * 2) / TURN_SECONDS;

/** Ось столба в локальных координатах макета. */
const AXIS = { x: 10, z: -5 };
/** Сдвиг узла карты: в сцене смерч лежит внутри группы, обломки — снаружи. */
const MAP_OFFSET = { x: 2, z: 3 };

const WORLD_AXIS = { x: AXIS.x + MAP_OFFSET.x, z: AXIS.z + MAP_OFFSET.z };

/**
 * Макет воронки: узкий столб внизу и широкая шапка, смещённая вбок.
 *
 * Шапка здесь не для красоты — она проверяет, что ось берётся по нижней части,
 * а не по центру габаритного ящика: центр ящика такой геометрии уехал бы к
 * шапке, и смерч крутился бы вокруг чужой точки.
 */
function funnelGeometry(): THREE.BufferGeometry {
  const points: number[] = [];

  // Столб: квадратное сечение вокруг оси, высота 0..1.
  for (const y of [0, 0.5, 1]) {
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      points.push(AXIS.x + dx!, y, AXIS.z + dz!);
    }
  }

  // Шапка на высоте 8, уведённая на +6 по X и +4 по Z.
  for (const [dx, dz] of [
    [4, 2],
    [8, 2],
    [8, 6],
    [4, 6],
  ]) {
    points.push(AXIS.x + dx!, 8, AXIS.z + dz!);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/** Кольцо обломков вокруг мировой оси: четыре камня радиусом 3 на высоте 6. */
function debrisMesh(): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshBasicMaterial(),
    4,
  );
  mesh.name = 'azula_stone';

  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i;
    matrix.makeTranslation(
      WORLD_AXIS.x + Math.cos(angle) * 3,
      6,
      WORLD_AXIS.z + Math.sin(angle) * 3,
    );
    mesh.setMatrixAt(i, matrix);
  }

  return mesh;
}

function makeScene() {
  const scene = new THREE.Scene();

  const material = new THREE.MeshBasicMaterial();
  material.name = 'Tornado';
  const funnel = new THREE.Mesh(funnelGeometry(), material);

  // Узел карты со своим сдвигом — как `Icosphere.431` в `map.glb`.
  const map = new THREE.Group();
  map.position.set(MAP_OFFSET.x, 0, MAP_OFFSET.z);
  map.add(funnel);
  scene.add(map);

  const debris = debrisMesh();
  scene.add(debris);
  scene.updateMatrixWorld(true);

  return { scene, funnel, debris };
}

/** Позиция инстанса в мировых координатах. */
function instanceAt(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, index * 16);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

describe('attachTornado', () => {
  it('ставит ось по столбу, а не по центру габаритного ящика', () => {
    const { scene, funnel } = makeScene();
    attachTornado(scene);

    expect(funnel.position.x).toBeCloseTo(AXIS.x, 5);
    expect(funnel.position.z).toBeCloseTo(AXIS.z, 5);

    // Геометрия сдвинута на ось: столб теперь вокруг нуля, шапка — сбоку.
    funnel.geometry.computeBoundingBox();
    const box = funnel.geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(-1, 5);
    expect(box.min.z).toBeCloseTo(-1, 5);
  });

  it('крутит воронку на месте, а не по орбите', () => {
    const { scene, funnel } = makeScene();
    const tornado = attachTornado(scene)!;

    const before = new THREE.Vector3();
    funnel.getWorldPosition(before);

    tornado.update(10);
    scene.updateMatrixWorld(true);

    const after = new THREE.Vector3();
    funnel.getWorldPosition(after);

    expect(funnel.rotation.y).toBeCloseTo(ANGULAR_SPEED * 10, 6);
    expect(after.distanceTo(before)).toBeCloseTo(0, 6);
    expect(before.x).toBeCloseTo(WORLD_AXIS.x, 5);
    expect(before.z).toBeCloseTo(WORLD_AXIS.z, 5);
  });

  it('ведёт обломки по кругу вокруг оси смерча', () => {
    const { scene, debris } = makeScene();
    const tornado = attachTornado(scene)!;

    const before = instanceAt(debris, 0);
    const version = debris.instanceMatrix.version;
    tornado.update(30);
    const after = instanceAt(debris, 0);

    const radiusOf = (point: THREE.Vector3) =>
      Math.hypot(point.x - WORLD_AXIS.x, point.z - WORLD_AXIS.z);
    const angleOf = (point: THREE.Vector3) =>
      Math.atan2(point.z - WORLD_AXIS.z, point.x - WORLD_AXIS.x);

    expect(radiusOf(after)).toBeCloseTo(radiusOf(before), 5);
    expect(after.y).toBeCloseTo(before.y, 5);

    // Тридцать секунд — четверть оборота: поворот по Y идёт по часовой стрелке,
    // поэтому угол в плоскости XZ убывает.
    const turned = angleOf(before) - angleOf(after);
    expect(turned).toBeCloseTo(ANGULAR_SPEED * 30, 5);
    // `needsUpdate` у атрибута только пишется, читается его счётчик версий.
    expect(debris.instanceMatrix.version).toBeGreaterThan(version);
  });

  it('за полный оборот возвращает всё на свои места', () => {
    const { scene, funnel, debris } = makeScene();
    const tornado = attachTornado(scene)!;

    const before = instanceAt(debris, 2);
    // Оборот кадрами по 1/60 секунды: накопленная ошибка не должна расползаться.
    for (let i = 0; i < TURN_SECONDS * 60; i++) tornado.update(1 / 60);
    const after = instanceAt(debris, 2);

    expect(after.distanceTo(before)).toBeCloseTo(0, 4);
    // Угол живёт по модулю круга и после оборота падает обратно к нулю.
    expect(Math.sin(funnel.rotation.y)).toBeCloseTo(0, 4);
  });

  it('накрывает габаритной сферой всё кольцо обломков', () => {
    const { scene, debris } = makeScene();
    attachTornado(scene);

    const sphere = debris.boundingSphere!;
    expect(sphere.center.x).toBeCloseTo(WORLD_AXIS.x, 5);
    expect(sphere.center.z).toBeCloseTo(WORLD_AXIS.z, 5);
    expect(sphere.radius).toBeGreaterThanOrEqual(3);

    // Любое положение на орбите обязано остаться внутри сферы.
    const tornado = attachTornado(scene)!;
    for (let step = 0; step < 8; step++) {
      tornado.update(TURN_SECONDS / 8);
      for (let i = 0; i < debris.count; i++) {
        expect(sphere.containsPoint(instanceAt(debris, i))).toBe(true);
      }
    }
  });

  it('молчит, когда смерча в сцене нет', () => {
    const scene = new THREE.Scene();
    expect(attachTornado(scene)).toBeNull();
  });
});
