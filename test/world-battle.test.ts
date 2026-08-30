import { describe, expect, it } from 'vitest';

import { worldBattles } from '@/data/world-battles';
import {
  FIGURE_MODELS,
  MAX_FIGURE_HEIGHT,
  MIN_FIGURE_HEIGHT,
} from '@/data/world-figures';
import { SEA_LEVEL } from '@/data/world-places';
import {
  BOLT_FLIGHT,
  CAST,
  PERIOD,
  PHASES,
  battleBolts,
  battleCycle,
  battleFighters,
  battleRadius,
  battleStep,
  battleSteps,
  battleView,
  clashRadius,
  losingSide,
  type WorldBattle,
} from '@/lib/world/battle';

/** Стычка на ровной площадке, фронт вдоль оси Z: нежить на -Z, живые на +Z. */
const battle: WorldBattle = {
  id: 'проба',
  at: [10, 2, -5],
  slope: [0, 0],
  facing: 0,
  offset: 0,
  undead: {
    models: ['skeleton_warrior', 'skeleton_rogue', 'skeleton_mage'],
    height: 0.117,
  },
  living: { models: ['knight', 'barbarian', 'mage'], height: 0.117 },
};

const fighters = battleFighters(battle);
const undeadWarrior = fighters[0]!;
const undeadMage = fighters[2]!;
const knight = fighters[3]!;

/** Смещение бойца вдоль фронта: у этой стычки фронт идёт по оси Z. */
const along = (seconds: number, fighter = undeadWarrior): number =>
  battleStep(battle, fighter, seconds).z - battle.at[2];

/** Середина каждой фазы: удобнее, чем считать границы в каждом тесте. */
const RISE = PHASES.rise / 2;
const APPROACH = PHASES.rise + PHASES.approach / 2;
const MELEE = PHASES.rise + PHASES.approach + PHASES.melee / 2;
const FALL = PHASES.rise + PHASES.approach + PHASES.melee + PHASES.fall - 1;
const RETREAT = PERIOD - 0.5;

describe('battleFighters', () => {
  it('собирает обе стороны и метит их именами', () => {
    expect(fighters.map((f) => f.id)).toEqual([
      'проба-н1',
      'проба-н2',
      'проба-н3',
      'проба-ж1',
      'проба-ж2',
      'проба-ж3',
    ]);
  });

  it('нежить выходит с одной стороны, живые с другой', () => {
    expect(fighters.filter((f) => f.side === -1)).toHaveLength(3);
    expect(fighters.filter((f) => f.side === 1)).toHaveLength(3);
  });

  it('маг узнаётся по модели, а не по флагу в данных', () => {
    expect(undeadMage.mage).toBe(true);
    expect(undeadWarrior.mage).toBe(false);
  });
});

describe('battleCycle', () => {
  it('режет время на круги', () => {
    expect(battleCycle(0, 0)).toEqual({ cycle: 0, at: 0 });
    expect(battleCycle(PERIOD + 3, 0)).toEqual({ cycle: 1, at: 3 });
  });

  it('сдвиг фазы разводит соседние стычки', () => {
    expect(battleCycle(0, 12).at).toBe(12);
  });

  it('до начала времён круг отрицательный, а место в нём — нет', () => {
    const { cycle, at } = battleCycle(-1, 0);
    expect(cycle).toBe(-1);
    expect(at).toBeCloseTo(PERIOD - 1, 6);
  });
});

describe('losingSide', () => {
  it('сторона поражения чередуется от круга к кругу', () => {
    expect(losingSide(0)).toBe(-1);
    expect(losingSide(1)).toBe(1);
    expect(losingSide(2)).toBe(-1);
  });

  it('до начала времён чередование не ломается', () => {
    expect(losingSide(-1)).toBe(1);
  });
});

describe('расстановка', () => {
  it('перед сходом невредимая сторона стоит на своей линии выхода', () => {
    expect(along(PERIOD + RISE, knight)).toBeGreaterThan(0.6);
    expect(Math.abs(along(PERIOD + RISE, undeadWarrior))).toBeLessThan(0.1);
  });

  it('к концу сближения строй сошёлся почти вплотную', () => {
    const gap =
      along(PHASES.rise + PHASES.approach - 0.01, knight) -
      along(PHASES.rise + PHASES.approach - 0.01, undeadWarrior);

    expect(gap).toBeGreaterThan(0.08);
    expect(gap).toBeLessThan(0.2);
  });

  it('маг держится вторым рядом', () => {
    const mage = Math.abs(along(MELEE, undeadMage));
    const warrior = Math.abs(along(MELEE, undeadWarrior));
    expect(mage).toBeGreaterThan(warrior + 0.1);
  });

  it('шеренга стоит поперёк фронта, а не в одной точке', () => {
    const line = battleSteps(battle, MELEE)
      .filter((step) => step.id.startsWith('проба-н'))
      .map((step) => +(step.x - battle.at[0]).toFixed(3));

    expect(new Set(line).size).toBe(3);
    expect(Math.max(...line) - Math.min(...line)).toBeCloseTo(0.44, 3);
  });

  it('высота идёт по наклону площадки', () => {
    const tilted: WorldBattle = { ...battle, slope: [0, 0.1] };
    const step = battleStep(tilted, undeadWarrior, RISE);
    expect(step.y).toBeCloseTo(battle.at[1] + 0.1 * (step.z - battle.at[2]), 6);
  });

  it('бойцы смотрят на противника', () => {
    expect(Math.cos(battleStep(battle, undeadWarrior, MELEE).heading)).toBeCloseTo(
      1,
      6,
    );
    expect(Math.cos(battleStep(battle, knight, MELEE).heading)).toBeCloseTo(-1, 6);
  });
});

describe('позы', () => {
  it('идут в сближение шагом', () => {
    expect(battleStep(battle, knight, PERIOD + APPROACH).pose.clip).toBe('Walking_A');
  });

  it('в размене держат щит, а в выпаде тянутся к противнику', () => {
    const poses = new Set<string>();
    const depths: number[] = [];
    for (let t = MELEE - 3; t < MELEE + 3; t += 0.05) {
      poses.add(battleStep(battle, undeadWarrior, t).pose.clip);
      depths.push(along(t, undeadWarrior));
    }

    expect(poses).toEqual(new Set(['Blocking', 'Interact']));
    const clash = Math.min(...depths.map(Math.abs));
    expect(Math.max(...depths) - -clash).toBeLessThan(0.04);
  });

  it('маг бьёт с места: заклинание вместо выпада', () => {
    const spots = new Set<number>();
    const poses = new Set<string>();
    for (let t = MELEE - 3; t < MELEE + 3; t += 0.05) {
      poses.add(battleStep(battle, undeadMage, t).pose.clip);
      spots.add(+along(t, undeadMage).toFixed(4));
    }

    expect(poses).toEqual(new Set(['Spellcasting']));
    expect(spots.size).toBe(1);
  });

  it('проигравшие падают и остаются лежать, победители торжествуют', () => {
    expect(losingSide(0)).toBe(-1);
    expect(battleStep(battle, undeadWarrior, FALL).pose.clip).toBe('Lie_Idle');
    expect(battleStep(battle, knight, FALL).pose.clip).toBe('Cheer');
  });

  it('падение играется раз и застывает', () => {
    const start = PHASES.rise + PHASES.approach + PHASES.melee + 0.2;
    const pose = battleStep(battle, undeadWarrior, start).pose;
    expect(pose).toEqual({ clip: 'Death_A_Pose', loop: false });
  });

  it('павший встаёт в начале следующего круга: нежить своим клипом', () => {
    const pose = battleStep(battle, undeadWarrior, PERIOD + 1).pose;
    expect(pose).toEqual({ clip: 'Skeletons_Awaken_Standing', loop: false });
  });

  it('живой встаёт падением, пущенным назад', () => {
    expect(losingSide(1)).toBe(1);
    const pose = battleStep(battle, knight, 2 * PERIOD + 1).pose;
    expect(pose).toEqual({ clip: 'Death_A_Pose', loop: false, reverse: true });
  });
});

describe('круг замкнут', () => {
  it('победители возвращаются на свою линию выхода', () => {
    expect(along(RETREAT, knight)).toBeGreaterThan(0.6);
    expect(along(PERIOD - 0.001, knight)).toBeCloseTo(along(PERIOD + RISE, knight), 3);
  });

  it('павший встаёт там, где упал', () => {
    const fell = along(FALL, undeadWarrior);
    expect(along(PERIOD + 1, undeadWarrior)).toBeCloseTo(fell, 6);
  });

  it('стык кругов не даёт скачка ни одному бойцу', () => {
    const before = battleSteps(battle, PERIOD - 0.001);
    const after = battleSteps(battle, PERIOD + 0.001);

    for (let i = 0; i < before.length; i++) {
      const a = before[i]!;
      const b = after[i]!;
      expect(Math.hypot(b.x - a.x, b.z - a.z), a.id).toBeLessThan(0.01);
    }
  });

  it('за круг каждый успевает и сойтись, и вернуться', () => {
    const seen = new Set<string>();
    for (let t = 0; t < PERIOD; t += 0.25) {
      seen.add(battleStep(battle, knight, t).pose.clip);
    }
    expect(seen).toContain('Walking_A');
    expect(seen).toContain('Blocking');
    expect(seen).toContain('Cheer');
  });
});

describe('battleRadius', () => {
  it('охватывает и линию выхода, и края шеренги', () => {
    const radius = battleRadius(battle);
    for (let t = 0; t < PERIOD; t += 0.5) {
      for (const step of battleSteps(battle, t)) {
        const away = Math.hypot(step.x - battle.at[0], step.z - battle.at[2]);
        expect(away, `${step.id} в ${t.toFixed(1)} с`).toBeLessThanOrEqual(
          radius + 1e-6,
        );
      }
    }
  });
});

describe('battleView', () => {
  it('ставит камеру сбоку от фронта, а не за спиной у стороны', () => {
    const view = battleView(battle);
    expect(Math.abs(view.at[0] - battle.at[0])).toBeGreaterThan(clashRadius(battle));
    expect(Math.abs(view.at[2] - battle.at[2])).toBeLessThan(0.01);
  });

  it('смотрит в середину площадки на высоте груди бойца', () => {
    const view = battleView(battle);
    expect(view.look[0]).toBe(battle.at[0]);
    expect(view.look[2]).toBe(battle.at[2]);
    expect(view.look[1]).toBeCloseTo(battle.at[1] + 0.117 / 2, 6);
  });

  it('в кадр попадает вся схватка, но не полполяны', () => {
    const view = battleView(battle);
    const away = Math.hypot(view.at[0] - battle.at[0], view.at[2] - battle.at[2]);

    expect(away).toBeGreaterThan(clashRadius(battle));
    expect(away).toBeLessThan(battleRadius(battle));
  });

  it('отступ растёт вместе со стычкой', () => {
    const wide: WorldBattle = {
      ...battle,
      undead: {
        ...battle.undead,
        models: [...battle.undead.models, 'skeleton_minion'],
      },
    };
    expect(Math.abs(battleView(wide).at[0] - battle.at[0])).toBeGreaterThan(
      Math.abs(battleView(battle).at[0] - battle.at[0]),
    );
  });

  it('поворот фронта разворачивает и ракурс', () => {
    const turned: WorldBattle = { ...battle, facing: Math.PI / 2 };
    const view = battleView(turned);
    expect(Math.abs(view.at[0] - battle.at[0])).toBeLessThan(0.01);
    expect(Math.abs(view.at[2] - battle.at[2])).toBeGreaterThan(clashRadius(battle));
  });
});

describe('worldBattles', () => {
  it('имена стычек не повторяются', () => {
    const ids = worldBattles.map((battle) => battle.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('модели бойцов известны', () => {
    for (const battle of worldBattles) {
      for (const fighter of battleFighters(battle)) {
        expect(FIGURE_MODELS[fighter.model], fighter.id).toBeDefined();
      }
    }
  });

  it('рост бойцов в разумных пределах', () => {
    for (const battle of worldBattles) {
      for (const side of [battle.undead, battle.living]) {
        expect(side.height).toBeGreaterThanOrEqual(MIN_FIGURE_HEIGHT);
        expect(side.height).toBeLessThanOrEqual(MAX_FIGURE_HEIGHT);
      }
    }
  });

  it('в каждой стороне есть кому драться и не больше одного мага', () => {
    for (const battle of worldBattles) {
      for (const side of [battle.undead, battle.living]) {
        expect(side.models.length).toBeGreaterThan(1);
        expect(side.models.filter((model) => model.endsWith('mage'))).toHaveLength(1);
      }
    }
  });

  it('площадки лежат над водой и почти ровные', () => {
    for (const battle of worldBattles) {
      expect(battle.at[1], battle.id).toBeGreaterThan(SEA_LEVEL);
      expect(Math.hypot(battle.slope[0], battle.slope[1]), battle.id).toBeLessThan(0.1);
    }
  });

  it('стычки разведены по времени и по месту', () => {
    const offsets = worldBattles.map((battle) => battle.offset);
    expect(new Set(offsets).size).toBe(offsets.length);
    for (const offset of offsets) {
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(PERIOD);
    }

    for (let i = 0; i < worldBattles.length; i++) {
      for (let k = i + 1; k < worldBattles.length; k++) {
        const one = worldBattles[i]!;
        const other = worldBattles[k]!;
        const away = Math.hypot(one.at[0] - other.at[0], one.at[2] - other.at[2]);
        expect(away, `${one.id} и ${other.id}`).toBeGreaterThan(
          battleRadius(one) + battleRadius(other),
        );
      }
    }
  });

  it('заморожены: стычку нельзя править из сцены', () => {
    expect(Object.isFrozen(worldBattles)).toBe(true);
  });
});

describe('снаряды магов', () => {
  /** Середина размена: к этому мигу обе стороны уже сошлись. */
  const clash = PHASES.rise + PHASES.approach;
  const midMelee = clash + PHASES.melee / 2;

  it('до схода и после падения маг не стреляет', () => {
    expect(battleBolts(battle, 1)).toHaveLength(0);
    expect(battleBolts(battle, clash - 0.01)).toHaveLength(0);
    expect(battleBolts(battle, clash + PHASES.melee + 0.5)).toHaveLength(0);
  });

  it('за размен маг успевает выстрелить не один раз', () => {
    const shots = new Set<string>();

    for (let step = 0; step < PHASES.melee * 20; step++) {
      for (const bolt of battleBolts(battle, clash + step / 20)) shots.add(bolt.id);
    }

    expect(shots.size).toBeGreaterThanOrEqual(10);
  });

  it('в воздухе у мага не больше одного снаряда', () => {
    expect(BOLT_FLIGHT).toBeLessThan(CAST);

    for (let step = 0; step < PHASES.melee * 10; step++) {
      const bolts = battleBolts(battle, clash + step / 10);
      const owners = bolts.map((bolt) => bolt.id.split('-').slice(0, -2).join('-'));

      expect(new Set(owners).size).toBe(owners.length);
    }
  });

  it('снаряд летит от мага к чужой шеренге, а не наоборот', () => {
    const track: { part: number; z: number }[] = [];

    for (let step = 0; step <= 10; step++) {
      const at = clash + (BOLT_FLIGHT * step) / 10;
      const bolt = battleBolts(battle, at).find((one) => one.side === -1);
      if (bolt) track.push({ part: bolt.part, z: bolt.z });
    }

    expect(track.length).toBeGreaterThan(3);

    for (let index = 1; index < track.length; index++) {
      expect(track[index]!.z).toBeGreaterThan(track[index - 1]!.z);
    }
  });

  it('снаряд идёт дугой: середина пути выше концов', () => {
    const samples: { part: number; y: number }[] = [];

    for (let step = 0; step <= 20; step++) {
      const at = clash + (BOLT_FLIGHT * step) / 20;
      const bolt = battleBolts(battle, at).find((one) => one.side === -1);
      if (bolt) samples.push({ part: bolt.part, y: bolt.y });
    }

    const ends = samples.filter((one) => one.part < 0.1 || one.part > 0.9);
    const middle = samples.filter((one) => one.part > 0.4 && one.part < 0.6);

    expect(ends.length).toBeGreaterThan(0);
    expect(middle.length).toBeGreaterThan(0);

    const highestEnd = Math.max(...ends.map((one) => one.y));
    const lowestMiddle = Math.min(...middle.map((one) => one.y));

    expect(lowestMiddle).toBeGreaterThan(highestEnd);
  });

  it('снаряд летит на высоте бойца, а не по земле', () => {
    let seen = 0;

    for (let step = 0; step < PHASES.melee * 20; step++) {
      for (const bolt of battleBolts(battle, clash + step / 20)) {
        const above = bolt.y - battle.at[1];

        expect(above).toBeGreaterThan(0.117 * 0.4);
        expect(above).toBeLessThan(0.117 * 1.1);
        seen++;
      }
    }

    expect(seen).toBeGreaterThan(50);
  });

  it('тот же миг даёт те же снаряды', () => {
    expect(battleBolts(battle, midMelee)).toEqual(battleBolts(battle, midMelee));
  });

  it('стороны стреляют вразнобой', () => {
    let together = 0;
    let apart = 0;

    for (let step = 0; step < PHASES.melee * 10; step++) {
      const bolts = battleBolts(battle, clash + step / 10);
      const sides = new Set(bolts.map((bolt) => bolt.side));

      if (sides.size === 2) together++;
      else if (sides.size === 1) apart++;
    }

    expect(apart).toBeGreaterThan(0);
    expect(together).toBe(0);
  });
});

describe('падение приходит от противника', () => {
  const clash = PHASES.rise + PHASES.approach;
  const melee = clash + PHASES.melee;

  /** Круг, в котором падает нежить: у этой стычки сдвиг фазы нулевой. */
  const cycleWhereUndeadFalls = losingSide(0) === -1 ? 0 : 1;
  const base = cycleWhereUndeadFalls * PERIOD;

  /** Когда боец переходит в клип падения: первый миг позы `Death_A_Pose`. */
  const fallsAt = (fighter: (typeof fighters)[number]): number => {
    for (let step = 0; step <= PHASES.fall * 40; step++) {
      const at = melee + step / 40;
      if (battleStep(battle, fighter, base + at).pose.clip === 'Death_A_Pose') {
        return at - melee;
      }
    }

    return Number.NaN;
  };

  it('маг падает последним: до него мечники не достают', () => {
    const mageDown = fallsAt(undeadMage);
    const warriorDown = fallsAt(undeadWarrior);

    expect(Number.isFinite(mageDown)).toBe(true);
    expect(mageDown).toBeGreaterThan(warriorDown);
  });

  it('мага роняет снаряд: прилёт совпадает с падением', () => {
    const down = fallsAt(undeadMage);
    const shots: { part: number; at: number }[] = [];

    for (let step = 0; step <= PHASES.fall * 40; step++) {
      const at = melee + step / 40;
      for (const bolt of battleBolts(battle, base + at)) {
        if (bolt.side === 1) shots.push({ part: bolt.part, at: at - melee });
      }
    }

    expect(shots.length).toBeGreaterThan(0);

    const landing = Math.max(...shots.map((shot) => shot.at));
    expect(landing).toBeGreaterThan(down - 0.1);
    expect(landing).toBeLessThanOrEqual(down + 0.05);
  });

  it('победитель не ликует, пока его противник на ногах', () => {
    const down = fallsAt(undeadWarrior);

    const before = battleStep(battle, knight, base + melee + down - 0.5).pose.clip;
    const after = battleStep(battle, knight, base + melee + down + 0.5).pose.clip;

    expect(['Interact', 'Blocking']).toContain(before);
    expect(after).toBe('Cheer');
  });

  it('добивающий выпад приходится на миг падения врага', () => {
    const down = fallsAt(undeadWarrior);
    const depthAt = (offset: number): number => {
      const step = battleStep(battle, knight, base + melee + down + offset);
      return Math.abs(step.z - battle.at[2]);
    };

    expect(depthAt(-0.02)).toBeGreaterThan(depthAt(-0.55));
  });
});
