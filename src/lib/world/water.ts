/** Вода: рябь живёт в нормали, а не в вершинах. */

import * as THREE from 'three';

/** Одна волна: направление по карте, длина в юнитах, крутизна и скорость. */
export type Wave = {
  /** Направление бега по XZ. Нормируется тестом, не на глаз. */
  dir: readonly [number, number];
  /** Длина волны в юнитах мира. */
  length: number;
  /** Крутизна: наклон нормали на гребне. */
  steep: number;
  /** Скорость бега, юнитов в секунду. */
  speed: number;
};

/** Три волны разных длин под углом друг к другу. */
export const WAVES: readonly Wave[] = [
  { dir: [0.94, 0.34], length: 7.3, steep: 0.05, speed: 0.4258 },
  { dir: [0.17, 0.98], length: 3.1, steep: 0.038, speed: 0.5477 },
  { dir: [-0.77, 0.64], length: 1.27, steep: 0.022, speed: 0.7493 },
];

/** Период времени воды, секунд. */
export const WATER_PERIOD = 600;

const HEADER = /* glsl */ `
uniform float uWaterTime;
varying vec3 vWaterWorld;
`;

/** Наклон нормали суммой волн. */
function wavesGlsl(): string {
  const terms = WAVES.map((wave) => {
    const k = ((Math.PI * 2) / wave.length).toFixed(6);
    const [x, z] = wave.dir;
    const length = Math.hypot(x, z);
    const dx = (x / length).toFixed(6);
    const dz = (z / length).toFixed(6);

    return /* glsl */ `
  {
    vec2 d = vec2(${dx}, ${dz});
    float k = ${k};
    float phase = dot(d, p) * k + uWaterTime * ${(wave.speed * ((Math.PI * 2) / wave.length)).toFixed(6)};
    float fade = 1.0 - smoothstep(0.5, 1.5, px * k);
    slope += d * (${wave.steep.toFixed(6)} * cos(phase) * fade);
  }`;
  }).join('\n');

  return /* glsl */ `
  vec2 p = vWaterWorld.xz;
  float px = max(fwidth(vWaterWorld.x), fwidth(vWaterWorld.z));
  vec2 slope = vec2(0.0);
${terms}

  vec3 rippled = normalize(normal + vec3(-slope.x, 0.0, -slope.y));
  // NaN не локален: одна испорченная нормаль уходит в UnrealBloomPass и
  // размазывается чёрным по всему кадру. Дешевле проверить, чем ловить.
  normal = all(equal(rippled, rippled)) ? rippled : normal;
`;
}

export type Water = {
  /**
   * Фаза воды. Она же ручка на подбор: остановить время и рассмотреть гребень
   * иначе нельзя — рябь живёт только в шейдере.
   */
  time: { value: number };
  /** Продвинуть воду. Вызывается из цикла сцены раз в кадр. */
  advance: (delta: number) => void;
  /** Настроить материал водного слоя: цвет, отражение и рябь. */
  apply: (material: THREE.MeshStandardMaterial, envMap: THREE.Texture) => void;
};

/**
 * Вода одного мира. Время в экземпляре, а не в модуле: сцену закрывают и
 * открывают заново, и второй мир не должен подбирать фазу первого.
 */
export function createWater(): Water {
  const time = { value: 0 };

  return {
    time,

    advance: (delta: number) => {
      time.value = (time.value + delta) % WATER_PERIOD;
    },

    apply: (material: THREE.MeshStandardMaterial, envMap: THREE.Texture) => {
      material.envMap = envMap;
      material.transparent = true;
      material.depthWrite = true;
      material.opacity = 0.6;
      material.color = new THREE.Color(0x46d3dd);
      material.metalness = 0.853;
      material.roughness = 0.11;

      material.onBeforeCompile = (shader) => {
        shader.uniforms.uWaterTime = time;

        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${HEADER}`)
          .replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n\tvWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
          );

        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${HEADER}`)
          /*
           * Прямой блик убран: с ним вода блестит как металл. Отражение ей даёт
           * карта окружения, и его хватает — а солнечное пятно на `roughness`
           * 0.11 выходит зеркальным кружком, который ездит за камерой.
           */
          .replace(
            'vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;',
            'vec3 totalSpecular = reflectedLight.indirectSpecular;',
          )
          // Нормаль правится после того, как её собрал материал: до этого
          // места `normal` ещё не существует.
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>\n${wavesGlsl()}`,
          );
      };

      material.customProgramCacheKey = () => 'water';
      material.needsUpdate = true;
    },
  };
}
