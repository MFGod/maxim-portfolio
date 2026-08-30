/** Золотые листья: падают с крон Эрдтри и уносятся ветром. */

import * as THREE from 'three';

import { WORLD_ASSETS } from './assets';
import type { GroundField } from './map-shell';

/** Листьев по всем кронам. */
export const LEAF_COUNT = 3600;

/** Сколько секунд живёт лист. */
export const LIFETIME = 25;

/** Скорость падения, пока сетки земли нет, юнитов в секунду. */
export const FALL = 0.38;

/** Насколько лист может падать быстрее, чем нужно, чтобы ровно успеть. */
export const FALL_SPREAD = 0.35;

/** Скорость расхождения от кроны, юнитов в секунду. */
export const SPREAD_SPEED = 0.95;

/** Полный круг разлёта. */
export const SPREAD_ANGLE = Math.PI * 2;

/** За сколько юнитов до земли лист начинает таять. */
export const LANDING_FADE = 0.34;

/** Разброс рождения внутри кроны, юнитов. */
const SPAWN_SPREAD = 3.4;

/** Размах покачивания при падении, юнитов. */
const SWAY = 1.7;

/** Размер **самого крупного** листа в юнитах. Подобран вживую. */
export const LEAF_SIZE = 0.12;

/** Каким может стать самый мелкий лист от крупного. */
export const LEAF_MIN_SCALE = 0.32;

/** Период времени листьев, секунд. Кратен времени жизни: 24 полных жизни. */
export const LEAF_PERIOD = LIFETIME * 24;

/** Доля свечения кроны, которая достаётся листу. */
export const GLOW_SHARE = 0.45;

const HEADER = /* glsl */ `
uniform float uLeafTime;
uniform sampler2D uGround;
uniform vec2 uGroundMin;
uniform vec2 uGroundSpan;
uniform float uGroundReady;
attribute vec3 aCrown;
attribute vec2 aSeed;
varying float vSeed;
varying float vFade;
`;

/** Ход листа: рождение у кроны, падение, снос и покачивание. */
export const LEAF_MOVE = /* glsl */ `
  vSeed = aSeed.x;

  float phase = aSeed.x * 6.2831853;
  float life = fract(uLeafTime / ${LIFETIME.toFixed(1)} + aSeed.x);
  float age = life * ${LIFETIME.toFixed(1)};

  vec3 born = aCrown + position * ${SPAWN_SPREAD.toFixed(3)};

  /*
   * Скорость падения — из высоты рождения, а не из общего числа.
   *
   * Земля берётся той же сеткой, что гасит лист внизу: недолёт до настоящего
   * рельефа у неё есть, но он один и тот же в обоих местах, и лист исчезает
   * ровно там, где эта «земля» для него кончается.
   */
  vec2 bornUv = (born.xz - uGroundMin) / uGroundSpan;
  float bornGround = texture2D(uGround, bornUv).r;
  float drop = max(born.y - bornGround, 0.0);
  float pace = mix(${FALL.toFixed(3)}, drop / ${LIFETIME.toFixed(1)}, uGroundReady);

  /*
   * Своя сторона у каждого листа — полный круг от кроны. Скорость берётся из
   * смеси обоих зёрен, а не из того же, что задало угол: иначе все листья,
   * улетающие на юг, оказались бы ровно самыми быстрыми, и круг читался бы
   * спиралью.
   */
  float turn = aSeed.y * ${SPREAD_ANGLE.toFixed(6)};
  vec2 away = vec2(cos(turn), sin(turn));

  float mix2 = fract(aSeed.x * 1.7 + aSeed.y * 2.3);
  float speed = ${SPREAD_SPEED.toFixed(3)} * (0.3 + mix2 * 1.7);
  float fall = pace * (1.0 + aSeed.x * ${FALL_SPREAD.toFixed(3)});

  /*
   * Оборотов покачивания за жизнь — целое число, но своё: два, три или четыре.
   * Дробное дало бы скачок при перерождении, одинаковое — общий ритм на всю
   * стаю, будто листья связаны нитью.
   */
  float turns = 2.0 + floor(aSeed.x * 3.0);
  float swayPhase = life * 6.2831853 * turns + phase;
  float swayWidth = ${SWAY.toFixed(3)} * (0.6 + mix2 * 0.8);

  vec3 blown = vec3(
    away.x * speed * age + sin(swayPhase) * swayWidth,
    -fall * age + sin(swayPhase * 0.5) * 0.35,
    away.y * speed * age + cos(swayPhase) * swayWidth
  );

  transformed = born + blown;

  // Появление и уход: десятая доля жизни с каждого конца.
  vFade = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.9, 1.0, life));

  /*
   * Приземление: лист тает над землёй, а не уходит в неё.
   *
   * Высота рельефа приходит сеткой в текстуре — на процессоре её знать негде,
   * лист движется в шейдере. Пока сетки нет (карта ещё грузится), гашение
   * выключено множителем: без него вся стая пропала бы, приняв нулевую
   * текстуру за землю на нулевой высоте.
   */
  vec2 groundUv = (transformed.xz - uGroundMin) / uGroundSpan;
  float ground = texture2D(uGround, groundUv).r;
  float above = transformed.y - ground;
  float landing = smoothstep(0.0, ${LANDING_FADE.toFixed(2)}, above);

  vFade *= mix(1.0, landing, uGroundReady);
`;

/** Отрисовка листа: поворот спрайта по возрасту и гашение на концах жизни. */
const DRAW = /* glsl */ `
  float spin = uLeafTime * (0.35 + vSeed * 0.9) + vSeed * 6.2831853;
  vec2 offset = gl_PointCoord - 0.5;
  vec2 turned = vec2(
    offset.x * cos(spin) - offset.y * sin(spin),
    offset.x * sin(spin) + offset.y * cos(spin)
  ) + 0.5;

  /*
   * За краем повёрнутого квадрата текстуры нет, и там гасится альфа, а не
   * отбрасывается пиксель: discard в этом месте уводил весь набор в
   * невидимость, а гашение альфой делает то же самое видимым способом.
   */
  vec2 inside = step(vec2(0.0), turned) * step(turned, vec2(1.0));
  vec4 leaf = texture2D(map, clamp(turned, 0.0, 1.0));

  diffuseColor *= vec4(leaf.rgb, leaf.a * inside.x * inside.y * vFade);

  /*
   * Свечение: то же золото, что у кроны, и в тех же долях по времени суток.
   *
   * Множится на альфу листа: за краем повёрнутого спрайта альфы нет, и без
   * множителя стая засветилась бы квадратами. Гашение на концах жизни и над
   * землёй уже сидит в той же альфе, поэтому лист гаснет вместе со свечением,
   * а не тает, оставив за собой светящийся след.
   */
  diffuseColor.rgb += uLeafGlow * diffuseColor.a;
`;

/** Размер ячейки, которой кроны разбираются на отдельные деревья, в юнитах. */
const CROWN_CELL = 6;

/** Вершин в ячейке, ниже которого это не крона, а её край. */
const CROWN_MIN_VERTICES = 50;

/** Ближе какого расстояния центры ячеек считаются одним деревом, юнитов. */
const TREE_SPACING = 8;

/** Одна ячейка листвы: центр вершин, их число и занятый ими объём. */
type CrownCell = { center: THREE.Vector3; count: number; box: THREE.Box3 };

/** Светящаяся крона Эрдтри как одно дерево, а не как набор ячеек. */
export type Tree = {
  /** Середина листвы в мировых координатах. */
  position: THREE.Vector3;
  /** Половина горизонтального габарита листвы, юнитов. */
  radius: number;
};

/** Раскладывает вершины светящейся листвы по ячейкам сетки. */
function crownCells(scene: THREE.Object3D): CrownCell[] {
  let source: THREE.Mesh | null = null;

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.geometry || !mesh.material) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const emissive = (material as THREE.MeshStandardMaterial).emissive;
      if (emissive && emissive.getHexString() === 'ffa51d') source = mesh;
    }
  });

  if (!source) return [];

  const mesh: THREE.Mesh = source;
  const position = mesh.geometry.attributes.position;
  if (!position) return [];

  type Bucket = { count: number; sum: THREE.Vector3; box: THREE.Box3 };
  const cells = new Map<string, Bucket>();
  const point = new THREE.Vector3();

  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index);
    mesh.localToWorld(point);

    const key = `${Math.floor(point.x / CROWN_CELL)}|${Math.floor(point.z / CROWN_CELL)}`;
    const cell = cells.get(key) ?? {
      count: 0,
      sum: new THREE.Vector3(),
      box: new THREE.Box3(),
    };
    cell.count += 1;
    cell.sum.add(point);
    cell.box.expandByPoint(point);
    cells.set(key, cell);
  }

  return [...cells.values()]
    .filter((cell) => cell.count >= CROWN_MIN_VERTICES)
    .map((cell) => ({
      center: cell.sum.divideScalar(cell.count),
      count: cell.count,
      box: cell.box,
    }));
}

/**
 * Находит кроны Эрдтри в карте.
 * @returns центры крон в мировых координатах; пустой список — карта ещё не
 */
export function crownsOf(scene: THREE.Object3D): THREE.Vector3[] {
  return crownCells(scene).map((cell) => cell.center);
}

/**
 * Находит деревья Эрдтри в карте — по одному на дерево, с размером кроны.
 * @param scene сцена мира
 * @param spacing ближе этого расстояния ячейки считаются одним деревом
 * @returns деревья от крупного к мелкому
 */
export function treesOf(scene: THREE.Object3D, spacing = TREE_SPACING): Tree[] {
  const cells = crownCells(scene).sort((a, b) => b.count - a.count);
  const trees: { sum: THREE.Vector3; count: number; box: THREE.Box3 }[] = [];

  for (const cell of cells) {
    let host: (typeof trees)[number] | null = null;
    let hostDistance = spacing;

    for (const tree of trees) {
      const middle = tree.sum.clone().divideScalar(tree.count);
      const distance = middle.distanceTo(cell.center);

      if (distance < hostDistance) {
        host = tree;
        hostDistance = distance;
      }
    }

    if (host) {
      host.sum.addScaledVector(cell.center, cell.count);
      host.count += cell.count;
      host.box.union(cell.box);
    } else {
      trees.push({
        sum: cell.center.clone().multiplyScalar(cell.count),
        count: cell.count,
        box: cell.box.clone(),
      });
    }
  }

  const size = new THREE.Vector3();

  return trees.map((tree) => {
    tree.box.getSize(size);

    return {
      position: tree.sum.divideScalar(tree.count),
      radius: Math.max(size.x, size.z) / 2,
    };
  });
}

export type Leaves = {
  /** Фаза листьев. Она же ручка на подбор: остановить время и рассмотреть лист. */
  time: { value: number };
  /**
   * Текстура листа. Отдаётся наружу, чтобы опавшая листва брала ту же: два
   * загрузчика на один файл — это две текстуры в видеопамяти и риск, что на
   * земле однажды окажется другое дерево.
   */
  texture: THREE.Texture;
  /** Продвинуть листья. Зовётся из цикла сцены раз в кадр. */
  advance: (delta: number) => void;
  /** Раздаёт листьям кроны. Зовётся один раз, когда карта пришла. */
  seed: (crowns: THREE.Vector3[]) => void;
  /** Отдаёт листьям высоты рельефа: над ними они тают, а не втыкаются. */
  useGround: (field: GroundField) => void;
  dispose: () => void;
};

/**
 * @param crown материал крон Эрдтри. Свечение листа ведёт он: у листа и у
 *   дерева общее золото и общий подъём эмиссии в сумерках, а копия числом
 *   разошлась бы с деревьями на первой же правке освещения.
 */
export function createLeaves(
  parent: THREE.Object3D,
  loader: THREE.TextureLoader,
  crown: THREE.MeshStandardMaterial,
): Leaves {
  const time = { value: 0 };

  /** Свечение листа: цвет эмиссии крон, ослабленный долей. Ведётся в `advance`. */
  const glow = { value: new THREE.Vector3() };

  const ground = {
    map: {
      value: new THREE.DataTexture(
        new Float32Array([0]),
        1,
        1,
        THREE.RedFormat,
        THREE.FloatType,
      ),
    },
    min: { value: new THREE.Vector2() },
    span: { value: new THREE.Vector2(1, 1) },
    ready: { value: 0 },
  };
  ground.map.value.needsUpdate = true;

  const offsets = new Float32Array(LEAF_COUNT * 3);
  const crowns = new Float32Array(LEAF_COUNT * 3);
  const seeds = new Float32Array(LEAF_COUNT * 2);

  let state = 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = 0; index < LEAF_COUNT; index++) {
    const theta = next() * Math.PI * 2;
    const z = next() * 2 - 1;
    const radius = Math.cbrt(next());
    const flat = Math.sqrt(1 - z * z);

    offsets[index * 3] = Math.cos(theta) * flat * radius;
    offsets[index * 3 + 1] = z * radius;
    offsets[index * 3 + 2] = Math.sin(theta) * flat * radius;
    seeds[index * 2] = next();
    seeds[index * 2 + 1] = next();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(offsets, 3));
  geometry.setAttribute('aCrown', new THREE.BufferAttribute(crowns, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 2));

  const texture = loader.load(`${WORLD_ASSETS}/leaf.png`);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.PointsMaterial({
    size: LEAF_SIZE,
    map: texture,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.02,
    fog: true,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLeafTime = time;
    shader.uniforms.uGround = ground.map;
    shader.uniforms.uGroundMin = ground.min;
    shader.uniforms.uGroundSpan = ground.span;
    shader.uniforms.uGroundReady = ground.ready;
    shader.uniforms.uLeafGlow = glow;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HEADER}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEAF_MOVE}`)
      /*
       * Размер свой у каждого листа: одинаковые читаются набором наклеек.
       *
       * Зерно возводится в квадрат, поэтому мелких листьев много, а крупные
       * редки — как в настоящей кроне. При равномерном разбросе стая выглядит
       * набором двух-трёх калибров.
       *
       * Правится присваивание, а не результат: ослабление по расстоянию идёт
       * следом и должно множить уже разброшенный размер.
       */
      .replace(
        'gl_PointSize = size;',
        `gl_PointSize = size * (${LEAF_MIN_SCALE.toFixed(3)} + ${(1 - LEAF_MIN_SCALE).toFixed(3)} * aSeed.x * aSeed.x);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying float vSeed;\nvarying float vFade;\nuniform float uLeafTime;\nuniform vec3 uLeafGlow;`,
      )
      .replace('#include <map_particle_fragment>', DRAW);
  };

  material.customProgramCacheKey = () => 'leaves';

  const points = new THREE.Points(geometry, material);
  points.name = 'world-leaves';
  points.frustumCulled = false;
  points.visible = false;
  parent.add(points);

  return {
    time,
    texture,

    advance: (delta: number) => {
      time.value = (time.value + delta) % LEAF_PERIOD;

      glow.value
        .set(crown.emissive.r, crown.emissive.g, crown.emissive.b)
        .multiplyScalar(crown.emissiveIntensity * GLOW_SHARE);
    },

    seed: (sources: THREE.Vector3[]) => {
      if (sources.length === 0) return;

      for (let index = 0; index < LEAF_COUNT; index++) {
        const crown = sources[index % sources.length]!;

        crowns[index * 3] = crown.x;
        crowns[index * 3 + 1] = crown.y;
        crowns[index * 3 + 2] = crown.z;
      }

      geometry.attributes.aCrown!.needsUpdate = true;
      points.visible = true;
    },

    useGround: (field: GroundField) => {
      const data = new Float32Array(field.data.length);
      for (let index = 0; index < data.length; index++) {
        const height = field.data[index]!;
        data[index] = Number.isFinite(height) ? height : -50;
      }

      const map = new THREE.DataTexture(
        data,
        field.cols,
        field.rows,
        THREE.RedFormat,
        THREE.FloatType,
      );
      map.magFilter = THREE.NearestFilter;
      map.minFilter = THREE.NearestFilter;
      map.wrapS = THREE.ClampToEdgeWrapping;
      map.wrapT = THREE.ClampToEdgeWrapping;
      map.needsUpdate = true;

      ground.map.value.dispose();
      ground.map.value = map;
      ground.min.value.set(field.minX, field.minZ);
      ground.span.value.set(field.cols * field.cell, field.rows * field.cell);
      ground.ready.value = 1;
    },

    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      ground.map.value.dispose();
      points.removeFromParent();
    },
  };
}
