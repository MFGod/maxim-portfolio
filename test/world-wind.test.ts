import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { describe, expect, it } from 'vitest';

import {
  buildWindWeights,
  createWind,
  isWindy,
  WIND_FADE_RADIUS,
  WIND_NEAR_RADIUS,
  WIND_PERIOD,
  WIND_WEIGHT_ATTRIBUTE,
} from '@/lib/world/wind';

/** Обрезок вершинного шейдера три: только те строки, в которые метит патч. */
const BASE_VERTEX = `
#include <common>
void main() {
  #include <begin_vertex>
  gl_Position = vec4( transformed, 1.0 );
}
`;

/** Дерево ростом в треть юнита — как `tree_yellow_1` в ассетах. */
function treeMesh(height = 0.309): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 0.1, height, 0.1, -0.1, height / 2, 0], 3),
  );
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
}

/** Прогоняет патч материала через тот же вызов, что делает три при компиляции. */
function compile(material: THREE.Material) {
  const shader = { uniforms: {}, vertexShader: BASE_VERTEX } as unknown as Parameters<
    NonNullable<THREE.Material['onBeforeCompile']>
  >[0];
  material.onBeforeCompile!(shader, null as never);
  return shader;
}

/** Значения атрибутов по умолчанию: в типах три их объявили только у шейдерных. */
function defaultsOf(material: THREE.Material) {
  return (material as THREE.Material & { defaultAttributeValues?: Record<string, number[]> })
    .defaultAttributeValues;
}

describe('isWindy', () => {
  it('качает деревья и не трогает кусты', () => {
    // Arrange — имена из `assets.ts`, как они приходят в загрузчик.
    const windy = ['tree_yellow_1', 'tree_conifer_green_2', 'tree_dead', 'caelid_tree_1'];
    const still = ['bush_green_1', 'bush_orange_4', 'gelmir_rock_1', 'grace', 'map'];

    // Act + Assert
    for (const name of windy) expect(isWindy(name), name).toBe(true);
    for (const name of still) expect(isWindy(name), name).toBe(false);
  });
});

describe('buildWindWeights', () => {
  it('даёт основанию ноль, верхушке единицу, середине квадрат доли', () => {
    // Arrange
    const geometry = treeMesh(0.4).geometry;

    // Act
    const built = buildWindWeights(geometry);
    const weights = geometry.getAttribute(WIND_WEIGHT_ATTRIBUTE);

    // Assert
    expect(built).toBe(true);
    expect(weights.itemSize).toBe(1);
    expect(weights.getX(0)).toBeCloseTo(0, 6);
    expect(weights.getX(1)).toBeCloseTo(1, 6);
    // Половина высоты — четверть наклона: вес квадратичный.
    expect(weights.getX(2)).toBeCloseTo(0.25, 6);
  });

  it('отказывается от плоской геометрии', () => {
    // Arrange
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3),
    );

    // Act + Assert
    expect(buildWindWeights(geometry)).toBe(false);
    expect(geometry.getAttribute(WIND_WEIGHT_ATTRIBUTE)).toBeUndefined();
  });
});

describe('createWind', () => {
  it('держит фазу в экземпляре, а не в модуле', () => {
    // Arrange — два мира сразу: закрытый и открытый заново не должны делить фазу.
    const first = createWind();
    const second = createWind();

    // Act
    first.advance(1);

    // Assert
    expect(first.time.value).toBeCloseTo(1, 6);
    expect(second.time.value).toBe(0);
  });

  it('заворачивает время по периоду вместо бесконечного роста', () => {
    // Arrange
    const wind = createWind();

    // Act — три периода кадрами по 1/60 секунды.
    const frames = Math.round((WIND_PERIOD * 3) / (1 / 60));
    for (let i = 0; i < frames; i++) wind.advance(1 / 60);

    // Assert
    expect(wind.time.value).toBeGreaterThanOrEqual(0);
    expect(wind.time.value).toBeLessThan(WIND_PERIOD);
  });

  it('после полного периода возвращает ту же фазу изгиба', () => {
    // Arrange
    const wind = createWind();
    const speed = (Math.PI * 2) / WIND_PERIOD;
    const before = Math.sin(wind.time.value * speed);

    // Act
    wind.advance(WIND_PERIOD);

    // Assert — заворот незаметен в кадре: синус на стыке тот же.
    expect(Math.sin(wind.time.value * speed)).toBeCloseTo(before, 6);
  });
});

describe('wind.apply', () => {
  it('патчит материал, подключает своё время и объявляет атрибут', () => {
    // Arrange
    const wind = createWind();
    const mesh = treeMesh();
    const material = mesh.material as THREE.MeshStandardMaterial;

    // Act
    const applied = wind.apply(mesh);
    const shader = compile(material);

    // Assert
    expect(applied).toBe(true);
    expect(shader.uniforms.uWindTime).toBe(wind.time);
    expect(shader.vertexShader).toContain(`attribute float ${WIND_WEIGHT_ATTRIBUTE};`);
    expect(shader.vertexShader.indexOf('windAngle')).toBeGreaterThan(
      shader.vertexShader.indexOf('#include <begin_vertex>'),
    );
  });

  it('берёт вес из атрибута, а не из вшитой высоты', () => {
    // Arrange
    const wind = createWind();
    const low = treeMesh(0.309);
    const high = treeMesh(0.712);

    // Act
    wind.apply(low);
    wind.apply(high);

    // Assert — разным деревьям больше не нужны разные программы: было
    // одиннадцать под одиннадцать высот, стала одна.
    expect(compile(low.material as THREE.Material).vertexShader).toBe(
      compile(high.material as THREE.Material).vertexShader,
    );
    expect((low.material as THREE.Material).customProgramCacheKey!()).toBe(
      (high.material as THREE.Material).customProgramCacheKey!(),
    );
  });

  it('гасит качание вдали от зрителя', () => {
    // Arrange
    const wind = createWind();
    const mesh = treeMesh();

    // Act
    wind.apply(mesh);
    const { vertexShader } = compile(mesh.material as THREE.Material);

    // Assert — пузырь считается от камеры и затухает, а не обрывается.
    expect(vertexShader).toContain('distance(cameraPosition, windWorld)');
    expect(vertexShader).toContain(
      `smoothstep(${WIND_NEAR_RADIUS.toFixed(2)}, ${WIND_FADE_RADIUS.toFixed(2)}`,
    );
    // Затухание идёт наружу: перепутанные местами радиусы дали бы обратный
    // пузырь — качались бы дальние деревья, а ближние стояли.
    expect(WIND_FADE_RADIUS).toBeGreaterThan(WIND_NEAR_RADIUS);
  });

  it('правит только transformed и ничего больше', () => {
    // Arrange
    const wind = createWind();
    const mesh = treeMesh();

    // Act
    wind.apply(mesh);
    const { vertexShader } = compile(mesh.material as THREE.Material);

    // Assert — кусок не лезет в другие переменные конвейера.
    expect(vertexShader).toContain('transformed.xz +=');
    expect(vertexShader).toContain('transformed.y *=');
    expect(vertexShader).not.toContain('vNormal =');
  });

  it('отказывается качать плоскую геометрию', () => {
    // Arrange
    const wind = createWind();
    const flat = new THREE.Mesh(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3),
      ),
      new THREE.MeshStandardMaterial(),
    );

    // Act + Assert
    expect(wind.apply(flat)).toBe(false);
  });
});

describe('wind.applyToNormalPass', () => {
  it('даёт настоящему проходу GTAO тот же ветер, что и деревьям', () => {
    // Arrange — проход строится без контекста WebGL, поэтому берём настоящий:
    // подделка `{ normalMaterial }` не заметила бы переименования поля в three.
    const wind = createWind();
    const pass = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 8, 8);
    const tree = treeMesh();
    wind.apply(tree);

    // Act
    const applied = wind.applyToNormalPass(pass);

    // Assert — тот же кусок шейдера: иначе затемнение разойдётся с картинкой.
    expect(applied).toBe(true);
    expect(compile(pass.normalMaterial).vertexShader).toBe(
      compile(tree.material as THREE.Material).vertexShader,
    );
  });

  it('обнуляет вес всему, у чего атрибута нет', () => {
    // Arrange
    const wind = createWind();
    const pass = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 8, 8);

    // Act
    wind.applyToNormalPass(pass);

    // Assert — рельеф, скалы и здания идут через тот же материал и обязаны
    // остаться неподвижными.
    expect(defaultsOf(pass.normalMaterial)?.[WIND_WEIGHT_ATTRIBUTE]).toEqual([0]);
  });

  it('молчит, когда постобработки нет', () => {
    // Act + Assert — на слабой машине проход не создан, чинить нечего.
    expect(createWind().applyToNormalPass({})).toBe(false);
  });
});
