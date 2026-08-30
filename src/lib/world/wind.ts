/** Ветер в кронах: изгиб по высоте плюс мелкая рябь по листве. */

import * as THREE from 'three';

/** Наибольший наклон кроны. Пять градусов — кивок, а не буря. */
const MAX_ANGLE = (5 * Math.PI) / 180;

/** Частота изгиба: полный размах примерно за семь секунд. */
const SWAY_SPEED = 0.9;

/**
 * Частота ряби по листве. Целое число размахов основного изгиба — тогда обе
 * волны заворачиваются в один период и время можно держать в малых числах.
 */
const FLUTTER_MULTIPLE = 6;

/** Доли изгиба и ряби в общем угле. В сумме единица: угол не выходит за MAX. */
const SWAY_SHARE = 0.8;
const FLUTTER_SHARE = 0.2;

/** Направление ветра по карте. Нормировано. */
const WIND_DIR = new THREE.Vector2(0.85, 0.53).normalize();

/** Длина волны порыва по карте, юнитов. Мир — 120 x 115, волна идёт по лесу. */
const WAVE_LENGTH = 25;

/** Разброс фазы по кроне: от него рябь идёт по листьям, а не по всему дереву. */
const FLUTTER_SPREAD = 40;

/**
 * Разброс между деревьями. Без него весь лес ходит одной волной вдоль одной
 * оси: фаза считалась только от позиции, и соседние кроны шли в такт.
 */
const PHASE_SPREAD = 0.65;
const GAIN_SPREAD = 0.3;
const TURN_SPREAD = (30 * Math.PI) / 180;

/** Пузырь вокруг зрителя: дальше него кроны стоят. */
export const WIND_NEAR_RADIUS = 2.65;
export const WIND_FADE_RADIUS = 5.3;

/** Имя атрибута с весом качания. Ноль — вершина неподвижна. */
export const WIND_WEIGHT_ATTRIBUTE = 'windWeight';

/**
 * Период, по которому заворачивается время. Без заворота `float` в шейдере за
 * час работы теряет мелкие разряды, и рябь начинает дрожать ступенями.
 */
export const WIND_PERIOD = (Math.PI * 2) / SWAY_SPEED;

/** Качается ли этот инстанс-меш. */
export function isWindy(name: string): boolean {
  return name.startsWith('tree_') || name.startsWith('caelid_tree');
}

/** Направление ветра готовым литералом GLSL: подставляется в шейдер трижды. */
const dirLiteral = `vec2(${WIND_DIR.x.toFixed(6)}, ${WIND_DIR.y.toFixed(6)})`;
const waveNumber = ((Math.PI * 2) / WAVE_LENGTH).toFixed(6);

/** Объявления. Идут в начало вершинного шейдера, к остальным атрибутам. */
const WIND_HEADER = `
uniform float uWindTime;
attribute float ${WIND_WEIGHT_ATTRIBUTE};

float windRandom(vec2 at, float seed) {
  return fract(sin(dot(at, vec2(12.9898, 78.233)) + seed) * 43758.5453);
}
`;

/** Тело качания. Ставится после `begin_vertex` и правит только `transformed`. */
const WIND_CHUNK = `
  #ifdef USE_INSTANCING
    vec3 windAt = vec3(instanceMatrix[3]);
    // Ветер задан по миру, а экземпляры развёрнуты каждый по-своему: переводим
    // направление в оси экземпляра. Масштаб однороден — то же допущение, что в
    // obstacles.ts, — поэтому нормировки хватает вместо обратной матрицы.
    vec2 windDir = normalize((vec3(${WIND_DIR.x.toFixed(6)}, 0.0, ${WIND_DIR.y.toFixed(6)}) * mat3(instanceMatrix)).xz);
  #else
    vec3 windAt = vec3(0.0);
    vec2 windDir = ${dirLiteral};
  #endif

  // Пузырь вокруг зрителя. Камеру три объявляет сама (cameraPosition),
  // отдельный uniform не нужен.
  vec3 windWorld = (modelMatrix * vec4(windAt, 1.0)).xyz;
  float windNear = 1.0 - smoothstep(${WIND_NEAR_RADIUS.toFixed(2)}, ${WIND_FADE_RADIUS.toFixed(2)}, distance(cameraPosition, windWorld));

  // Три жребия на дерево: свой момент цикла, свой размах, свой доворот.
  float windOwnPhase = windRandom(windAt.xz, 0.0);
  float windOwnGain = windRandom(windAt.xz, 17.13);
  float windOwnTurn = windRandom(windAt.xz, 43.71);

  // Доворот от общего ветра. Направление остаётся общим, но соседи больше не
  // ложатся строго в одну линию.
  float windTurn = (windOwnTurn - 0.5) * ${(TURN_SPREAD * 2).toFixed(6)};
  float windTurnSin = sin(windTurn);
  float windTurnCos = cos(windTurn);
  windDir = vec2(
    windDir.x * windTurnCos - windDir.y * windTurnSin,
    windDir.x * windTurnSin + windDir.y * windTurnCos
  );

  // Фаза: волна порыва по карте плюс собственный сдвиг дерева.
  float windPhase = dot(windAt.xz, ${dirLiteral}) * ${waveNumber}
    + windOwnPhase * ${(Math.PI * 2 * PHASE_SPREAD).toFixed(6)};
  float windSway = sin(uWindTime * ${SWAY_SPEED.toFixed(6)} + windPhase);
  float windFlutter = sin(uWindTime * ${(SWAY_SPEED * FLUTTER_MULTIPLE).toFixed(6)} + windPhase * 3.0 + transformed.y * ${FLUTTER_SPREAD.toFixed(1)});

  float windGain = ${(1 - GAIN_SPREAD).toFixed(2)} + windOwnGain * ${(GAIN_SPREAD * 2).toFixed(2)};
  float windAngle = ${MAX_ANGLE.toFixed(6)} * windGain * windNear * (windSway * ${SWAY_SHARE.toFixed(2)} + windFlutter * ${FLUTTER_SHARE.toFixed(2)}) * ${WIND_WEIGHT_ATTRIBUTE};

  // Поворот вокруг основания: точка уходит вбок тем сильнее, чем выше сидит.
  transformed.xz += windDir * (transformed.y * sin(windAngle));
  transformed.y *= cos(windAngle);
`;

/**
 * Вес качания по вершинам: доля высоты в квадрате. Ствол у земли стоит, крона
 * забирает почти весь наклон.
 * @returns `false`, если качать нечего — плоская геометрия без высоты
 */
export function buildWindWeights(geometry: THREE.BufferGeometry): boolean {
  const position = geometry.getAttribute('position');
  if (!position) return false;

  geometry.computeBoundingBox();
  const height = geometry.boundingBox?.max.y ?? 0;
  if (height <= 0) return false;

  const weights = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const share = Math.min(Math.max(position.getY(i) / height, 0), 1);
    weights[i] = share * share;
  }

  geometry.setAttribute(WIND_WEIGHT_ATTRIBUTE, new THREE.BufferAttribute(weights, 1));

  return true;
}

export type Wind = {
  /**
   * Фаза ветра. Она же ручка на подбор: остановить время и посмотреть кроны в
   * крайнем положении иначе нельзя — качание живёт только в шейдере.
   */
  time: { value: number };
  /** Продвинуть ветер. Вызывается из цикла сцены раз в кадр. */
  advance: (delta: number) => void;
  /**
   * Завести ветер на инстанс-меше деревьев.
   * @returns `false`, если качать нечего — плоская геометрия без высоты
   */
  apply: (mesh: THREE.Mesh) => boolean;
};

/**
 * Ветер одного мира. Время живёт в экземпляре, а не в модуле: сцена закрывается
 * и открывается заново, и второй мир не должен подбирать фазу первого — то же
 * правило, по которому в `scene.ts` нет модульного состояния.
 */
export function createWind(): Wind {
  const time = { value: 0 };

  /** Патч одного материала. Общий для деревьев и для материала прохода. */
  const patch = (material: THREE.Material) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WIND_HEADER}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_CHUNK}`);
    };

    material.customProgramCacheKey = () => 'wind';
    material.needsUpdate = true;
  };

  return {
    time,

    advance: (delta: number) => {
      time.value = (time.value + delta) % WIND_PERIOD;
    },

    apply: (mesh: THREE.Mesh) => {
      if (!buildWindWeights(mesh.geometry)) return false;

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) patch(material);

      return true;
    },
  };
}
