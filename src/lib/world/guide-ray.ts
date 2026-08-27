/**
 * Направляющий луч: дорожка огней от камеры к следующей главе.
 *
 * Мир — сто двадцать юнитов поперёк, и с земли за первым же холмом не видно
 * ничего. Подпись главы (`markers.ts`) говорит, что глава там, но не говорит,
 * куда идти, когда между вами склон: направление по прямой и дорога к нему —
 * разные вещи.
 *
 * Огни, а не сплошная линия. `LineBasicMaterial` рисует линию толщиной ровно в
 * пиксель на любом расстоянии — на светлой траве такая нить пропадает. Точки
 * же ослабевают с расстоянием честно: ближние крупные, дальние мелкие, и
 * дорожка сама читается уходящей вдаль.
 *
 * Высота берётся у оболочки камеры (`shellHeightAt`), а не лучом по рельефу:
 * оболочка — это уже посчитанный купол над картой, лежит выше земли и стоит
 * микросекунды, тогда как луч по трём миллионам треугольников — десятки
 * миллисекунд на каждую из тридцати двух точек.
 */

import * as THREE from 'three';

import type { WorldPoint } from '@/data/world-places';

/** Огней в дорожке. Тридцать двух хватает на весь мир по диагонали. */
const LIGHTS = 32;

/** Высота огня над оболочкой, в юнитах мира. */
const LIFT = 0.35;

/**
 * Начало дорожки: столько юнитов от камеры пропускается.
 *
 * Ближний огонь при `sizeAttenuation` вырастает во весь кадр и закрывает собой
 * мир. Полтора юнита — это дальше вытянутой руки и ближе первого шага.
 */
const START = 1.5;

/**
 * Размер огня в юнитах мира. Подобран вживую: на 0.16 дорожка за деревьями
 * читалась случайными бликами, а не тропой.
 */
const LIGHT_SIZE = 0.34;

/** Цвет дорожки: то же тёплое золото, что у благодати в карте. */
const COLOR = 0xffca6b;

/**
 * Насколько камера должна сдвинуться, чтобы пересчитать дорожку.
 *
 * Та же причина, что и у подписей: за кадр камера проходит сотые доли юнита, а
 * пересчёт — это тридцать две выборки высоты и заливка буфера.
 */
const RESTEP = 0.25;

export type HeightProbe = (x: number, z: number) => number | null;

export type GuideRay = {
  /**
   * Ведёт дорожку от камеры к точке. `null` — цели нет, дорожка гаснет.
   *
   * Цель приходит снаружи: куда вести — дело маршрута (`route.ts`), а этот
   * узел знает только, как проложить огни по рельефу.
   */
  update: (camera: THREE.Camera, target: WorldPoint | null) => void;
  dispose: () => void;
};

/** Круглый огонёк с мягким краем: квадратная точка читается пикселем. */
function lightTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('мир: холст огня не дал двумерный контекст');

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.85)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGuideRay(
  parent: THREE.Object3D,
  heightAt: HeightProbe,
): GuideRay {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(LIGHTS * 3);
  const alphas = new Float32Array(LIGHTS);

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const texture = lightTexture();

  /*
   * Своя прозрачность на точку — единственная причина трогать шейдер.
   *
   * Дорожка обязана гаснуть к началу и к концу: у камеры огни лезут в кадр, у
   * цели спорят с подписью главы. `PointsMaterial` даёт одну прозрачность на
   * весь набор, поэтому в него добавляется атрибут — правка на две строки в
   * каждом из шейдеров, без своего материала.
   */
  const material = new THREE.PointsMaterial({
    size: LIGHT_SIZE,
    map: texture,
    color: COLOR,
    transparent: true,
    depthWrite: false,
    // Огни видны сквозь холм: дорожка затем и нужна, чтобы знать, что за ним.
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  /*
   * Свой ключ кэша программ — иначе правка ниже достанется чужому материалу.
   *
   * Ключ считается по признакам материала, а не по его правкам: второй
   * `PointsMaterial` в сцене получил бы ту же программу. Чей шейдер собрался
   * первым, тот и достаётся обоим — либо дорожка теряет попиксельную
   * прозрачность и все огни горят ровно, либо чужие точки читают отсутствующий
   * атрибут `alpha`, получают ноль и не рисуются вовсе. Тот же приём, что у
   * ветра (`wind.ts`).
   */
  material.customProgramCacheKey = () => 'guide-ray';

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'attribute float alpha;\nvarying float vAlpha;\nvoid main() {',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvAlpha = alpha;');

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vAlpha;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        'diffuseColor.a *= vAlpha;\n#include <opaque_fragment>',
      );
  };

  const points = new THREE.Points(geometry, material);
  points.name = 'world-guide-ray';
  // Дорожка тянется через полмира, а её габарит считается по точкам: отсечение
  // выбрасывало бы её целиком, стоит камере отвернуться от дальнего конца.
  points.frustumCulled = false;
  points.renderOrder = 1;
  points.visible = false;
  parent.add(points);

  let last: THREE.Vector3 | null = null;
  let lastTarget: WorldPoint | null = null;

  const update = (camera: THREE.Camera, target: WorldPoint | null) => {
    if (!target) {
      points.visible = false;
      lastTarget = null;
      return;
    }

    const eye = camera.position;
    const moved = !last || eye.distanceTo(last) >= RESTEP;
    if (!moved && target === lastTarget) return;

    last = last ? last.copy(eye) : eye.clone();
    lastTarget = target;

    const dx = target[0] - eye.x;
    const dz = target[2] - eye.z;
    const span = Math.hypot(dx, dz);

    // Пришли: дорожка у самой цели складывается в кучу огней поверх подписи.
    if (span <= START) {
      points.visible = false;
      return;
    }

    for (let index = 0; index < LIGHTS; index++) {
      const share = index / (LIGHTS - 1);
      const along = START + (span - START) * share;
      const x = eye.x + (dx / span) * along;
      const z = eye.z + (dz / span) * along;

      const ground = heightAt(x, z);
      /*
       * Вне карты высоты нет — там дорожка идёт по прямой от глаза к цели.
       * Случай нечастый: цель всегда внутри карты, а вылететь за её край можно
       * только у самого берега.
       */
      const y =
        ground === null ? eye.y + (target[1] - eye.y) * share + LIFT : ground + LIFT;

      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;

      // Гаснет у обоих концов: у камеры огонь лезет в кадр, у цели спорит с
      // подписью главы.
      alphas[index] = Math.min(share * 4, (1 - share) * 4, 1) * 0.9;
    }

    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.alpha!.needsUpdate = true;
    geometry.computeBoundingSphere();
    points.visible = true;
  };

  return {
    update,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      points.removeFromParent();
    },
  };
}
