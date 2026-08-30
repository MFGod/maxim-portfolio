/** Фигуры: первый скиннинг в этом мире. */

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
  battleBolts,
  battleFighters,
  battleRadius,
  battleStep,
  type Fighter,
  type Pose,
  type WorldBattle,
} from './battle';
import { walkerStep } from './patrol';
import { routinePose } from './routine';
import { createSpells } from './spells';

/** Дальше этого расстояния до камеры анимация не считается. */
export const ANIMATION_RANGE = 6;

/** Дальше этого расстояния фигура не рисуется вовсе. */
export const DRAW_RANGE = 8;

/** Во сколько своих ростов фигура остаётся видна. */
const RANGE_IN_HEIGHTS = 70;

/** Дальность видимости фигуры по её росту. */
const drawRange = (height: number): number =>
  Math.max(DRAW_RANGE, height * RANGE_IN_HEIGHTS);

/** За сколько боец меняет позу, секунды. */
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
  /** Откуда брать клипы: у каждой модели свой набор. */
  gltf: GLTF;
  /** Габаритная сфера в мировых координатах: по ней решается, крутить ли кости. */
  bounds: THREE.Sphere;
  /** Что играется сейчас. Меняется — значит нужен переход. */
  pose: Pose | null;
  action: THREE.AnimationAction | null;
  /** Замерла в первой позе: повторно ставить её незачем. */
  resting: boolean;
};

/** Всё, что нужно, чтобы сменить позу: миксер, набор клипов и то, что играется. */
type Posed = {
  mixer: THREE.AnimationMixer;
  gltf: GLTF;
  pose: Pose | null;
  action: THREE.AnimationAction | null;
};

/** Клип по имени, а если модель его не знает — стойка. */
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
  const spells = createSpells(object);
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
    spells.update([]);
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
      root.traverse((child) => {
        child.castShadow = false;
      });

      const item: Placed = {
        figure,
        root,
        mixer: new THREE.AnimationMixer(root),
        gltf,
        bounds: new THREE.Sphere(
          new THREE.Vector3(
            figure.at[0],
            figure.at[1] + figure.height / 2,
            figure.at[2],
          ),
          figure.height,
        ),
        pose: null,
        action: null,
        resting: false,
      };

      applyPose(item, routinePose(figure, marching));

      object.add(root);
      placed.push(item);
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

    advance(0);
  }

  /** Ставит новую позу бойцу или одиночке. */
  function applyPose(item: Posed, pose: Pose) {
    const held = item.pose;
    if (
      held &&
      held.clip === pose.clip &&
      held.loop === pose.loop &&
      held.reverse === pose.reverse
    ) {
      return;
    }

    const clip = clipFor(item.gltf, pose.clip);
    if (!clip) return;

    const next = item.mixer.clipAction(clip);
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

    const previous = item.action;
    if (previous && previous !== next) previous.crossFadeTo(next, POSE_FADE, false);

    item.pose = pose;
    item.action = next;
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

    advanceBattles();
  }

  /** Двигает стычки: место, разворот и поза каждого бойца, снаряды магов. */
  function advanceBattles() {
    for (const warrior of warriors) {
      const step = battleStep(warrior.battle, warrior.fighter, marching);
      warrior.root.position.set(step.x, step.y, step.z);
      warrior.root.rotation.y = step.heading;
      applyPose(warrior, step.pose);
    }

    const bolts = battles.flatMap((battle) => battleBolts(battle, marching));
    spells.update(bolts);
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

      applyPose(item, routinePose(item.figure, marching));

      item.mixer.update(delta);
    }

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
      object.updateMatrixWorld(true);

      const hit = raycaster.intersectObject(object, true)[0];
      if (!hit) return null;

      let node: THREE.Object3D | null = hit.object;
      while (node && node.parent !== object) node = node.parent;
      return node?.name ?? null;
    },
    dispose: () => {
      clear();
      clearWalkers();
      clearWarriors();
      spells.dispose();
      object.removeFromParent();

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
