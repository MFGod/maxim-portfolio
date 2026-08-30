/** Прыгающие горшки: движение уже стоящей геометрии, без единого нового ассета. */

import * as THREE from 'three';

/** Имя инстанс-меша. Совпадает с именем в `assets.ts`. */
const MESH_NAME = 'pot';

/** Сколько длится сам прыжок. Остальной период горшок стоит. */
export const HOP_SECONDS = 0.45;

/** Границы разброса периодов: между прыжками одного горшка. */
export const MIN_PERIOD = 6;
export const MAX_PERIOD = 14;

/** Высота прыжка долей от собственной высоты горшка. */
export const HOP_HEIGHT_FACTOR = 0.6;

/** Доворот вокруг своей оси за один прыжок: горшок садится иначе, чем взлетел. */
export const HOP_TURN = 0.2;

export type Pots = {
  /** Продвинуть прыжки. Вызывается из цикла сцены. */
  update: (delta: number) => void;
  dispose: () => void;
};

export type PotsOptions = {
  /** Когда возвращает `true`, горшки замирают на своих местах. */
  reducedMotion?: () => boolean;
};

/**
 * Устойчивый псевдослучай по индексу: одно и то же поле при каждой загрузке.
 * Разброс важнее качества распределения — горшков всего 71.
 */
function hash(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Период и фазовый сдвиг горшка. Экспортируется, чтобы тест считал те же
 * моменты прыжка, а не свою копию формулы.
 */
export function potCycle(index: number): { period: number; offset: number } {
  const period = MIN_PERIOD + hash(index) * (MAX_PERIOD - MIN_PERIOD);
  return { period, offset: hash(index + 1000) * period };
}

/** Подъём и доворот горшка к моменту `time`. */
export function hopState(index: number, time: number, height: number) {
  const { period, offset } = potCycle(index);
  const phase = (time + offset) / period;
  const hops = Math.floor(phase);
  const seconds = (phase - hops) * period;

  const progress = seconds < HOP_SECONDS ? seconds / HOP_SECONDS : 1;
  const lift = seconds < HOP_SECONDS ? height * 4 * progress * (1 - progress) : 0;

  return { lift, turn: (HOP_TURN * (hops + progress)) % (Math.PI * 2) };
}

/**
 * Заводит прыжки. Вызывать после того, как пришли инстансы.
 * @returns `null`, если горшков в сцене нет — мир от этого не ломается
 */
export function attachPots(
  scene: THREE.Object3D,
  options: PotsOptions = {},
): Pots | null {
  const { reducedMotion } = options;

  const pots = scene.getObjectByName(MESH_NAME) as THREE.InstancedMesh | undefined;
  if (!pots) return null;

  const base = Float32Array.from(pots.instanceMatrix.array);

  pots.geometry.computeBoundingBox();
  const box = pots.geometry.boundingBox!;
  const height = (box.max.y - box.min.y) * HOP_HEIGHT_FACTOR;

  pots.computeBoundingSphere();
  if (pots.boundingSphere) pots.boundingSphere.radius += height;

  const toPivot = new THREE.Matrix4();
  const fromPivot = new THREE.Matrix4();
  const spin = new THREE.Matrix4();
  const instance = new THREE.Matrix4();

  let time = 0;
  /** Матрицы стоят исходными: повторно возвращать их нечего. */
  let resting = false;

  function restore() {
    (pots!.instanceMatrix.array as Float32Array).set(base);
    pots!.instanceMatrix.needsUpdate = true;
  }

  return {
    update: (delta: number) => {
      if (reducedMotion?.()) {
        if (!resting) {
          restore();
          resting = true;
        }
        return;
      }
      resting = false;
      time += delta;

      const target = pots.instanceMatrix.array as Float32Array;

      for (let i = 0; i < pots.count; i++) {
        const at = i * 16;
        const { lift, turn } = hopState(i, time, height);

        const x = base[at + 12]!;
        const y = base[at + 13]!;
        const z = base[at + 14]!;

        instance.fromArray(base, at);
        instance
          .premultiply(toPivot.makeTranslation(-x, -y, -z))
          .premultiply(spin.makeRotationY(turn))
          .premultiply(fromPivot.makeTranslation(x, y + lift, z));
        instance.toArray(target, at);
      }

      pots.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      // Геометрию и матрицы разберёт сцена: держать здесь нечего, кроме ссылок.
    },
  };
}
