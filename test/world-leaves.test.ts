import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { DAY, DUSK } from '@/lib/world/daylight';
import {
  FALL,
  FALL_SPREAD,
  LEAF_MOVE,
  GLOW_SHARE,
  LEAF_COUNT,
  LEAF_MIN_SCALE,
  LEAF_SIZE,
  LEAF_PERIOD,
  LIFETIME,
  SPREAD_ANGLE,
  SPREAD_SPEED,
  crownsOf,
  treesOf,
} from '@/lib/world/leaves';

describe('стая листьев', () => {
  it('листьев хватает на два десятка крон, но они не застят ландшафт', () => {
    expect(LEAF_COUNT).toBeGreaterThan(1000);
    expect(LEAF_COUNT).toBeLessThan(5000);
  });

  it('крупный лист задаёт верх, мелкие идут вниз от него', () => {
    expect(LEAF_MIN_SCALE).toBeGreaterThan(0);
    expect(LEAF_MIN_SCALE).toBeLessThan(1);
  });

  it('мелкий лист остаётся листом, а не искрой', () => {
    expect(LEAF_SIZE * LEAF_MIN_SCALE).toBeGreaterThan(0.03);
  });

  it('крупный лист не больше человеческой фигуры', () => {
    const FIGURE = 0.117;

    expect(LEAF_SIZE).toBeLessThanOrEqual(FIGURE + 0.01);
  });

  it('листья расходятся на полный круг', () => {
    expect(SPREAD_ANGLE).toBeCloseTo(Math.PI * 2, 6);
  });

  it('лист планирует, а не падает камнем', () => {
    expect(FALL).toBeGreaterThan(0);
    expect(SPREAD_SPEED).toBeGreaterThan(FALL * 0.5);
    expect(SPREAD_SPEED).toBeLessThan(FALL * 4);
  });
});

describe('жизнь листа', () => {
  it('за жизнь лист успевает долететь до земли с высокой кроны', () => {
    const highestCrown = 20;

    expect(FALL * LIFETIME).toBeGreaterThan(highestCrown * 0.4);
  });

  it('разлёт за жизнь не уносит лист за край мира', () => {
    expect(SPREAD_SPEED * LIFETIME).toBeLessThan(60);
  });

  it('период кратен времени жизни', () => {
    expect(LEAF_PERIOD % LIFETIME).toBe(0);
    expect(LEAF_PERIOD / LIFETIME).toBeGreaterThan(10);
  });

  it('круг достаточно длинный, чтобы повтор не читался', () => {
    expect(LEAF_PERIOD).toBeGreaterThanOrEqual(300);
  });
});

describe('свечение листа', () => {
  it('лист светится слабее кроны', () => {
    expect(GLOW_SHARE).toBeGreaterThan(0);
    expect(GLOW_SHARE).toBeLessThan(1);
  });

  it('лист заходит за порог bloom — иначе ореола нет вовсе', () => {
    const BLOOM_THRESHOLD = 1;

    expect(1 + DAY.emissive.erdtree * GLOW_SHARE).toBeGreaterThan(BLOOM_THRESHOLD);
  });

  it('в сумерках лист светится ярче, чем днём', () => {
    expect(DUSK.emissive.erdtree).toBeGreaterThan(DAY.emissive.erdtree);
  });
});

describe('деревья по кронам', () => {
  /**
   * Меш светящейся листвы: три десятка вершин на квадрат, эмиссия та же, по
   * которой `treesOf` находит кроны на живой карте.
   */
  const foliage = (patches: { x: number; z: number; half: number }[]) => {
    const points: number[] = [];

    for (const patch of patches) {
      for (let x = patch.x - patch.half; x <= patch.x + patch.half; x += 0.25) {
        for (let z = patch.z - patch.half; z <= patch.z + patch.half; z += 0.25) {
          points.push(x, 10, z);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

    const material = new THREE.MeshStandardMaterial();
    material.emissive = new THREE.Color(0xffa51d);

    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));

    return scene;
  };

  it('ячейки одной кроны собираются в одно дерево', () => {
    const scene = foliage([{ x: 6, z: 4, half: 2.5 }]);

    expect(crownsOf(scene).length).toBeGreaterThan(1);
    expect(treesOf(scene)).toHaveLength(1);
  });

  it('разные деревья остаются разными', () => {
    const scene = foliage([
      { x: 6, z: 4, half: 2.5 },
      { x: 44, z: 6, half: 4 },
    ]);

    expect(treesOf(scene)).toHaveLength(2);
  });

  it('радиус меряет ширину кроны, а не ячейки', () => {
    const scene = foliage([
      { x: 6, z: 4, half: 2.5 },
      { x: 44, z: 6, half: 4 },
    ]);

    const [big, small] = treesOf(scene);

    expect(big?.radius).toBeCloseTo(4, 1);
    expect(small?.radius).toBeCloseTo(2.5, 1);
  });

  it('без светящейся листвы деревьев нет', () => {
    expect(treesOf(new THREE.Scene())).toEqual([]);
  });
});

describe('лист доходит до земли', () => {
  /** Высота падения листа за жизнь при своём зерне. */
  const descent = (drop: number, seed: number) =>
    (drop / LIFETIME) * (1 + seed * FALL_SPREAD) * LIFETIME;

  it('с любой кроны, а не только с низкой', () => {
    for (const height of [4, 8, 12, 16, 20, 24]) {
      for (const seed of [0, 0.25, 0.5, 0.75, 1]) {
        expect(descent(height, seed)).toBeGreaterThanOrEqual(height);
      }
    }
  });

  it('но не падает камнем: разброс идёт только вверх от нужного', () => {
    expect(descent(20, 1) / 20).toBeLessThan(1.5);
    expect(descent(20, 0) / 20).toBe(1);
  });

  it('скорость берётся из высоты рождения, а не из числа', () => {
    expect(LEAF_MOVE).toContain('float drop = max(born.y - bornGround, 0.0);');
    expect(LEAF_MOVE).toContain(`drop / ${LIFETIME.toFixed(1)}`);
    expect(LEAF_MOVE).toContain('uGroundReady');
    expect(LEAF_MOVE).not.toContain(`${FALL.toFixed(3)} * (0.7`);
  });
});
