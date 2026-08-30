/** Снаряды магов: светящиеся шары, летящие через строй. */

import * as THREE from 'three';

import type { BattleBolt } from './battle';

/** Поперечник снаряда, юниты. */
const SIZE = 0.02;

/** Цвет по сторонам. */
const COLOR = { undead: 0x7fd7ff, living: 0xffbe63 } as const;

/** Пиксели холста. Это мягкое пятно без деталей. */
const CANVAS = 64;

export type Spells = {
  /** Ставит снаряды этого кадра. Лишние спрайты прячутся, недостающие заводятся. */
  update: (bolts: readonly BattleBolt[]) => void;
  dispose: () => void;
};

/** Шар света: белое ядро и цветное свечение вокруг. */
function boltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS;
  canvas.height = CANVAS;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('мир: холст снаряда не дал двумерный контекст');

  const half = CANVAS / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.28, 'rgba(255, 255, 255, 0.85)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, CANVAS, CANVAS);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type Paint = {
  group: THREE.Group;
  texture: THREE.CanvasTexture;
  undead: THREE.SpriteMaterial;
  living: THREE.SpriteMaterial;
};

export function createSpells(parent: THREE.Object3D): Spells {
  const pool: THREE.Sprite[] = [];
  let paint: Paint | null = null;

  /** Краска снаряда: текстура и два материала — по одному на сторону. */
  const ensurePaint = (): Paint => {
    if (paint) return paint;

    const group = new THREE.Group();
    group.name = 'world-spells';
    group.userData.notSurface = true;
    parent.add(group);

    const texture = boltTexture();
    const materialOf = (color: number) =>
      new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        fog: true,
      });

    paint = {
      group,
      texture,
      undead: materialOf(COLOR.undead),
      living: materialOf(COLOR.living),
    };

    return paint;
  };

  const spriteAt = (index: number): THREE.Sprite => {
    const known = pool[index];
    if (known) return known;

    const ready = ensurePaint();
    const sprite = new THREE.Sprite(ready.living);
    sprite.scale.setScalar(SIZE);
    ready.group.add(sprite);
    pool[index] = sprite;

    return sprite;
  };

  return {
    update: (bolts: readonly BattleBolt[]) => {
      for (const [index, bolt] of bolts.entries()) {
        const sprite = spriteAt(index);
        const materials = ensurePaint();

        sprite.position.set(bolt.x, bolt.y, bolt.z);
        sprite.material = bolt.side === -1 ? materials.undead : materials.living;

        const flare = 0.7 + 0.5 * Math.sin(Math.PI * bolt.part);
        sprite.scale.setScalar(SIZE * flare);
        sprite.visible = true;
      }

      for (let index = bolts.length; index < pool.length; index++) {
        pool[index]!.visible = false;
      }
    },

    dispose: () => {
      paint?.texture.dispose();
      paint?.undead.dispose();
      paint?.living.dispose();
      paint?.group.removeFromParent();
      paint = null;
      pool.length = 0;
    },
  };
}
