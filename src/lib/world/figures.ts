/**
 * Фигуры: первый скиннинг в этом мире.
 *
 * Одна модель — один загруженный glTF; каждая фигура на карте — его клон через
 * `SkeletonUtils.clone` (обычный `Object3D.clone` рвёт связь меша со скелетом,
 * и клон анимируется костями оригинала). Геометрию и материалы клоны делят,
 * поэтому цена фигуры — draw call и пересчёт 41 кости, а не копия меша.
 *
 * Скиннинг не инстансируется: `InstancedMesh` умеет только статичную геометрию.
 * Поэтому фигуры дороги по сравнению со всем остальным в этой сцене, где 8968
 * объектов живут в 106 вызовах отрисовки. Отсюда два ограничителя:
 *
 * 1. `ANIMATION_RANGE` — дальше этого расстояния миксер не крутится. Фигура
 *    высотой 0,08 юнита с шести юнитов занимает меньше десятка пикселей, и
 *    разницы между шагом и стойкой там нет.
 * 2. Пирамида видимости — за кадром миксер тоже стоит. Отрисовку три отсекает
 *    сама, но пересчёт костей идёт до неё и от отсечения не зависит.
 *
 * Высота задаётся в юнитах мира, а не множителем масштаба: у карты нет честного
 * метра (дерево 0,28 юнита, надгробие 0,3, горшок 0,0765), и множитель к
 * авторской модели ни о чём не говорил бы.
 */

import * as THREE from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

import {
  FIGURE_MODELS,
  type FigureModel,
  type WorldFigure,
} from '@/data/world-figures';
import type { WorldPatrol } from '@/data/world-patrols';

import { WORLD_ASSETS } from './assets';
import {
  battleFighters,
  battleRadius,
  battleStep,
  type Fighter,
  type Pose,
  type WorldBattle,
} from './battle';
import { walkerStep } from './patrol';

/** Дальше этого расстояния до камеры анимация не считается. */
export const ANIMATION_RANGE = 6;

/**
 * Дальше этого расстояния фигура не рисуется вовсе.
 *
 * Фигура ростом 0,117 юнита с восьми юнитов занимает меньше десяти пикселей —
 * различить в ней человека нельзя, а стоит она дорого: у скелета KayKit десять
 * мешей, и каждый идёт своим вызовом отрисовки. Замер на сотне фигур с общего
 * плана: 734 вызова без них, 1896 со всеми, 800 с этим отсечением.
 */
export const DRAW_RANGE = 8;

/**
 * Во сколько своих ростов фигура остаётся видна.
 *
 * Восемь юнитов — предел для человека ростом 0,117: дальше он меньше десяти
 * пикселей. Дракону размахом в полюнита это правило не годится — его силуэт
 * читается через полкарты, и гасить его на восьми юнитах значит потерять
 * единственное, ради чего он там летает.
 */
const RANGE_IN_HEIGHTS = 70;

/** Дальность видимости фигуры по её росту. */
const drawRange = (height: number): number =>
  Math.max(DRAW_RANGE, height * RANGE_IN_HEIGHTS);

/**
 * За сколько боец меняет позу, секунды.
 *
 * Две десятых: щит успевает опуститься в выпад, но удар не размазывается. Без
 * перехода вовсе размен читается как перемотка — поза скачет через кадр.
 */
const POSE_FADE = 0.2;

/** Шаг прохода луча по земле и предел его дальности, в юнитах мира. */
const TRACE_STEP = 0.05;
const TRACE_REACH = 80;

/** Сколько раз делить отрезок пополам, уточняя место касания. */
const TRACE_REFINE = 12;

export type Figures = {
  /** Узел со всеми фигурами. Добавляется в сцену снаружи. */
  object: THREE.Group;
  /** Поставить ровно этот набор, сняв прежний. */
  show: (list: readonly WorldFigure[]) => Promise<void>;
  /** Пустить ровно эти дозоры, сняв прежние. */
  walk: (list: readonly WorldPatrol[]) => Promise<void>;
  /** Свести ровно эти стычки, сняв прежние. */
  fight: (list: readonly WorldBattle[]) => Promise<void>;
  update: (delta: number, camera: THREE.Camera) => void;
  /** Сколько фигур стоит сейчас. Для инструмента расстановки и тестов. */
  count: () => number;
  /** Что стоит сейчас: и утверждённое, и черновое. */
  placed: () => readonly WorldFigure[];
  /** Дозоры, которые сейчас ходят. Нужны инструменту проверки маршрутов. */
  patrols: () => readonly WorldPatrol[];
  /** Стычки, которые сейчас идут. */
  battles: () => readonly WorldBattle[];
  /** Имя фигуры под лучом или `null`. Для выбора мышью в инструменте. */
  pick: (raycaster: THREE.Raycaster) => string | null;
  dispose: () => void;
};

/**
 * Где луч встречает землю.
 *
 * Не рейкастом по геометрии: один такой по этой карте стоит около 110 мс
 * (замер в `map-shell.ts`). Идём вдоль луча шагами и спрашиваем высоту у
 * той же сетки, что держит камеру, — это поиск по таблице. Место касания
 * уточняем делением отрезка пополам: шаг в 5 сантиметров сам по себе оставил
 * бы фигуру висеть или тонуть на неровном склоне.
 *
 * @param heightAt высота земли в точке или `null` за краем карты
 */
export function traceGround(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  heightAt: (x: number, z: number) => number | null,
): THREE.Vector3 | null {
  const point = new THREE.Vector3();
  const under = (distance: number): boolean | null => {
    point.copy(origin).addScaledVector(direction, distance);
    const ground = heightAt(point.x, point.z);
    return ground === null ? null : point.y <= ground;
  };

  // Луч из-под земли — не промах, а несостоятельный вопрос: сверху ставим.
  if (under(0) !== false) return null;

  let previous = 0;
  for (let distance = TRACE_STEP; distance <= TRACE_REACH; distance += TRACE_STEP) {
    const hit = under(distance);
    if (hit === null) {
      previous = distance;
      continue;
    }
    if (!hit) {
      previous = distance;
      continue;
    }

    let low = previous;
    let high = distance;
    for (let i = 0; i < TRACE_REFINE; i++) {
      const middle = (low + high) / 2;
      if (under(middle)) high = middle;
      else low = middle;
    }

    point.copy(origin).addScaledVector(direction, high);
    const ground = heightAt(point.x, point.z);
    if (ground === null) return null;

    point.y = ground;
    return point.clone();
  }

  return null;
}

export type FiguresOptions = {
  loader: GLTFLoader;
  reducedMotion?: () => boolean;
};

/** Идущий в составе дозора. */
type Walker = {
  patrol: WorldPatrol;
  index: number;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  /** Сфера вокруг всего маршрута: по ней решается, крутить ли кости. */
  bounds: THREE.Sphere;
  resting: boolean;
};

/** Боец стычки: клон, его миксер и поза, которую он сейчас держит. */
type Warrior = {
  battle: WorldBattle;
  fighter: Fighter;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  /** Откуда брать клипы: у каждой модели свой набор. */
  gltf: GLTF;
  /** Сфера вокруг всей площадки: по ней решается, крутить ли кости. */
  bounds: THREE.Sphere;
  /** Что играется сейчас. Меняется — значит нужен переход. */
  pose: Pose | null;
  action: THREE.AnimationAction | null;
  resting: boolean;
};

type Placed = {
  figure: WorldFigure;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  /** Габаритная сфера в мировых координатах: по ней решается, крутить ли кости. */
  bounds: THREE.Sphere;
  /** Замерла в первой позе: повторно ставить её незачем. */
  resting: boolean;
};

/**
 * Клип по имени, а если модель его не знает — стойка.
 *
 * Наборы клипов у нежити и у живых разные (`Taunt` есть только у скелетов,
 * `Cheer` — только у людей). Без замены модель осталась бы в T-позе.
 */
function clipFor(gltf: GLTF, name: string): THREE.AnimationClip | null {
  return (
    THREE.AnimationClip.findByName(gltf.animations, name) ??
    THREE.AnimationClip.findByName(gltf.animations, 'Idle') ??
    null
  );
}

/** Высота модели в её собственных единицах. Нужна, чтобы попасть в заданную. */
function modelHeight(object: THREE.Object3D): number {
  const box = new THREE.Box3().setFromObject(object);
  return Math.max(box.max.y - box.min.y, 1e-6);
}

export function createFigures({ loader, reducedMotion }: FiguresOptions): Figures {
  const object = new THREE.Group();
  object.name = '__figures';

  /** Загруженные модели: один запрос на модель, сколько бы фигур её ни просило. */
  const models = new Map<FigureModel, Promise<GLTF>>();
  const placed: Placed[] = [];
  const walkers: Walker[] = [];
  const warriors: Warrior[] = [];
  let battles: readonly WorldBattle[] = [];
  /** Общее время хода дозоров. Растёт только когда мир не в покое. */
  let marching = 0;

  function load(model: FigureModel): Promise<GLTF> {
    const known = models.get(model);
    if (known) return known;

    const request = loader.loadAsync(`${WORLD_ASSETS}/${FIGURE_MODELS[model]}`);
    models.set(model, request);
    return request;
  }

  function clear() {
    for (const item of placed) {
      // Миксер держит ссылки на корень и клипы: без `uncacheRoot` снятая
      // фигура остаётся в его внутренней таблице до конца жизни сцены.
      item.mixer.stopAllAction();
      item.mixer.uncacheRoot(item.root);
      object.remove(item.root);
    }
    placed.length = 0;
  }

  function clearWarriors() {
    for (const warrior of warriors) {
      warrior.mixer.stopAllAction();
      warrior.mixer.uncacheRoot(warrior.root);
      object.remove(warrior.root);
    }
    warriors.length = 0;
    battles = [];
  }

  function clearWalkers() {
    for (const walker of walkers) {
      walker.mixer.stopAllAction();
      walker.mixer.uncacheRoot(walker.root);
      object.remove(walker.root);
    }
    walkers.length = 0;
  }

  /**
   * Номер последнего показа. Расстановка перестраивает набор на каждое движение
   * мышью, а показ асинхронный: без этого счётчика два перекрывшихся вызова
   * снимали набор друг у друга и достраивали каждый свою половину.
   */
  let generation = 0;

  async function show(list: readonly WorldFigure[]) {
    const mine = ++generation;

    // Модели ждём до снятия прежнего набора: иначе на время загрузки в мире
    // не остаётся ни одной фигуры, и подбор мигает на каждое касание.
    const loaded = new Map<FigureModel, GLTF>();
    for (const model of new Set(list.map((figure) => figure.model))) {
      loaded.set(model, await load(model));
    }
    if (mine !== generation) return;

    clear();

    for (const figure of list) {
      const gltf = loaded.get(figure.model)!;
      const root = cloneSkinned(gltf.scene);

      const scale = figure.height / modelHeight(gltf.scene);
      root.scale.setScalar(scale);
      root.position.set(figure.at[0], figure.at[1], figure.at[2]);
      root.rotation.y = figure.turn;
      root.name = figure.id;
      /*
       * Тени фигуры не отбрасывают. Тень скелета в этом масштабе — три пикселя
       * под ногами, а теневой проход рисует его вторым заходом: замер на сотне
       * дал 3696 вызовов отрисовки против 1896 без теней.
       */
      root.traverse((child) => {
        child.castShadow = false;
      });

      const mixer = new THREE.AnimationMixer(root);
      const clip = clipFor(gltf, figure.clip);
      if (clip) mixer.clipAction(clip).play();

      object.add(root);
      placed.push({
        figure,
        root,
        mixer,
        bounds: new THREE.Sphere(
          new THREE.Vector3(
            figure.at[0],
            figure.at[1] + figure.height / 2,
            figure.at[2],
          ),
          figure.height,
        ),
        resting: false,
      });
    }
  }

  /** Свой счётчик поколений: дозоры и одиночки перестраиваются порознь. */
  let marchGeneration = 0;

  async function walk(list: readonly WorldPatrol[]) {
    const mine = ++marchGeneration;

    const loaded = new Map<FigureModel, GLTF>();
    for (const model of new Set(list.map((patrol) => patrol.model))) {
      loaded.set(model, await load(model));
    }
    if (mine !== marchGeneration) return;

    clearWalkers();

    for (const patrol of list) {
      const gltf = loaded.get(patrol.model)!;
      const scale = patrol.height / modelHeight(gltf.scene);
      const clip = clipFor(gltf, patrol.clip);

      for (let index = 0; index < patrol.walkers; index++) {
        const root = cloneSkinned(gltf.scene);
        root.scale.setScalar(scale);
        root.name = `${patrol.id}-${index + 1}`;
        root.traverse((child) => {
          child.castShadow = false;
        });

        const mixer = new THREE.AnimationMixer(root);
        if (clip) {
          const action = mixer.clipAction(clip);
          // Сдвиг фазы: иначе тройка шагает с точностью до кадра, как заводная.
          action.time = (index * clip.duration) / patrol.walkers;
          action.play();
        }

        object.add(root);
        walkers.push({
          patrol,
          index,
          root,
          mixer,
          bounds: new THREE.Sphere(new THREE.Vector3(), patrol.height),
          resting: false,
        });
      }
    }

    // Сразу расставить по местам: до первого кадра они иначе стоят в начале
    // координат — то есть в углу карты под водой.
    advance(0);
  }

  /**
   * Ставит бойцу новую позу.
   *
   * Переход, а не подмена: щит опускается в выпад за две десятых секунды, и без
   * этого размен выглядит перемоткой. Одноразовый клип (падение) застывает в
   * последнем кадре, а `reverse` пускает его назад — так падение становится
   * подъёмом, и живому не нужен клип вставания, которого у него нет.
   */
  function applyPose(warrior: Warrior, pose: Pose) {
    const held = warrior.pose;
    if (
      held &&
      held.clip === pose.clip &&
      held.loop === pose.loop &&
      held.reverse === pose.reverse
    ) {
      return;
    }

    const clip = clipFor(warrior.gltf, pose.clip);
    if (!clip) return;

    const next = warrior.mixer.clipAction(clip);
    next.reset();
    next.setEffectiveWeight(1);

    if (pose.loop) {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    } else {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    }

    if (pose.reverse) {
      next.timeScale = -1;
      next.time = clip.duration;
    } else {
      next.timeScale = 1;
    }

    next.play();

    const previous = warrior.action;
    if (previous && previous !== next) previous.crossFadeTo(next, POSE_FADE, false);

    warrior.pose = pose;
    warrior.action = next;
  }

  /** Свой счётчик поколений: стычки перестраиваются отдельно от прочих. */
  let fightGeneration = 0;

  async function fight(list: readonly WorldBattle[]) {
    const mine = ++fightGeneration;

    const wanted = new Set<FigureModel>();
    for (const battle of list) {
      for (const fighter of battleFighters(battle)) wanted.add(fighter.model);
    }

    const loaded = new Map<FigureModel, GLTF>();
    for (const model of wanted) loaded.set(model, await load(model));
    if (mine !== fightGeneration) return;

    clearWarriors();
    battles = list;

    for (const battle of list) {
      // Сфера одна на всю площадку: бойцы ходят внутри неё, а решение
      // «крутить ли кости» принимается на всю стычку разом.
      const reach = battleRadius(battle);

      for (const fighter of battleFighters(battle)) {
        const gltf = loaded.get(fighter.model)!;
        const root = cloneSkinned(gltf.scene);
        root.scale.setScalar(fighter.height / modelHeight(gltf.scene));
        root.name = fighter.id;
        root.traverse((child) => {
          child.castShadow = false;
        });

        object.add(root);
        warriors.push({
          battle,
          fighter,
          root,
          mixer: new THREE.AnimationMixer(root),
          gltf,
          bounds: new THREE.Sphere(
            new THREE.Vector3(
              battle.at[0],
              battle.at[1] + fighter.height,
              battle.at[2],
            ),
            reach + fighter.height,
          ),
          pose: null,
          action: null,
          resting: false,
        });
      }
    }

    // Сразу расставить: до первого кадра бойцы иначе стоят в начале координат.
    advanceBattles();
  }

  /** Двигает стычки: место, разворот и поза каждого бойца. */
  function advanceBattles() {
    for (const warrior of warriors) {
      const step = battleStep(warrior.battle, warrior.fighter, marching);
      warrior.root.position.set(step.x, step.y, step.z);
      warrior.root.rotation.y = step.heading;
      applyPose(warrior, step.pose);
    }
  }

  /** Двигает дозоры. Вынесено из `update`: ход нужен и при первой расстановке. */
  function advance(delta: number) {
    marching += delta;
    advanceBattles();

    for (const walker of walkers) {
      const { patrol, index } = walker;
      const step = walkerStep(
        patrol.route,
        marching,
        index,
        patrol.speed,
        patrol.spacing,
        patrol.walkers,
      );

      walker.root.position.set(step.x, step.y, step.z);
      walker.root.rotation.y = step.heading;
      walker.bounds.center.set(step.x, step.y + patrol.height / 2, step.z);
    }
  }

  const projection = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const eye = new THREE.Vector3();

  function update(delta: number, camera: THREE.Camera) {
    if (placed.length === 0 && walkers.length === 0 && warriors.length === 0) return;

    const calm = reducedMotion?.() ?? false;

    camera.getWorldPosition(eye);
    projection.multiplyMatrices(
      (camera as THREE.PerspectiveCamera).projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projection);

    for (const item of placed) {
      // Замереть надо в позе, а не там, где застало: остановленный на середине
      // шага скелет читается как сломанный, а не как неподвижный.
      if (calm) {
        item.root.visible =
          item.bounds.center.distanceTo(eye) < drawRange(item.figure.height);
        if (!item.resting) {
          item.mixer.setTime(0);
          item.resting = true;
        }
        continue;
      }
      item.resting = false;

      const away = item.bounds.center.distanceTo(eye);
      item.root.visible = away < drawRange(item.figure.height);
      if (away > ANIMATION_RANGE) continue;
      if (!frustum.intersectsSphere(item.bounds)) continue;

      item.mixer.update(delta);
    }

    // Дозоры идут всегда, пока мир не в покое: замри они за спиной у камеры,
    // обернувшийся увидел бы их ровно там, где оставил час назад.
    if (!calm) advance(delta);

    for (const walker of walkers) {
      if (calm) {
        if (!walker.resting) {
          walker.mixer.setTime(0);
          walker.resting = true;
        }
        continue;
      }
      walker.resting = false;

      const away = walker.bounds.center.distanceTo(eye);
      walker.root.visible = away < drawRange(walker.patrol.height);
      if (away > ANIMATION_RANGE) continue;
      if (!frustum.intersectsSphere(walker.bounds)) continue;

      walker.mixer.update(delta);
    }

    for (const warrior of warriors) {
      /*
       * В покое стычка замирает в позе, а не посреди выпада: остановленный на
       * середине шага скелет читается как сломанный. Место при этом остаётся
       * тем, где его застало, — двигать бойцов в покое нельзя, это движение.
       */
      if (calm) {
        if (!warrior.resting) {
          warrior.mixer.setTime(0);
          warrior.resting = true;
        }
        continue;
      }
      warrior.resting = false;

      const away = warrior.bounds.center.distanceTo(eye);
      warrior.root.visible = away < drawRange(warrior.fighter.height);
      if (away > ANIMATION_RANGE) continue;
      if (!frustum.intersectsSphere(warrior.bounds)) continue;

      warrior.mixer.update(delta);
    }
  }

  return {
    object,
    show,
    walk,
    fight,
    update,
    count: () => placed.length,
    placed: () => placed.map((item) => item.figure),
    patrols: () => [...new Set(walkers.map((walker) => walker.patrol))],
    battles: () => battles,
    pick: (raycaster: THREE.Raycaster) => {
      // Мировые матрицы фигур обновляет отрисовка. Пока мир на паузе или
      // вкладка скрыта, кадров нет — и луч искал бы фигуры там, где их уже
      // нет. Десяток узлов на фигуру: пересчитать дешевле, чем промахнуться.
      object.updateMatrixWorld(true);

      const hit = raycaster.intersectObject(object, true)[0];
      if (!hit) return null;

      // Луч попадает в часть тела; имя фигуры носит только её корень.
      let node: THREE.Object3D | null = hit.object;
      while (node && node.parent !== object) node = node.parent;
      return node?.name ?? null;
    },
    dispose: () => {
      clear();
      clearWalkers();
      clearWarriors();
      object.removeFromParent();

      // Клоны делят геометрию и материалы с загруженной моделью, и общий обход
      // сцены до них уже не дойдёт — снимаем сами, по одному разу на модель.
      for (const request of models.values()) {
        void request.then((gltf) => {
          gltf.scene.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            const material = mesh.material as
              THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(material)) for (const one of material) one.dispose();
            else material?.dispose();
          });
        });
      }
      models.clear();
    },
  };
}
