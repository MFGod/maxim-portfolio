/**
 * Золотые листья: падают с крон Эрдтри и уносятся ветром.
 *
 * Источник — само древо, а не воздух вокруг зрителя. Прежняя раскладка сыпала
 * листья кубом вокруг камеры: они появлялись из ничего посреди голого поля и
 * читались погодой, а не деревом. Теперь у каждого листа есть своя крона, и
 * расходятся они от неё во все стороны — видно, откуда золото, с любой точки
 * обзора.
 *
 * Кроны берутся из самой карты, а не из данных: у них общий материал
 * (`Erdtree Minor Leaves`, эмиссия `#ffa51d`), а на карте они стоят двумя
 * десятками отдельных деревьев внутри одного меша. Разложить их по местам
 * можно только обходом вершин — см. `crownsOf`.
 *
 * Движение целиком в вершинном шейдере: буфер не трогается ни разу за всю
 * жизнь сцены. Лист живёт `LIFETIME` секунд, потом рождается у своей кроны
 * заново; прозрачность гасит его на концах жизни, поэтому подмены не видно.
 */

import * as THREE from 'three';

import { WORLD_ASSETS } from './assets';
import type { GroundField } from './map-shell';

/**
 * Листьев по всем кронам.
 *
 * Число идёт за дальностью разлёта, а не за вкусом: лист теперь уходит от
 * кроны на два десятка юнитов вместо десяти, и объём, по которому размазана
 * стая, вырос вчетверо. Прежние тысяча восемьсот на нём читались редкой
 * моросью. Это по-прежнему одна отрисовка и семьдесят килобайт буфера.
 */
export const LEAF_COUNT = 3600;

/**
 * Сколько секунд живёт лист.
 *
 * За это время он должен успеть долететь до земли: кроны стоят на высоте
 * 4–20 юнитов, при скорости падения это два десятка секунд. Число делит период
 * нацело — иначе на стыке круга вся стая перерождается разом.
 */
export const LIFETIME = 25;

/** Скорость падения, юнитов в секунду. Лист планирует, а не роняется камнем. */
export const FALL = 0.38;

/**
 * Скорость расхождения от кроны, юнитов в секунду.
 *
 * Общего направления у стаи нет: лист уходит от своего дерева в свою сторону,
 * равномерно по всему кругу. Крона получается источником, а не флюгером — и
 * читается ею с любого ракурса, а не только против ветра.
 *
 * За жизнь лист уходит от кроны на два десятка юнитов — шестую часть карты.
 * На вдвое меньшей скорости золото висело облаком у самого дерева, и стая
 * читалась роем мошкары, а не листопадом.
 */
export const SPREAD_SPEED = 0.95;

/**
 * Полный круг разлёта.
 *
 * Экспортируется ради теста: это то самое место, где «во все стороны»
 * превращается в число, и урезание его до сектора — молчаливая правка
 * замысла, а не настройка.
 */
export const SPREAD_ANGLE = Math.PI * 2;

/**
 * За сколько юнитов до земли лист начинает таять.
 *
 * Треть юнита — и это много больше, чем кажется: масштаб мира примерно
 * 1 юнит на 40 метров, фигура человека здесь 0.117. Прежние полтора юнита
 * гасили лист за тринадцать человеческих ростов до земли, и он растворялся в
 * воздухе на глазах.
 *
 * Ниже опускать некуда: сетка высот приходит от купола камеры, а он лежит
 * выше рельефа и расширен вбок у обрывов. Лист, которому позволить подойти
 * вплотную к этой «земле», местами воткнётся в настоящую.
 */
export const LANDING_FADE = 0.34;

/** Разброс рождения внутри кроны, юнитов. */
const SPAWN_SPREAD = 3.4;

/** Размах покачивания при падении, юнитов. */
const SWAY = 1.7;

/**
 * Размер **самого крупного** листа в юнитах. Подобран вживую.
 *
 * Именно верхняя граница, а не середина: мельче лист может быть сколько
 * угодно, крупнее — нет. Разброс идёт только вниз от неё.
 *
 * Треть юнита, стоявшая здесь прежде, — это три роста человеческой фигуры
 * (0.117). На фоне неба сравнить лист было не с чем, и размер сходил с рук; у
 * земли, рядом с ковром в 0.023–0.045, стая читалась парящими простынями.
 * Спрайт вдобавок всегда развёрнут к камере, поэтому крупный лист у самой
 * травы стоит вертикально, как воткнутый.
 *
 * 0.12 ставит самый крупный лист вровень с фигурой, а самый мелкий (0.038)
 * — вровень с ковром.
 */
export const LEAF_SIZE = 0.12;

/**
 * Каким может стать самый мелкий лист от крупного.
 *
 * Треть: ниже лист вырождается в искру и на светлом склоне пропадает вовсе.
 */
export const LEAF_MIN_SCALE = 0.32;

/**
 * Период времени листьев, секунд. Кратен времени жизни: 24 полных жизни.
 *
 * Как и у воды, время идёт по кругу — иначе `float` на долгой вкладке теряет
 * шаг. На стыке круга каждый лист оказывается ровно в начале своей жизни.
 */
export const LEAF_PERIOD = LIFETIME * 24;

/**
 * Доля свечения кроны, которая достаётся листу.
 *
 * Лист светится тем же золотом, что и дерево, но слабее: у кроны есть объём,
 * которым свет держится, у спрайта в треть юнита — нет, и на полной эмиссии
 * дерева стая читается роем искр. На этой доле верх листа заходит за порог
 * `UnrealBloomPass` (1.0) и получает тот же ореол, что и крона, а тёмная
 * половина спрайта остаётся тёмной.
 */
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

/**
 * Ход листа: рождение у кроны, падение, снос и покачивание.
 *
 * Возраст у каждого листа свой — сдвинут по зерну, поэтому крона сыплет
 * непрерывно, а не залпами. `fract` возвращает лист к началу жизни, а `vFade`
 * гасит его на первой и последней десятой доле, чтобы подмены не было видно.
 */
const MOVE = /* glsl */ `
  vSeed = aSeed.x;

  float phase = aSeed.x * 6.2831853;
  float life = fract(uLeafTime / ${LIFETIME.toFixed(1)} + aSeed.x);
  float age = life * ${LIFETIME.toFixed(1)};

  vec3 born = aCrown + position * ${SPAWN_SPREAD.toFixed(3)};

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
  float fall = ${FALL.toFixed(3)} * (0.7 + aSeed.x * 0.7);

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

/**
 * Ближе какого расстояния центры ячеек считаются одним деревом, юнитов.
 *
 * Ячейка — это шесть на шесть юнитов листвы, а не дерево: крупная крона ложится
 * на три-четыре соседние ячейки, и их центры стоят в полутора юнитах друг от
 * друга. Замер по живой карте: двадцать одна ячейка на дюжину деревьев,
 * ближайшие друг к другу разные деревья разнесены на десять юнитов и больше.
 * Восемь — между этими полутора и десятью.
 */
const TREE_SPACING = 8;

/** Одна ячейка листвы: центр вершин, их число и занятый ими объём. */
type CrownCell = { center: THREE.Vector3; count: number; box: THREE.Box3 };

/** Светящаяся крона Эрдтри как одно дерево, а не как набор ячеек. */
export type Tree = {
  /** Середина листвы в мировых координатах. */
  position: THREE.Vector3;
  /**
   * Половина горизонтального габарита листвы, юнитов.
   *
   * Горизонтального, а не полного: у Эрдтри крона тянется вверх стволом, и по
   * высоте габарит меряет дерево целиком, а не размер светящейся шапки.
   */
  radius: number;
};

/**
 * Раскладывает вершины светящейся листвы по ячейкам сетки.
 *
 * Все деревья лежат в одном меше с общим материалом, поэтому «где кроны» —
 * вопрос к вершинам, а не к списку объектов.
 */
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
 *
 * Каждая достаточно плотная ячейка сетки даёт одну крону: замер по живой карте
 * дал двадцать одну на высотах от 4 до 20 юнитов. Крупное дерево отдаёт
 * несколько — и это здесь нужно: листья сыплются из всех, поэтому большая крона
 * роняет золото по всей своей ширине, а не из одной точки в середине. Тому, кто
 * раздаёт что-то по деревьям, а не по объёму листвы, нужна `treesOf`.
 *
 * @returns центры крон в мировых координатах; пустой список — карта ещё не
 *   пришла или в ней нет светящихся крон
 */
export function crownsOf(scene: THREE.Object3D): THREE.Vector3[] {
  return crownCells(scene).map((cell) => cell.center);
}

/**
 * Находит деревья Эрдтри в карте — по одному на дерево, с размером кроны.
 *
 * Ячейки одного дерева сливаются: ядром становится самая плотная, к ней липнут
 * соседние ближе `spacing`. Замер по живой карте: двадцать одна ячейка даёт
 * дюжину деревьев радиусом от 2 до 9 юнитов.
 *
 * @param scene сцена мира
 * @param spacing ближе этого расстояния ячейки считаются одним деревом
 * @returns деревья от крупного к мелкому
 */
export function treesOf(scene: THREE.Object3D, spacing = TREE_SPACING): Tree[] {
  const cells = crownCells(scene).sort((a, b) => b.count - a.count);
  const trees: { sum: THREE.Vector3; count: number; box: THREE.Box3 }[] = [];

  for (const cell of cells) {
    /*
     * Ячейка липнет к ближайшему уже собранному дереву, а не к первому
     * подходящему: у сомкнувшихся крон подходящих бывает два, и без выбора
     * ближайшего листва одного дерева уезжает в середину соседнего.
     */
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
  /**
   * Раздаёт листьям кроны. Зовётся один раз, когда карта пришла.
   *
   * До этого стая висит невидимой: сыпать листья из точки, где ещё нет дерева,
   * значит показать их в пустоте на первую же секунду.
   */
  seed: (crowns: THREE.Vector3[]) => void;
  /**
   * Отдаёт листьям высоты рельефа: над ними они тают, а не втыкаются.
   *
   * Отдельно от `seed`, потому что приходит из другого места — купол камеры
   * строится по карте, а кроны ищутся по материалу.
   */
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

  /*
   * Заглушка высот на время загрузки: один тексель, гашение выключено
   * множителем `ready`. Материал требует текстуру с самого первого кадра —
   * `null` в `sampler2D` рисует чёрный квадрат вместо стаи.
   */
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

  /*
   * В `position` лежит не место листа, а его смещение внутри кроны: шейдер
   * складывает его с центром дерева. Единичный шар, а не куб — у куба листья
   * собираются к углам, и крона получает квадратные плечи.
   */
  const offsets = new Float32Array(LEAF_COUNT * 3);
  const crowns = new Float32Array(LEAF_COUNT * 3);
  // Два зерна на лист: одно ведёт возраст и падение, другое — направление и
  // размах. С одним они оказались бы связаны: быстрый лист всегда летел бы в
  // одну и ту же сторону.
  const seeds = new Float32Array(LEAF_COUNT * 2);

  /*
   * Раскладка детерминированная, а не `Math.random`: одинаковый первый кадр
   * при каждой загрузке — единственный способ сравнивать снимки между собой.
   */
  let state = 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = 0; index < LEAF_COUNT; index++) {
    // Точка в шаре: направление плюс корень кубический из доли — иначе центр
    // шара оказывается гуще краёв.
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
    // Глубину лист проверяет, но не пишет: за холмом его не видно, а сквозь
    // соседний лист видно — иначе стая режет сама себя прямоугольниками.
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
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${MOVE}`)
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

  /*
   * Свой ключ кэша программ: без него правка достанется чужому
   * `PointsMaterial`, а чужой набор точек прочитает отсутствующий `aCrown`.
   * Тот же приём, что у ветра и у воды.
   */
  material.customProgramCacheKey = () => 'leaves';

  const points = new THREE.Points(geometry, material);
  points.name = 'world-leaves';
  /*
   * Отсечение по пирамиде выключено: габарит считается по смещениям внутри
   * кроны — единичному шару у начала координат, — а листья уезжают в шейдере
   * через полмира.
   */
  points.frustumCulled = false;
  // Пока кроны не розданы, сыпать неоткуда.
  points.visible = false;
  parent.add(points);

  return {
    time,
    texture,

    advance: (delta: number) => {
      time.value = (time.value + delta) % LEAF_PERIOD;

      // Каждый кадр, а не один раз: смена темы ведёт эмиссию крон плавным
      // переходом, и лист обязан идти с деревом в ногу.
      glow.value
        .set(crown.emissive.r, crown.emissive.g, crown.emissive.b)
        .multiplyScalar(crown.emissiveIntensity * GLOW_SHARE);
    },

    seed: (sources: THREE.Vector3[]) => {
      if (sources.length === 0) return;

      for (let index = 0; index < LEAF_COUNT; index++) {
        // По кругу, а не случайно: у случайной раздачи одни кроны остаются
        // лысыми, а другие сыплют вдвое гуще — при девяти сотнях листьев на
        // два десятка деревьев это видно.
        const crown = sources[index % sources.length]!;

        crowns[index * 3] = crown.x;
        crowns[index * 3 + 1] = crown.y;
        crowns[index * 3 + 2] = crown.z;
      }

      geometry.attributes.aCrown!.needsUpdate = true;
      points.visible = true;
    },

    useGround: (field: GroundField) => {
      /*
       * Клетки без карты (`-Infinity`) заменяются низом мира: за краем берега
       * земли нет, и лист над водой должен долетать до самой воды, а не таять
       * над пустотой.
       */
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
      // Ближайший тексель, а не сглаживание: линейная фильтрация float-текстур
      // требует расширения, а листу довольно знать землю с точностью до клетки.
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
