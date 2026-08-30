/** Стычка на поляне: кто где стоит и что делает в этот миг. */

import type { FigureClip, FigureModel } from '@/data/world-figures';

/** Сторона стычки: кто в строю. Порядок задаёт места в шеренге. */
export type BattleSide = {
  /** По одной модели на бойца. Маги отходят во второй ряд сами. */
  models: readonly FigureModel[];
  /** Рост бойцов в юнитах мира. У местных жителей карты — 0,117. */
  height: number;
};

export type WorldBattle = {
  id: string;
  /** Середина площадки: X, Y, Z. Y — высота земли в этой точке. */
  at: readonly [number, number, number];
  /** Наклон площадки: прирост высоты на юнит по X и по Z. */
  slope: readonly [number, number];
  /** Куда развёрнут фронт: направление от нежити к живым, радианы. */
  facing: number;
  /** Сдвиг фазы, секунды. Соседние стычки не должны идти в ногу. */
  offset: number;
  /** Нежить. */
  undead: BattleSide;
  /** Живые. */
  living: BattleSide;
};

/** Сколько длится каждая часть круга, секунды. */
export const PHASES = {
  /** Подъём павших и стойка перед сходом. */
  rise: 6,
  /** Сближение шагом. */
  approach: 7,
  /** Размен ударами. */
  melee: 21,
  /** Падение проигравшей стороны. */
  fall: 6,
  /** Отход победителей на свою линию. */
  retreat: 7,
} as const;

/** Весь круг боя, секунды. */
export const PERIOD =
  PHASES.rise + PHASES.approach + PHASES.melee + PHASES.fall + PHASES.retreat;

/** Промежуток между бойцами в шеренге, юниты. */
const FILE_STEP = 0.22;

/** Половина зазора между сошедшимися противниками, юниты. */
const CLASH_HALF = 0.055;

/** На сколько маг стоит позади своей шеренги, юниты. */
const MAGE_BACK = 0.18;

/** Откуда сторона выходит: на столько дальше линии схода, юниты. */
const APPROACH_RUN = 0.62;

/** Глубина выпада при ударе, юниты. */
const LUNGE = 0.035;

/** Круг размена: за него бьют оба, по разу. */
const TRADE = 2.4;

/** Сколько длится сам удар внутри круга размена, секунды. */
const STRIKE = 0.6;

/** Через сколько после соседа падает следующий: строй не валится разом. */
const FALL_STAGGER = 0.45;

/** Сколько длится клип падения, прежде чем тело переходит в лежание. */
const FALL_CLIP = 1.4;

/** Через сколько после начала фазы падения валится этот боец. */
function fallDelay(fighter: { file: number; files: number; mage: boolean }): number {
  return (fighter.mage ? fighter.files : fighter.file) * FALL_STAGGER;
}

/** Период между выстрелами мага, секунды. */
export const CAST = 3.2;

/** Сколько снаряд летит от руки до цели, секунды. */
export const BOLT_FLIGHT = 0.55;

/** Высота руки мага и груди цели, в долях роста. Подобрано по клипу каста. */
const HAND_HEIGHT = 0.62;
const CHEST_HEIGHT = 0.55;

/** Подъём дуги снаряда над прямой, юниты. */
const BOLT_ARC = 0.02;

/** Поза бойца: клип и то, как его крутить. */
export type Pose = {
  clip: FigureClip;
  /** Крутить по кругу. Иначе клип играется раз и застывает в конце. */
  loop: boolean;
  /** Пустить назад: так падение становится подъёмом. */
  reverse?: boolean;
};

/** Где боец и что он делает. */
export type FighterStep = {
  id: string;
  model: FigureModel;
  height: number;
  x: number;
  y: number;
  z: number;
  /** Курс: `Math.atan2(dx, dz)` направления взгляда. */
  heading: number;
  pose: Pose;
};

/** Боец в строю: сторона, место в шеренге, роль. */
export type Fighter = {
  id: string;
  model: FigureModel;
  height: number;
  /** Нежить идёт со стороны -1, живые со стороны +1. */
  side: -1 | 1;
  /** Место в шеренге, от 0. */
  file: number;
  /** Сколько всего в шеренге: нужно, чтобы центрировать строй. */
  files: number;
  /** Маг бьёт с места и стоит вторым рядом. */
  mage: boolean;
};

/** Маг — по модели, а не по флагу в данных: моделей всего одиннадцать. */
const isMage = (model: FigureModel): boolean => model.endsWith('mage');

/** Состав стычки. Порядок устойчив: по нему бойцов сопоставляют с клонами. */
export function battleFighters(battle: WorldBattle): Fighter[] {
  const build = (side: BattleSide, at: -1 | 1, mark: string): Fighter[] =>
    side.models.map((model, file) => ({
      id: `${battle.id}-${mark}${file + 1}`,
      model,
      height: side.height,
      side: at,
      file,
      files: side.models.length,
      mage: isMage(model),
    }));

  return [...build(battle.undead, -1, 'н'), ...build(battle.living, 1, 'ж')];
}

/** Круг боя и время внутри него. */
export function battleCycle(
  seconds: number,
  offset: number,
): { cycle: number; at: number } {
  const shifted = seconds + offset;
  const cycle = Math.floor(shifted / PERIOD);
  return { cycle, at: shifted - cycle * PERIOD };
}

/** Какая сторона падает в этом круге: они чередуются. */
export function losingSide(cycle: number): -1 | 1 {
  return ((cycle % 2) + 2) % 2 === 0 ? -1 : 1;
}

/** Точка в мире по смещению вдоль фронта и поперёк него. */
function place(
  battle: WorldBattle,
  along: number,
  across: number,
): { x: number; y: number; z: number } {
  const forward = { x: Math.sin(battle.facing), z: Math.cos(battle.facing) };
  const side = { x: forward.z, z: -forward.x };

  const dx = forward.x * along + side.x * across;
  const dz = forward.z * along + side.z * across;

  return {
    x: battle.at[0] + dx,
    y: battle.at[1] + battle.slope[0] * dx + battle.slope[1] * dz,
    z: battle.at[2] + dz,
  };
}

/** Мягкий разгон и торможение: шаг без рывка на концах. */
const ease = (part: number): number => {
  const clamped = Math.min(Math.max(part, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
};

/** Место бойца в шеренге: смещение поперёк фронта. */
const fileOffset = (fighter: Fighter): number =>
  (fighter.file - (fighter.files - 1) / 2) * FILE_STEP;

/** Линия схода: где боец стоит, когда строй сошёлся. */
const clashLine = (fighter: Fighter): number =>
  fighter.side * (CLASH_HALF + (fighter.mage ? MAGE_BACK : 0));

/** Линия выхода: откуда сторона идёт в сближение. */
const startLine = (fighter: Fighter): number =>
  clashLine(fighter) + fighter.side * APPROACH_RUN;

/** Бьёт ли боец прямо сейчас и насколько глубоко ушёл в выпад. */
function strikeDepth(fighter: Fighter, sinceClash: number): number {
  if (fighter.mage) return 0;

  const own = fighter.side === -1 ? 0 : TRADE / 2;
  const stagger = (fighter.file % 3) * (TRADE / 6);
  const phase = (((sinceClash - own - stagger) % TRADE) + TRADE) % TRADE;
  if (phase > STRIKE) return 0;

  const part = phase / STRIKE;
  return part < 0.5 ? ease(part * 2) : ease((1 - part) * 2);
}

/** Кто напротив: тот, чьё падение победитель видит, а проигравший получает. */
function foeOf(battle: WorldBattle, fighter: Fighter): Fighter {
  const models = fighter.side === -1 ? battle.living.models : battle.undead.models;
  const mark = fighter.side === -1 ? 'ж' : 'н';

  const wanted = fighter.mage ? models.findIndex(isMage) : fighter.file;
  const file = wanted >= 0 ? Math.min(wanted, models.length - 1) : models.length - 1;
  const model = models[file]!;

  return {
    id: `${battle.id}-${mark}${file + 1}`,
    model,
    height: fighter.side === -1 ? battle.living.height : battle.undead.height,
    side: -fighter.side as -1 | 1,
    file,
    files: models.length,
    mage: isMage(model),
  };
}

/** Поза стоящего в строю до схода: нежить просыпается, живые ждут. */
function readyPose(fighter: Fighter, risen: boolean, at: number): Pose {
  const undead = fighter.side === -1;

  if (risen) {
    if (at < PHASES.rise * 0.6) {
      return undead
        ? { clip: 'Skeletons_Awaken_Standing', loop: false }
        : { clip: 'Death_A_Pose', loop: false, reverse: true };
    }
    return { clip: 'Idle', loop: true };
  }

  if (undead && at < PHASES.rise * 0.6) {
    return { clip: 'Taunt', loop: true };
  }
  return { clip: 'Idle', loop: true };
}

/** Сборка шага: место, курс и поза одного бойца. */
function stepOf(
  fighter: Fighter,
  spot: { x: number; y: number; z: number },
  heading: number,
  pose: Pose,
): FighterStep {
  return {
    id: fighter.id,
    model: fighter.model,
    height: fighter.height,
    x: spot.x,
    y: spot.y,
    z: spot.z,
    heading,
    pose,
  };
}

/**
 * Где боец и что он делает в этот миг.
 * @param seconds общее время мира; сдвиг фазы стычки прибавляется внутри
 */
export function battleStep(
  battle: WorldBattle,
  fighter: Fighter,
  seconds: number,
): FighterStep {
  const { cycle, at } = battleCycle(seconds, battle.offset);

  const fellBefore = losingSide(cycle - 1) === fighter.side;
  const falls = losingSide(cycle) === fighter.side;

  const clash = clashLine(fighter);
  const start = startLine(fighter);
  const across = fileOffset(fighter);
  const toEnemy = -fighter.side;
  const facingEnemy = Math.atan2(
    Math.sin(battle.facing) * toEnemy,
    Math.cos(battle.facing) * toEnemy,
  );

  const rise = PHASES.rise;
  const approach = rise + PHASES.approach;
  const melee = approach + PHASES.melee;
  const fall = melee + PHASES.fall;

  if (at < rise) {
    const along = fellBefore ? clash : start;
    const spot = place(battle, along, across);
    return stepOf(fighter, spot, facingEnemy, readyPose(fighter, fellBefore, at));
  }

  if (at < approach) {
    if (fellBefore) {
      const spot = place(battle, clash, across);
      return stepOf(fighter, spot, facingEnemy, { clip: 'Blocking', loop: true });
    }

    const part = (at - rise) / PHASES.approach;
    const spot = place(battle, start + (clash - start) * part, across);
    return stepOf(fighter, spot, facingEnemy, { clip: 'Walking_A', loop: true });
  }

  if (at < melee) {
    const depth = strikeDepth(fighter, at - approach);
    const spot = place(battle, clash + toEnemy * LUNGE * depth, across);
    const pose: Pose = fighter.mage
      ? { clip: 'Spellcasting', loop: true }
      : depth > 0
        ? { clip: 'Interact', loop: true }
        : { clip: 'Blocking', loop: true };

    return stepOf(fighter, spot, facingEnemy, pose);
  }

  if (at < fall) {
    const spot = place(battle, clash, across);
    const wait = at - melee;

    if (!falls) {
      const foeAt = fallDelay(foeOf(battle, fighter));

      if (wait >= foeAt) {
        const undead = fighter.side === -1;
        return stepOf(fighter, spot, facingEnemy, {
          clip: undead ? 'Taunt' : 'Cheer',
          loop: true,
        });
      }

      if (fighter.mage) {
        return stepOf(fighter, spot, facingEnemy, {
          clip: 'Spellcasting',
          loop: true,
        });
      }

      const left = foeAt - wait;
      const depth = left > STRIKE ? 0 : ease(1 - left / STRIKE);

      return stepOf(
        fighter,
        place(battle, clash + toEnemy * LUNGE * depth, across),
        facingEnemy,
        depth > 0 ? { clip: 'Interact', loop: true } : { clip: 'Blocking', loop: true },
      );
    }

    const since = wait - fallDelay(fighter);
    if (since < 0) {
      return stepOf(fighter, spot, facingEnemy, { clip: 'Blocking', loop: true });
    }

    return stepOf(
      fighter,
      spot,
      facingEnemy,
      since < FALL_CLIP
        ? { clip: 'Death_A_Pose', loop: false }
        : { clip: 'Lie_Idle', loop: true },
    );
  }

  const spot = place(battle, clash, across);
  if (falls) {
    return stepOf(fighter, spot, facingEnemy, { clip: 'Lie_Idle', loop: true });
  }

  const part = Math.min((at - fall) / PHASES.retreat, 1);
  const back = place(battle, clash + (start - clash) * part, across);
  return stepOf(
    fighter,
    back,
    part < 0.95 ? facingEnemy + Math.PI : facingEnemy,
    part < 0.98 ? { clip: 'Walking_A', loop: true } : { clip: 'Idle', loop: true },
  );
}

/** Снаряд мага в полёте. */
export type BattleBolt = {
  /** Кто выпустил и какой это выстрел по счёту. */
  id: string;
  x: number;
  y: number;
  z: number;
  /** Доля пути: 0 — только сорвался с руки, 1 — у цели. */
  part: number;
  /** Сторона стрелявшего. По ней идёт цвет: у нежити свой, у живых свой. */
  side: -1 | 1;
};

/** Кому этот маг шлёт снаряд. */
function boltTarget(fighters: readonly Fighter[], mage: Fighter): Fighter | null {
  const enemies = fighters.filter((other) => other.side !== mage.side);
  const front = enemies.filter((other) => !other.mage);
  const pool = front.length > 0 ? front : enemies;

  return pool[mage.file % pool.length] ?? null;
}

/**
 * Снаряды всех магов стычки в этот миг.
 * @param seconds общее время мира; сдвиг фазы стычки прибавляется внутри
 */
export function battleBolts(battle: WorldBattle, seconds: number): BattleBolt[] {
  const { cycle, at } = battleCycle(seconds, battle.offset);

  const approach = PHASES.rise + PHASES.approach;
  const melee = approach + PHASES.melee;
  const fall = melee + PHASES.fall;

  const fighters = battleFighters(battle);
  const bolts: BattleBolt[] = [];

  /** Снаряд от мага к цели: место по доле пути и дуга над прямой. */
  const shotAt = (
    mage: Fighter,
    target: Fighter,
    part: number,
    id: string,
  ): BattleBolt => {
    const from = place(battle, clashLine(mage), fileOffset(mage));
    const to = place(battle, clashLine(target), fileOffset(target));

    const fromY = from.y + mage.height * HAND_HEIGHT;
    const toY = to.y + target.height * CHEST_HEIGHT;

    return {
      id,
      x: from.x + (to.x - from.x) * part,
      y: fromY + (toY - fromY) * part + Math.sin(Math.PI * part) * BOLT_ARC,
      z: from.z + (to.z - from.z) * part,
      part,
      side: mage.side,
    };
  };

  if (at >= approach && at < melee) {
    const sinceClash = at - approach;

    for (const mage of fighters) {
      if (!mage.mage) continue;

      const own = mage.side === -1 ? 0 : CAST / 2;
      const phase = (((sinceClash - own) % CAST) + CAST) % CAST;
      if (phase >= BOLT_FLIGHT) continue;

      const target = boltTarget(fighters, mage);
      if (!target) continue;

      const shot = Math.floor((sinceClash - own) / CAST);
      bolts.push(
        shotAt(mage, target, phase / BOLT_FLIGHT, `${mage.id}-${cycle}-${shot}`),
      );
    }

    return bolts;
  }

  if (at >= melee && at < fall) {
    const losing = losingSide(cycle);

    for (const mage of fighters) {
      if (!mage.mage || mage.side === losing) continue;

      const target = fighters.find((other) => other.side === losing && other.mage);
      if (!target) continue;

      const hit = melee + fallDelay(target);
      const phase = at - (hit - BOLT_FLIGHT);
      if (phase < 0 || phase >= BOLT_FLIGHT) continue;

      bolts.push(
        shotAt(mage, target, phase / BOLT_FLIGHT, `${mage.id}-${cycle}-добивающий`),
      );
    }
  }

  return bolts;
}

/** Все бойцы стычки в этот миг. Порядок совпадает с `battleFighters`. */
export function battleSteps(battle: WorldBattle, seconds: number): FighterStep[] {
  return battleFighters(battle).map((fighter) => battleStep(battle, fighter, seconds));
}

/** Ракурс на стычку: откуда смотреть, чтобы в кадр попали обе шеренги. */
export function battleView(battle: WorldBattle): {
  at: [number, number, number];
  look: [number, number, number];
} {
  const away = clashRadius(battle) * 1.5;
  const side = { x: Math.cos(battle.facing), z: -Math.sin(battle.facing) };
  const height = Math.max(battle.undead.height, battle.living.height);

  return {
    at: [
      battle.at[0] + side.x * away,
      battle.at[1] + away * 0.5,
      battle.at[2] + side.z * away,
    ],
    look: [battle.at[0], battle.at[1] + height / 2, battle.at[2]],
  };
}

/** Радиус самой схватки: строй без линий выхода. По нему строится ракурс. */
export function clashRadius(battle: WorldBattle): number {
  const files = Math.max(battle.undead.models.length, battle.living.models.length);
  return Math.hypot(CLASH_HALF + MAGE_BACK, ((files - 1) / 2) * FILE_STEP);
}

/** Радиус, в который умещается стычка. По нему решают, показывать ли её. */
export function battleRadius(battle: WorldBattle): number {
  const files = Math.max(battle.undead.models.length, battle.living.models.length);
  const across = ((files - 1) / 2) * FILE_STEP;
  const along = CLASH_HALF + MAGE_BACK + APPROACH_RUN;
  return Math.hypot(along, across);
}
