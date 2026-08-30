import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { DAY, DUSK } from '@/lib/world/daylight';
import {
  createErdlight,
  ERDLIGHT_COUNT,
  ERDLIGHT_DROP,
  ERDLIGHT_FADE,
  ERDLIGHT_FULL,
  ERDLIGHT_INTENSITY,
  ERDLIGHT_MAX_POWER,
  ERDLIGHT_MIN_POWER,
  ERDLIGHT_REACH,
  ERDLIGHT_TYPICAL_RADIUS,
  erdlightFalloff,
  erdlightPower,
  erdlightReach,
  brightestTrees,
  erdlightWeight,
  stepLevel,
} from '@/lib/world/erdlight';

/** Дерево для пула: место и размер кроны — больше ему ничего не нужно. */
const tree = (x: number, z: number, radius: number) => ({
  position: new THREE.Vector3(x, 10, z),
  radius,
});

describe('пул золотых источников', () => {
  it('источников хватает на ближние деревья, но кадр их выдерживает', () => {
    expect(ERDLIGHT_COUNT).toBeGreaterThan(1);
    expect(ERDLIGHT_COUNT).toBeLessThanOrEqual(4);
  });

  it('источник достаёт от кроны до земли под ней', () => {
    expect(ERDLIGHT_REACH).toBeGreaterThan(20);
  });
});

describe('сила по размеру кроны', () => {
  it('обычное дерево светит ровно на заданную силу', () => {
    expect(erdlightPower(ERDLIGHT_TYPICAL_RADIUS)).toBeCloseTo(1, 5);
  });

  it('крупная крона светит сильнее мелкой', () => {
    expect(erdlightPower(6)).toBeGreaterThan(erdlightPower(2));
  });

  it('сила идёт за площадью кроны, а не за её шириной', () => {
    const single = erdlightPower(ERDLIGHT_TYPICAL_RADIUS);
    const double = erdlightPower(ERDLIGHT_TYPICAL_RADIUS * 2);

    expect(double / single).toBeCloseTo(4, 5);
  });

  it('мелкая крона слабеет, но не гаснет', () => {
    expect(erdlightPower(0.1)).toBe(ERDLIGHT_MIN_POWER);
    expect(ERDLIGHT_MIN_POWER).toBeGreaterThan(0);
  });

  it('главное дерево упирается в потолок, а не заливает карту', () => {
    expect(erdlightPower(100)).toBe(ERDLIGHT_MAX_POWER);
  });
});

describe('досягаемость по размеру кроны', () => {
  it('у обычного дерева — заданный предел', () => {
    expect(erdlightReach(ERDLIGHT_TYPICAL_RADIUS)).toBeCloseTo(ERDLIGHT_REACH, 5);
  });

  it('круг света растёт вместе с деревом, но медленнее силы', () => {
    const big = erdlightReach(ERDLIGHT_TYPICAL_RADIUS * 2);

    expect(big).toBeGreaterThan(ERDLIGHT_REACH);
    expect(big).toBeCloseTo(ERDLIGHT_REACH * 2, 5);
  });
});

describe('затухание по расстоянию до зрителя', () => {
  const R = ERDLIGHT_TYPICAL_RADIUS;

  it('вблизи дерево светит в полную силу', () => {
    expect(erdlightFalloff(0, R)).toBe(1);
    expect(erdlightFalloff(ERDLIGHT_FULL, R)).toBe(1);
  });

  it('за пределом дерево гаснет совсем', () => {
    expect(erdlightFalloff(ERDLIGHT_DROP, R)).toBe(0);
    expect(erdlightFalloff(ERDLIGHT_DROP * 2, R)).toBe(0);
  });

  it('между полной силой и пределом идёт плавный спад, а не ступень', () => {
    const middle = (ERDLIGHT_FULL + ERDLIGHT_DROP) / 2;

    expect(erdlightFalloff(middle, R)).toBeGreaterThan(0);
    expect(erdlightFalloff(middle, R)).toBeLessThan(1);
    expect(erdlightFalloff(middle, R)).toBeGreaterThan(erdlightFalloff(middle + 1, R));
  });

  it('крупное дерево гаснет дальше мелкого', () => {
    expect(erdlightFalloff(ERDLIGHT_DROP, R * 4)).toBeGreaterThan(0);
  });
});

describe('заметность пятна', () => {
  it('крупное дерево перевешивает мелкое, стоящее ближе', () => {
    const big = erdlightWeight(ERDLIGHT_TYPICAL_RADIUS * 5, 40);
    const small = erdlightWeight(ERDLIGHT_TYPICAL_RADIUS, 20);

    expect(big).toBeGreaterThan(small);
  });

  it('при равном размере ближнее дерево заметнее', () => {
    const near = erdlightWeight(ERDLIGHT_TYPICAL_RADIUS, 10);
    const far = erdlightWeight(ERDLIGHT_TYPICAL_RADIUS, 30);

    expect(near).toBeGreaterThan(far);
  });

  it('вес конечен, даже когда камера стоит в самой кроне', () => {
    expect(Number.isFinite(erdlightWeight(ERDLIGHT_TYPICAL_RADIUS, 0))).toBe(true);
  });
});

describe('выбор деревьев', () => {
  it('при равном размере берутся ближайшие и по порядку', () => {
    const trees = [tree(100, 0, 3), tree(10, 0, 3), tree(50, 0, 3)];

    expect(brightestTrees(trees, new THREE.Vector3(), 2)).toEqual([1, 2]);
  });

  it('деревьев меньше, чем источников — список короче, а не с дырами', () => {
    expect(brightestTrees([tree(1, 0, 3)], new THREE.Vector3(), 3)).toEqual([0]);
  });

  it('на равном удалении крупное дерево забирает источник у мелкого', () => {
    const trees = [
      tree(30, 0, ERDLIGHT_TYPICAL_RADIUS / 2),
      tree(0, 30, ERDLIGHT_TYPICAL_RADIUS * 3),
    ];

    expect(brightestTrees(trees, new THREE.Vector3(), 1)).toEqual([1]);
  });
});

describe('разгорание', () => {
  it('доля идёт к цели шагом, а не прыжком', () => {
    const step = stepLevel(0, 1, 1 / 60);

    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.1);
  });

  it('доля не проскакивает цель ни вверх, ни вниз', () => {
    expect(stepLevel(0.99, 1, 1)).toBe(1);
    expect(stepLevel(0.01, 0, 1)).toBe(0);
  });

  it('полный разгон укладывается в секунды, а не в минуты', () => {
    expect(1 / ERDLIGHT_FADE).toBeLessThan(2);
  });
});

describe('пул в сцене', () => {
  const lightsOf = (scene: THREE.Scene) =>
    scene.children.filter(
      (child) => (child as THREE.Light).isLight,
    ) as THREE.PointLight[];

  /** Секунда кадров: доля успевает дойти до единицы. */
  const settle = (erdlight: { update: (c: THREE.Camera, d: number) => void }) => {
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    for (let frame = 0; frame < 60; frame++) erdlight.update(camera, 1 / 60);
  };

  it('источники заводятся сразу и погашенными', () => {
    const scene = new THREE.Scene();
    createErdlight(scene);

    expect(lightsOf(scene)).toHaveLength(ERDLIGHT_COUNT);
    expect(lightsOf(scene).every((light) => light.intensity === 0)).toBe(true);
  });

  it('без деревьев источники остаются погашенными', () => {
    const scene = new THREE.Scene();
    const erdlight = createErdlight(scene);

    erdlight.update(new THREE.PerspectiveCamera(), 1);

    expect(lightsOf(scene).filter((light) => light.intensity > 0)).toHaveLength(0);
  });

  it('пришли деревья — ближние разгораются, дальние стоят погашенными', () => {
    const scene = new THREE.Scene();
    const erdlight = createErdlight(scene);

    erdlight.seed([
      tree(12, 0, ERDLIGHT_TYPICAL_RADIUS),
      tree(-12, 0, ERDLIGHT_TYPICAL_RADIUS),
      tree(0, 12, ERDLIGHT_TYPICAL_RADIUS),
      tree(0, ERDLIGHT_DROP * 2, ERDLIGHT_TYPICAL_RADIUS),
    ]);
    settle(erdlight);

    const lights = lightsOf(scene);

    expect(lights.filter((light) => light.intensity > 0)).toHaveLength(ERDLIGHT_COUNT);

    for (const light of lights) {
      expect(light.position.z).toBeLessThan(ERDLIGHT_DROP);
      expect(light.intensity).toBeCloseTo(ERDLIGHT_INTENSITY, 5);
    }
  });

  it('большое дерево светит ярче и дальше маленького', () => {
    const scene = new THREE.Scene();
    const erdlight = createErdlight(scene);

    erdlight.seed([tree(10, 0, 2), tree(-10, 0, 8)]);
    settle(erdlight);

    const lights = lightsOf(scene);
    const small = lights.find((light) => light.position.x > 0);
    const big = lights.find((light) => light.position.x < 0);

    expect(small?.intensity).toBeGreaterThan(0);
    expect(big?.intensity).toBeGreaterThan((small?.intensity ?? 0) * 2);
    expect(big?.distance).toBeGreaterThan(small?.distance ?? 0);
  });

  it('золото в сумерках ярче, чем днём', () => {
    const scene = new THREE.Scene();
    const erdlight = createErdlight(scene);
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();

    erdlight.seed([tree(0, 0, ERDLIGHT_TYPICAL_RADIUS)]);

    erdlight.setLight(DAY.emissive.erdtree);
    settle(erdlight);
    const day = lightsOf(scene)[0]?.intensity ?? 0;

    erdlight.setLight(DUSK.emissive.erdtree);
    erdlight.update(camera, 1 / 60);
    const dusk = lightsOf(scene)[0]?.intensity ?? 0;

    expect(day).toBeGreaterThan(0);
    expect(dusk).toBeGreaterThan(day);
  });

  it('разбор снимает источники со сцены', () => {
    const scene = new THREE.Scene();
    const erdlight = createErdlight(scene);

    erdlight.dispose();

    expect(lightsOf(scene)).toEqual([]);
  });
});
