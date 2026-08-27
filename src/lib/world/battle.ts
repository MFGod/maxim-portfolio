/**
 * Стычка на поляне: кто где стоит и что делает в этот миг.
 *
 * Арифметика боя отделена от сцены и от three ровно так же, как ход дозора в
 * `patrol.ts`: здесь только время, места и позы, а расставляет фигуры и крутит
 * миксеры `figures.ts`. Отсюда и главное свойство — бой **вычисляется из
 * времени**, а не копится состоянием. Пауза, вкладка в фоне, скачок часов после
 * сна ноутбука ничего не ломают: тот же миг даёт тот же кадр.
 *
 * Клипов удара в моделях нет. При обрезке в них оставили десять поз — стойку,
 * шаг, блок, каст, ликование, падение и лежание, — и «махнуть мечом» в этом
 * наборе нечем. Поэтому удар собран из того, что есть: выпад корпусом вперёд
 * (это уже наше движение, а не клип) под позу `Interact` — протянутую вперёд
 * руку с оружием, — и возврат в `Blocking`. Читается как размен: один давит,
 * второй закрывается.
 *
 * Подъём павшего собран тем же способом — `Death_A_Pose`, пущенный назад
 * (`reverse`). Нежити реверс не нужен, у неё есть свой клип пробуждения.
 *
 * Круг боя замкнут: победители отходят на свою линию, павшие остаются лежать
 * там, где упали, и встают на месте в начале следующего круга — навстречу тем,
 * кто снова идёт в сближение. Поэтому расстановка после круга совпадает с
 * расстановкой до него, и стык не виден.
 */

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
  /**
   * Наклон площадки: прирост высоты на юнит по X и по Z.
   *
   * Поляны ровные, но не идеально: без наклона дальний край строя уходит в
   * землю или висит над ней на пару сантиметров — при росте 0,117 это видно.
   */
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

/**
 * Откуда сторона выходит: на столько дальше линии схода, юниты.
 *
 * Не больше: вся стычка должна уместиться в чистую полосу, а полян шире двух
 * юнитов на этой карте почти нет — везде куст, камень или склон. И не меньше:
 * 0,62 за семь секунд дают 0,089 юнита в секунду — ровно тот шаг, на который
 * рассчитан клип `Walking_A` при росте 0,117 (см. `world-patrols.ts`).
 */
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

/**
 * Круг боя и время внутри него.
 *
 * Отрицательное время бывает у стычки со сдвигом фазы больше прошедшего
 * времени — на первых секундах после загрузки.
 */
export function battleCycle(
  seconds: number,
  offset: number,
): { cycle: number; at: number } {
  const shifted = seconds + offset;
  const cycle = Math.floor(shifted / PERIOD);
  return { cycle, at: shifted - cycle * PERIOD };
}

/**
 * Какая сторона падает в этом круге: они чередуются.
 *
 * Иначе стычка становится не боем, а роликом: со второго просмотра известно,
 * кто победит. Чередование даёт разный исход у одной и той же площадки и
 * разный — у соседних, потому что круги у них сдвинуты.
 */
export function losingSide(cycle: number): -1 | 1 {
  // Остаток берётся с приведением: у отрицательного круга он в JS отрицателен.
  return ((cycle % 2) + 2) % 2 === 0 ? -1 : 1;
}

/** Точка в мире по смещению вдоль фронта и поперёк него. */
function place(
  battle: WorldBattle,
  along: number,
  across: number,
): { x: number; y: number; z: number } {
  const forward = { x: Math.sin(battle.facing), z: Math.cos(battle.facing) };
  // Поперёк фронта — та же ось, повёрнутая на четверть оборота.
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

/**
 * Бьёт ли боец прямо сейчас и насколько глубоко ушёл в выпад.
 *
 * Стороны бьют по очереди: нежить в начале круга размена, живые в середине.
 * Соседи в шеренге сдвинуты на треть круга — иначе шеренга бьёт как один
 * механизм.
 */
function strikeDepth(fighter: Fighter, sinceClash: number): number {
  if (fighter.mage) return 0;

  const own = fighter.side === -1 ? 0 : TRADE / 2;
  const stagger = (fighter.file % 3) * (TRADE / 6);
  const phase = (((sinceClash - own - stagger) % TRADE) + TRADE) % TRADE;
  if (phase > STRIKE) return 0;

  // Треугольник: выпад вперёд и возврат. Пик — на середине удара.
  const part = phase / STRIKE;
  return part < 0.5 ? ease(part * 2) : ease((1 - part) * 2);
}

/** Поза стоящего в строю до схода: нежить просыпается, живые ждут. */
function readyPose(fighter: Fighter, risen: boolean, at: number): Pose {
  const undead = fighter.side === -1;

  if (risen) {
    // Подъём занимает начало фазы, дальше боец уже стоит.
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
 *
 * @param seconds общее время мира; сдвиг фазы стычки прибавляется внутри
 */
export function battleStep(
  battle: WorldBattle,
  fighter: Fighter,
  seconds: number,
): FighterStep {
  const { cycle, at } = battleCycle(seconds, battle.offset);

  /*
   * Павший прошлого круга встаёт там, где упал, — на линии схода. Ушедший
   * победителем стоит на своей линии выхода. Отсюда и разные места в начале
   * круга: тот, кто лежал, уже на месте боя, а его противник только идёт.
   */
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

  // --- Подъём и стойка ---------------------------------------------------
  if (at < rise) {
    const along = fellBefore ? clash : start;
    const spot = place(battle, along, across);
    return stepOf(fighter, spot, facingEnemy, readyPose(fighter, fellBefore, at));
  }

  // --- Сближение ---------------------------------------------------------
  if (at < approach) {
    if (fellBefore) {
      // Поднявшийся уже на месте: ждёт с поднятым щитом, а не идёт навстречу.
      const spot = place(battle, clash, across);
      return stepOf(fighter, spot, facingEnemy, { clip: 'Blocking', loop: true });
    }

    /*
     * Ход равномерный, без разгона: клип шага рассчитан на постоянную скорость,
     * и всякое ускорение видно как проскальзывание ступней по земле.
     */
    const part = (at - rise) / PHASES.approach;
    const spot = place(battle, start + (clash - start) * part, across);
    return stepOf(fighter, spot, facingEnemy, { clip: 'Walking_A', loop: true });
  }

  // --- Размен ------------------------------------------------------------
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

  // --- Падение -----------------------------------------------------------
  if (at < fall) {
    const spot = place(battle, clash, across);

    if (!falls) {
      const undead = fighter.side === -1;
      return stepOf(fighter, spot, facingEnemy, {
        clip: undead ? 'Taunt' : 'Cheer',
        loop: true,
      });
    }

    const since = at - melee - fighter.file * FALL_STAGGER;
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

  // --- Отход -------------------------------------------------------------
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

/** Все бойцы стычки в этот миг. Порядок совпадает с `battleFighters`. */
export function battleSteps(battle: WorldBattle, seconds: number): FighterStep[] {
  return battleFighters(battle).map((fighter) => battleStep(battle, fighter, seconds));
}

/**
 * Ракурс на стычку: откуда смотреть, чтобы в кадр попали обе шеренги.
 *
 * Камера встаёт **сбоку от фронта**, а не за спиной у одной из сторон: с
 * фланга видно обе шеренги и промежуток между ними, а из-за спины передний ряд
 * закрывает всё остальное.
 *
 * Отступ считается от места схватки, а не от всей площадки. Разница велика:
 * площадка вместе с линиями выхода — это 1,2 юнита в радиусе, схватка — треть
 * юнита. Кадр по площадке даёт фигуру ростом 0,117 в шесть процентов высоты
 * кадра — двадцать семь пикселей, в которых боя не разглядеть.
 *
 * Высота — половина отступа: взгляд сверху вниз примерно под тридцать
 * градусов. Ниже — и передний боец закрывает дальнего, выше — бой читается
 * планом сверху, а не боем.
 *
 * Ниже этой высоты камеру всё равно не пустит купол — невидимая оболочка
 * висит над рельефом примерно на 0,6 юнита и поднимает всякого, кто зашёл под
 * неё. Поэтому отступ по земле берётся с запасом на этот подъём: итоговый
 * взгляд выходит круче задуманного, но бойцы остаются в кадре.
 */
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
