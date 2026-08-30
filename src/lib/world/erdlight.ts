/** Золото Эрдтри: свет, который крона отдаёт земле. */

import * as THREE from 'three';

/** Цвет — тот же, что эмиссия кроны и свечение листьев: золото у мира одно. */
export const ERDLIGHT_COLOR = 0xffa51d;

/** Источников в пуле. */
export const ERDLIGHT_COUNT = 3;

/** Досягаемость источника у обычного дерева, юнитов. */
export const ERDLIGHT_REACH = 26;

/** Сила источника у обычного дерева, кандел, при полном наборе освещения. */
export const ERDLIGHT_INTENSITY = 100;

/** Радиус кроны, которую считаем обычным деревом, юнитов. */
export const ERDLIGHT_TYPICAL_RADIUS = 1.6;

/** Во сколько раз слабее обычного светит самое мелкое дерево. */
export const ERDLIGHT_MIN_POWER = 0.3;

/** Во сколько раз ярче обычного светит самое крупное. */
export const ERDLIGHT_MAX_POWER = 4;

/** До какого расстояния до зрителя дерево светит в полную силу, юнитов. */
export const ERDLIGHT_FULL = 42;

/** За каким расстоянием дерево гаснет совсем, юнитов. */
export const ERDLIGHT_DROP = 82;

/** Скорость разгорания и угасания, долей силы в секунду. */
export const ERDLIGHT_FADE = 1.6;

/** Как часто пересматривается, каким деревьям светить, секунд. */
export const ERDLIGHT_REBIND = 0.25;

/** Дерево, которому есть чем светить. */
export type ErdlightTree = {
  /** Середина листвы в мировых координатах. */
  position: THREE.Vector3;
  /** Половина горизонтального габарита листвы, юнитов. */
  radius: number;
};

/**
 * Множитель силы источника по размеру кроны.
 * @param radius половина горизонтального габарита кроны, юнитов
 */
export function erdlightPower(radius: number): number {
  const share = (radius / ERDLIGHT_TYPICAL_RADIUS) ** 2;

  return Math.min(ERDLIGHT_MAX_POWER, Math.max(ERDLIGHT_MIN_POWER, share));
}

/**
 * Досягаемость источника по размеру кроны, юнитов.
 * @param radius половина горизонтального габарита кроны, юнитов
 */
export function erdlightReach(radius: number): number {
  return ERDLIGHT_REACH * Math.sqrt(erdlightPower(radius));
}

/**
 * Доля силы источника на этом расстоянии до зрителя.
 * @param distance расстояние от камеры до кроны, юнитов
 * @param radius половина горизонтального габарита кроны, юнитов
 * @returns от 1 вблизи до 0 за пределом видимости пятна
 */
export function erdlightFalloff(distance: number, radius: number): number {
  const spread = Math.sqrt(erdlightPower(radius));
  const full = ERDLIGHT_FULL * spread;
  const drop = ERDLIGHT_DROP * spread;

  if (distance <= full) return 1;
  if (distance >= drop) return 0;

  return 1 - (distance - full) / (drop - full);
}

/**
 * Насколько заметным будет пятно этого дерева с этого места.
 * @param radius половина горизонтального габарита кроны, юнитов
 * @param distance расстояние от камеры до кроны, юнитов
 */
export function erdlightWeight(radius: number, distance: number): number {
  return erdlightPower(radius) / (distance * distance + 1);
}

/**
 * Номера самых заметных отсюда деревьев.
 * @param trees деревья карты
 * @param eye положение камеры
 * @param count сколько номеров нужно
 * @returns номера от заметного к незаметному; короче `count`, если деревьев меньше
 */
export function brightestTrees(
  trees: ErdlightTree[],
  eye: THREE.Vector3,
  count: number,
): number[] {
  return trees
    .map((tree, index) => ({
      index,
      weight: erdlightWeight(tree.radius, tree.position.distanceTo(eye)),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count)
    .map((entry) => entry.index);
}

/**
 * Подводит долю силы к цели за этот кадр.
 * @param level текущая доля
 * @param target доля, к которой идём
 * @param delta длительность кадра, секунд
 */
export function stepLevel(level: number, target: number, delta: number): number {
  const step = ERDLIGHT_FADE * delta;
  if (target > level) return Math.min(target, level + step);

  return Math.max(target, level - step);
}

/** Один источник пула и дерево, за которым он сейчас закреплён. */
type Lamp = {
  light: THREE.PointLight;
  /** Номер дерева в списке; `-1` — источник свободен и погашен. */
  tree: number;
  /** Доля силы: 0 — погашен, 1 — полная. */
  level: number;
};

export type Erdlight = {
  /**
   * Раздаёт источникам деревья. Зовётся один раз, когда карта пришла: до этого
   * светить не из чего.
   */
  seed: (trees: ErdlightTree[]) => void;
  /** Переставляет источники по ближайшим деревьям. Зовётся раз в кадр. */
  update: (camera: THREE.Camera, delta: number) => void;
  /**
   * Сила золота по времени суток. Ведёт тот же набор, что эмиссию крон:
   * в сумерках золото ярче, днём бледнее.
   */
  setLight: (value: number) => void;
  dispose: () => void;
};

/**
 * Заводит пул золотых источников.
 * @param parent сцена мира
 */
export function createErdlight(parent: THREE.Object3D): Erdlight {
  const lamps: Lamp[] = [];
  let trees: ErdlightTree[] = [];
  let wanted: number[] = [];
  let sinceRebind = ERDLIGHT_REBIND;
  let scale = 1;

  for (let index = 0; index < ERDLIGHT_COUNT; index++) {
    const light = new THREE.PointLight(ERDLIGHT_COLOR, 0, ERDLIGHT_REACH, 2);
    light.name = `world-erdlight-${index}`;
    light.castShadow = false;
    parent.add(light);
    lamps.push({ light, tree: -1, level: 0 });
  }

  const eye = new THREE.Vector3();

  return {
    seed: (value: ErdlightTree[]) => {
      trees = value;
      sinceRebind = ERDLIGHT_REBIND;
    },

    update: (camera: THREE.Camera, delta: number) => {
      if (trees.length === 0) return;

      camera.getWorldPosition(eye);

      sinceRebind += delta;
      if (sinceRebind >= ERDLIGHT_REBIND) {
        sinceRebind = 0;
        wanted = brightestTrees(trees, eye, lamps.length);
      }

      const taken = new Set(lamps.map((lamp) => lamp.tree));

      for (const lamp of lamps) {
        const keeps = lamp.tree >= 0 && wanted.includes(lamp.tree);

        if (!keeps && lamp.level <= 0) {
          const free = wanted.find((index) => !taken.has(index));

          taken.delete(lamp.tree);
          lamp.tree = free ?? -1;
          taken.add(lamp.tree);
        }

        const tree = trees[lamp.tree];

        if (tree) {
          lamp.light.position.copy(tree.position);
          lamp.light.distance = erdlightReach(tree.radius);
        }

        const target =
          tree && wanted.includes(lamp.tree)
            ? erdlightFalloff(eye.distanceTo(tree.position), tree.radius)
            : 0;

        lamp.level = stepLevel(lamp.level, target, delta);
        lamp.light.intensity = tree
          ? ERDLIGHT_INTENSITY * erdlightPower(tree.radius) * lamp.level * scale
          : 0;
      }
    },

    setLight: (value: number) => {
      scale = value;
    },

    dispose: () => {
      for (const lamp of lamps) {
        lamp.light.dispose();
        lamp.light.removeFromParent();
      }
      lamps.length = 0;
      trees = [];
    },
  };
}
