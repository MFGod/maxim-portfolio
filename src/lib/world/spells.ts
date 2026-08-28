/**
 * Снаряды магов: светящиеся шары, летящие через строй.
 *
 * Маг на стычке играл `Spellcasting` и при этом просто стоял: колдовал, но
 * ничего не вылетало, и второй ряд читался статистом. Снаряд — недостающая
 * половина этой позы.
 *
 * Где снаряд, решает `battle.ts`: там время, места и дуга полёта. Здесь только
 * то, чем это рисуется, — ровно та же граница, что между `patrol.ts` и
 * `figures.ts`.
 *
 * Спрайты, а не точки: `THREE.Points` при `sizeAttenuation` считает размер по
 * расстоянию до камеры в пикселях кадра, и на подлёте камеры к стычке снаряд
 * рос быстрее самих бойцов. Спрайт — предмет мира: у него размер в юнитах.
 *
 * Пул спрайтов переиспользуется: снарядов в кадре не больше, чем магов на всех
 * площадках — по одному в воздухе на каждого, — и заводить их заново на каждый
 * выстрел значило бы собирать мусор в кадре.
 *
 * Заводится всё лениво, на первом снаряде: до него у фигур не появляется ни
 * узла в графе сцены, ни текстуры. Причин две, и обе выяснились на месте.
 * Текстура рисуется на `canvas`, а `createFigures` собирают и в проверках, где
 * `document` нет вовсе. И группа, добавленная в узел фигур наперёд, сдвигает
 * его детей: расстановка ищет фигуру по месту в списке, и лишний узел ломает
 * счёт.
 */

import * as THREE from 'three';

import type { BattleBolt } from './battle';

/**
 * Поперечник снаряда, юниты.
 *
 * Рост бойца здесь 0,117, и снаряд в шестую его часть — это кулак света: видно
 * с ракурса стычки и не спорит с фигурой. Вдвое крупнее — светящийся шар
 * закрывает того, в кого летит.
 */
const SIZE = 0.02;

/**
 * Цвет по сторонам.
 *
 * У нежити холодный, у живых тёплый — те же две температуры, по которым в мире
 * различаются благодать и костёр. Цвет насыщенный, а ядро спрайта белое:
 * светящееся тело всегда светлее своего свечения.
 */
const COLOR = { undead: 0x7fd7ff, living: 0xffbe63 } as const;

/** Пиксели холста. Это мягкое пятно без деталей. */
const CANVAS = 64;

export type Spells = {
  /**
   * Ставит снаряды этого кадра. Лишние спрайты прячутся, недостающие заводятся.
   *
   * Список приходит целиком, а не по одному: снаряды считаются из времени, и у
   * отрисовки нет своего состояния, которое надо было бы согласовывать.
   */
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

  /**
   * Краска снаряда: текстура и два материала — по одному на сторону.
   *
   * Материал на сторону, а не на снаряд: цвет живёт в материале, и красить
   * каждый спрайт своим значило бы держать материал на выстрел. Пул при этом
   * общий — спрайту достаточно подменить материал.
   */
  const ensurePaint = (): Paint => {
    if (paint) return paint;

    const group = new THREE.Group();
    group.name = 'world-spells';
    parent.add(group);

    const texture = boltTexture();
    const materialOf = (color: number) =>
      new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        depthWrite: false,
        // Глубину проверяет: снаряд, ушедший за холм или за спину бойцу, не
        // должен просвечивать сквозь них.
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

        /*
         * Снаряд разгорается на вылете и вспыхивает у цели: доля пути ведёт
         * размер. Ровный шар читается катящимся шариком, а не броском.
         */
        const flare = 0.7 + 0.5 * Math.sin(Math.PI * bolt.part);
        sprite.scale.setScalar(SIZE * flare);
        sprite.visible = true;
      }

      // Пул не сжимается: снарядов в кадре считанные единицы, а спрятанный
      // спрайт не стоит ничего.
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
