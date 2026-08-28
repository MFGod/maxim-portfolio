import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  attachPots,
  HOP_HEIGHT_FACTOR,
  HOP_SECONDS,
  hopState,
  potCycle,
} from '@/lib/world/pots';

/** Высота макета горшка. Близка к настоящей (0,0765 юнита). */
const POT_HEIGHT = 0.08;

/** Места горшков: разнесены по полю, чтобы поймать уход по орбите. */
const PLACES = [
  { x: -7.09, y: 1.02, z: 21.2 },
  { x: -7.41, y: 1.03, z: 21.31 },
  { x: 12.5, y: 0.4, z: -8.75 },
  { x: -25.13, y: 0.39, z: 21.37 },
];

/**
 * Макет инстанс-меша горшков: у каждого свой поворот, как в
 * `instanced_data/pot.glb` — там 71 узел и у всех 71 своя ротация.
 */
function potsMesh(count = PLACES.length): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.096, POT_HEIGHT, 0.094),
    new THREE.MeshBasicMaterial(),
    count,
  );
  mesh.name = 'pot';

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < count; i++) {
    const place = PLACES[i % PLACES.length]!;
    // Наклоны разные и не вокруг Y: прыжок обязан их сохранить.
    quaternion.setFromEuler(
      new THREE.Euler(0.4 + i * 0.3, 1.1 + i * 0.7, -0.6 + i * 0.2),
    );
    matrix.compose(new THREE.Vector3(place.x, place.y, place.z), quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }

  return mesh;
}

function makeScene(count?: number) {
  const scene = new THREE.Scene();
  const pots = potsMesh(count);
  scene.add(pots);
  scene.updateMatrixWorld(true);
  return { scene, pots };
}

function matrixAt(mesh: THREE.InstancedMesh, index: number): THREE.Matrix4 {
  return new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, index * 16);
}

function positionAt(mesh: THREE.InstancedMesh, index: number): THREE.Vector3 {
  return new THREE.Vector3().setFromMatrixPosition(matrixAt(mesh, index));
}

/** Момент, когда горшок `index` в верхней точке своего прыжка. */
function peakTime(index: number): number {
  const { period, offset } = potCycle(index);
  return period - offset + HOP_SECONDS / 2;
}

/** Момент, когда горшок `index` стоит на земле между прыжками. */
function restTime(index: number): number {
  const { period, offset } = potCycle(index);
  return period - offset + period / 2;
}

describe('attachPots', () => {
  it('без горшков в сцене возвращает null, а не падает', () => {
    expect(attachPots(new THREE.Scene())).toBeNull();
  });

  it('поднимает горшок на долю его собственной высоты', () => {
    const { scene, pots } = makeScene();
    const before = positionAt(pots, 0);
    const world = attachPots(scene)!;

    world.update(peakTime(0));

    const after = positionAt(pots, 0);
    expect(after.y - before.y).toBeCloseTo(POT_HEIGHT * HOP_HEIGHT_FACTOR, 6);
    // По горизонтали горшок не сдвинулся: прыжок вертикальный.
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
  });

  it('возвращает горшок ровно на своё место между прыжками', () => {
    const { scene, pots } = makeScene();
    const before = positionAt(pots, 0);
    const world = attachPots(scene)!;

    world.update(restTime(0));

    expect(positionAt(pots, 0).distanceTo(before)).toBeCloseTo(0, 9);
  });

  it('доворачивает горшок вокруг своей оси, а не вокруг центра поля', () => {
    const { scene, pots } = makeScene();
    const before = positionAt(pots, 3);
    const world = attachPots(scene)!;

    // Три десятка прыжков: доворот к этому моменту накопился заметный.
    world.update(restTime(3) + potCycle(3).period * 30);

    const after = matrixAt(pots, 3);
    const moved = new THREE.Vector3().setFromMatrixPosition(after);
    // Горшок далеко от начала координат — поворот вокруг общей оси увёз бы его.
    expect(moved.distanceTo(before)).toBeCloseTo(0, 9);

    // Наклон свой, доворот — только вокруг Y: ось Y горшка не изменилась.
    const basis = new THREE.Matrix4().extractRotation(after);
    const up = new THREE.Vector3(0, 1, 0).applyMatrix4(basis);
    const wasUp = new THREE.Vector3(0, 1, 0).applyEuler(
      new THREE.Euler(0.4 + 3 * 0.3, 1.1 + 3 * 0.7, -0.6 + 3 * 0.2),
    );
    expect(up.angleTo(wasUp)).toBeGreaterThan(0);
    expect(new THREE.Vector3().setFromMatrixScale(after).x).toBeCloseTo(1, 6);
  });

  it('гоняет горшки вразнобой: в один момент они на разной высоте', () => {
    const { scene, pots } = makeScene();
    const before = [0, 1, 2, 3].map((i) => positionAt(pots, i).y);
    const world = attachPots(scene)!;

    // Ищем момент, когда высоты хоть у кого-то разошлись.
    world.update(peakTime(0));
    const lifted = [0, 1, 2, 3].map(
      (i, index) => positionAt(pots, i).y - before[index]!,
    );

    expect(lifted[0]).toBeCloseTo(POT_HEIGHT * HOP_HEIGHT_FACTOR, 6);
    expect(new Set(lifted.map((value) => value.toFixed(6))).size).toBeGreaterThan(1);
  });

  it('при reduced motion возвращает матрицы исходными и больше их не трогает', () => {
    const { scene, pots } = makeScene();
    const before = Float32Array.from(pots.instanceMatrix.array);

    let calm = false;
    const world = attachPots(scene, { reducedMotion: () => calm })!;

    world.update(peakTime(0));
    expect(positionAt(pots, 0).y).toBeGreaterThan(before[13]!);

    calm = true;
    world.update(0.016);
    expect(Array.from(pots.instanceMatrix.array)).toEqual(Array.from(before));

    // Второй кадр покоя буфер не переписывает.
    const version = pots.instanceMatrix.version;
    world.update(0.016);
    expect(pots.instanceMatrix.version).toBe(version);
  });

  it('расширяет габаритную сферу на высоту прыжка', () => {
    const { scene, pots } = makeScene();
    pots.computeBoundingSphere();
    const plain = pots.boundingSphere!.radius;

    attachPots(scene);

    expect(pots.boundingSphere!.radius).toBeCloseTo(
      plain + POT_HEIGHT * HOP_HEIGHT_FACTOR,
      6,
    );
  });
});

describe('hopState', () => {
  it('держит горшок на земле весь промежуток между прыжками', () => {
    const { period, offset } = potCycle(0);
    const landed = period - offset + HOP_SECONDS + 0.01;

    expect(hopState(0, landed, 1).lift).toBe(0);
    expect(hopState(0, landed + period / 2, 1).lift).toBe(0);
  });

  it('сшивает доворот между циклами без скачка', () => {
    const { period, offset } = potCycle(0);
    const before = hopState(0, period - offset - 0.0001, 1).turn;
    const after = hopState(0, period - offset + 0.0001, 1).turn;

    expect(Math.abs(after - before)).toBeLessThan(0.001);
  });

  it('на взлёте и на приземлении подъём нулевой, в середине — полный', () => {
    const start = peakTime(0) - HOP_SECONDS / 2;

    expect(hopState(0, start, 1).lift).toBeCloseTo(0, 9);
    expect(hopState(0, start + HOP_SECONDS / 2, 1).lift).toBeCloseTo(1, 9);
    expect(hopState(0, start + HOP_SECONDS, 1).lift).toBe(0);
  });
});
