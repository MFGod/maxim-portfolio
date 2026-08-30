/** Полная луна: диск в небе по направлению ключевого света. */

import * as THREE from 'three';

import { DRAW_DISTANCE } from './horizon';

/** Как далеко от камеры висит диск. Диск идёт за камерой, но внутри прорисовки. */
export const MOON_DISTANCE = DRAW_DISTANCE - 24;

/** Доля высоты кадра, которую занимает диск вместе с ореолом. */
const SCALE = 0.2;

/** Пиксели холста. Больше не нужно: это мягкое пятно с парой пятен на теле. */
const CANVAS = 256;

/** Доля радиуса холста, на которой кончается тело диска и начинается ореол. */
const EDGE = 0.34;

/** Моря: смещения от центра диска и радиусы, обе величины в долях тела. */
const MARIA: readonly { x: number; y: number; radius: number; depth: number }[] = [
  { x: -0.26, y: -0.28, radius: 0.78, depth: 0.15 },
  { x: 0.38, y: 0.12, radius: 0.62, depth: 0.11 },
  { x: 0.04, y: 0.46, radius: 0.54, depth: 0.13 },
  { x: -0.52, y: 0.3, radius: 0.42, depth: 0.09 },
];

export type Moon = {
  /** Ставит диск по камере. Зовётся из кадра, после рига. */
  update: (camera: THREE.Camera) => void;
  /** Перекрашивает диск под набор освещения. */
  setColor: (color: number) => void;
  dispose: () => void;
};

/** Диск с ореолом: тело, резкий край, мягкое затухание вокруг и моря на теле. */
function moonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS;
  canvas.height = CANVAS;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('мир: холст луны не дал двумерный контекст');

  const half = CANVAS / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(244, 247, 255, 1)');
  gradient.addColorStop(EDGE, 'rgba(226, 234, 255, 0.34)');
  gradient.addColorStop(0.62, 'rgba(198, 214, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(180, 200, 255, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, CANVAS, CANVAS);

  const body = half * EDGE;

  context.save();
  context.beginPath();
  context.arc(half, half, body, 0, Math.PI * 2);
  context.clip();
  context.globalCompositeOperation = 'destination-out';

  for (const mare of MARIA) {
    const x = half + mare.x * body;
    const y = half + mare.y * body;
    const radius = mare.radius * body;
    const spot = context.createRadialGradient(x, y, 0, x, y, radius);

    spot.addColorStop(0, `rgba(0, 0, 0, ${mare.depth})`);
    spot.addColorStop(0.7, `rgba(0, 0, 0, ${mare.depth * 0.45})`);
    spot.addColorStop(1, 'rgba(0, 0, 0, 0)');

    context.fillStyle = spot;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Вешает луну в небо.
 * @param parent сцена мира
 * @param direction направление на светило из начала координат — то же, по
 */
export function createMoon(parent: THREE.Object3D, direction: THREE.Vector3): Moon {
  const texture = moonTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(material);
  sprite.name = 'world-moon';
  sprite.scale.set(SCALE, SCALE, 1);
  sprite.renderOrder = -1;
  sprite.frustumCulled = false;
  sprite.userData.notSurface = true;
  parent.add(sprite);

  const aim = direction.clone().normalize();

  return {
    update: (camera: THREE.Camera) => {
      sprite.position.copy(camera.position).addScaledVector(aim, MOON_DISTANCE);
    },

    setColor: (color: number) => {
      material.color.setHex(color);
    },

    dispose: () => {
      texture.dispose();
      material.dispose();
      sprite.removeFromParent();
    },
  };
}
