/**
 * Звёздное поле: точки на сфере вокруг камеры.
 *
 * Небо было ровной заливкой цвета `daylight.sky`, и над горизонтом не
 * происходило ничего: взгляд, поднятый от карты, упирался в пустоту. Звёзды
 * дают верхней половине кадра глубину, а луне — среду, в которой она висит.
 *
 * Сфера вокруг камеры, а не купол над миром: поле едет за зрителем, поэтому
 * звёзды одинаково далеки из любой точки карты — как и положено звёздам. Это
 * тот же приём, что у луны, и потому у них общая логика `update`.
 *
 * Мерцание идёт в шейдере по зерну каждой звезды: буфер не трогается ни разу
 * за всю жизнь сцены. У каждой звезды свой период — общий заставил бы поле
 * дышать целиком, и небо читалось бы гирляндой.
 */

import * as THREE from 'three';

/**
 * Звёзд в поле.
 *
 * Полторы тысячи — это одна отрисовка и три десятка килобайт буфера. Меньше
 * тысячи небо читается редкой сыпью, больше трёх — сплошным молоком, в котором
 * теряется луна.
 */
export const STAR_COUNT = 1400;

/**
 * Радиус сферы, юнитов.
 *
 * Дальше луны (180) и ближе дальней плоскости отсечения (250): звёзды за
 * плоскостью пропали бы целиком, а ближе луны — проступили бы сквозь диск.
 */
export const STAR_RADIUS = 210;

/**
 * Ниже какой доли высоты сферы звёзд не ставится.
 *
 * Под горизонтом их всё равно закрывает рельеф — он рисуется после и пишет
 * глубину, — и точки там уходят впустую. Небольшой запас вниз оставлен: у
 * обрывов и на подъёме камеры горизонт видно ниже нуля.
 */
const HORIZON = -0.12;

/**
 * Период мерцания, секунд. Как у воды и листьев, время идёт по кругу.
 *
 * `float` на долгой вкладке теряет шаг: к вечеру у секунд не остаётся младших
 * разрядов, и мерцание встаёт. Число кратно двум пи не обязано быть — фаза у
 * каждой звезды своя, и стык круга виден только там, где все они совпадают.
 */
export const TWINKLE_PERIOD = 600;

/**
 * Насколько звезда гаснет в нижней точке мерцания.
 *
 * Треть яркости, а не ноль: мигающая до черноты звезда читается битым
 * пикселем. Настоящее мерцание — это дрожь, а не моргание.
 */
export const TWINKLE_DEPTH = 0.32;

/** Размер самой крупной звезды в пикселях кадра. Ярких звёзд мало — см. `next`. */
const STAR_SIZE = 2.6;

/** Каким может стать самый мелкий размер от крупного. */
const STAR_MIN_SCALE = 0.42;

/** Пиксели холста под точку. Это мягкое пятно без деталей. */
const CANVAS = 32;

const HEADER = /* glsl */ `
uniform float uStarTime;
uniform float uStarLight;
attribute float aSize;
attribute float aTwinkle;
attribute float aPhase;
varying float vStar;
`;

/**
 * Мерцание: своя дрожь у каждой звезды.
 *
 * Считается в вершинном шейдере, а не во фрагментном: у точки один пиксель
 * на дюжину, и разницы во внешности нет, а работы в тысячу раз меньше.
 */
const TWINKLE = /* glsl */ `
  float wave = sin(uStarTime * aTwinkle + aPhase);
  vStar = uStarLight * (1.0 - ${TWINKLE_DEPTH.toFixed(2)} * (0.5 + 0.5 * wave));
`;

export type Stars = {
  /** Фаза мерцания. Она же ручка на подбор: остановить небо и рассмотреть. */
  time: { value: number };
  /**
   * Двигает поле за камерой и крутит мерцание.
   *
   * Одним вызовом, а не двумя: звёзды без камеры бессмысленны — поле, забытое
   * у начала координат, уезжает за спину на первых же шагах.
   */
  update: (camera: THREE.Camera, delta: number) => void;
  /**
   * Ставит яркость поля под набор освещения.
   *
   * Днём звёзды не гаснут совсем, а бледнеют: небо мира остаётся сумеречно
   * синим даже в светлой теме, и пустое небо над ним читается провалом.
   */
  setLight: (value: number) => void;
  dispose: () => void;
};

/** Мягкая точка: ядро и затухание к краю. У квадрата виден пиксельный край. */
function starTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS;
  canvas.height = CANVAS;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('мир: холст звезды не дал двумерный контекст');

  const half = CANVAS / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, CANVAS, CANVAS);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createStars(parent: THREE.Object3D): Stars {
  const time = { value: 0 };
  const light = { value: 1 };

  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const twinkles = new Float32Array(STAR_COUNT);
  const phases = new Float32Array(STAR_COUNT);

  /*
   * Раскладка детерминированная, а не `Math.random`: одинаковое небо при
   * каждой загрузке — единственный способ сравнивать снимки между собой. Тот
   * же генератор, что у листьев, но со своим зерном: общее дало бы звёздам ту
   * же россыпь, что и стае.
   */
  let state = 0x2545f491;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = 0; index < STAR_COUNT; index++) {
    /*
     * Точка на сфере: угол по кругу и равномерная высота.
     *
     * Высота берётся ровной долей, а не углом наклона: у второго звёзды
     * собираются к полюсу, и прямо над головой встаёт шапка.
     */
    const theta = next() * Math.PI * 2;
    const y = HORIZON + next() * (1 - HORIZON);
    const flat = Math.sqrt(Math.max(0, 1 - y * y));

    positions[index * 3] = Math.cos(theta) * flat * STAR_RADIUS;
    positions[index * 3 + 1] = y * STAR_RADIUS;
    positions[index * 3 + 2] = Math.sin(theta) * flat * STAR_RADIUS;

    /*
     * Оттенок: холодный или тёплый, но чуть-чуть.
     *
     * Ровно белое поле читается сеткой пикселей, а цветные звёзды — ёлочной
     * гирляндой. Разброс держится в пределах десятой доли по каналу.
     */
    const warm = next();
    colors[index * 3] = 0.9 + warm * 0.1;
    colors[index * 3 + 1] = 0.93 + next() * 0.07;
    colors[index * 3 + 2] = 1 - warm * 0.12;

    // Зерно в квадрате: мелких звёзд много, ярких мало — как в настоящем небе.
    const grade = next();
    sizes[index] = STAR_MIN_SCALE + (1 - STAR_MIN_SCALE) * grade * grade;

    // Свой период у каждой: от медленной дрожи до частой. Общий заставил бы
    // всё поле дышать разом.
    twinkles[index] = 0.35 + next() * 1.4;
    phases[index] = next() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const texture = starTexture();
  const material = new THREE.PointsMaterial({
    size: STAR_SIZE,
    map: texture,
    vertexColors: true,
    transparent: true,
    // Небо позади всего: звезда светит поверх заливки, а не смешивается с ней.
    blending: THREE.AdditiveBlending,
    /*
     * Глубина проверяется, но не пишется.
     *
     * Раньше проверки не было — расчёт был на то, что поле рисуется до мира и
     * рельеф закрывает его собой. Расчёт неверный: `transparent: true` уводит
     * набор в прозрачную очередь, а она идёт после всей непрозрачной
     * геометрии. Звёзды ложились поверх готового кадра, и небо проступало
     * сквозь стволы и текстуры. `renderOrder` тут не спасает — он расставляет
     * только внутри очереди.
     *
     * Запись глубины при этом не нужна и вредна: точки не должны закрывать ни
     * друг друга, ни луну.
     */
    depthTest: true,
    depthWrite: false,
    // Размер в пикселях кадра, а не в юнитах: звезда не растёт при подлёте —
    // до неё в мире долететь нельзя.
    sizeAttenuation: false,
    fog: false,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uStarTime = time;
    shader.uniforms.uStarLight = light;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HEADER}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TWINKLE}`)
      /*
       * Размер свой у каждой звезды: одинаковые читаются сеткой, а не небом.
       *
       * Своим атрибутом, а не встроенным: `size` у `PointsMaterial` — это
       * uniform на весь набор, и разложить по нему звёзды нельзя. Правится
       * присваивание, а не результат: без ослабления по расстоянию
       * `gl_PointSize` ставится ровно здесь.
       */
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vStar;`)
      /*
       * Яркость и мерцание входят множителем в свет, а не в цвет вершины: так
       * гаснут ядро и мягкий край точки разом, и звезда не оставляет после
       * себя цветного пятна.
       *
       * До `opaque_fragment`, а не после: дальше идут тональная компрессия и
       * перевод в цветовое пространство, и правка за ними считалась бы уже по
       * готовому пикселю — мимо всей постобработки.
       */
      .replace(
        '#include <opaque_fragment>',
        'outgoingLight *= vStar;\n#include <opaque_fragment>',
      );
  };

  /*
   * Свой ключ кэша программ: без него правка достанется чужому
   * `PointsMaterial` — например листьям, — а их набор точек прочитает
   * отсутствующий `aTwinkle`. Тот же приём, что у листьев, воды и ветра.
   */
  material.customProgramCacheKey = () => 'stars';

  const points = new THREE.Points(geometry, material);
  points.name = 'world-stars';
  // Раньше луны: звёзды за ней, а не перед диском.
  points.renderOrder = -2;
  points.frustumCulled = false;
  parent.add(points);

  return {
    time,

    update: (camera: THREE.Camera, delta: number) => {
      points.position.copy(camera.position);
      time.value = (time.value + delta) % TWINKLE_PERIOD;
    },

    setLight: (value: number) => {
      light.value = value;
    },

    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      points.removeFromParent();
    },
  };
}
