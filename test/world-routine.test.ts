import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  FIGURE_MODELS,
  worldFigures,
  type FigureModel,
  type WorldFigure,
} from '@/data/world-figures';
import {
  CHORES,
  MAX_CHORE,
  MAX_HOLD,
  MIN_CHORE,
  MIN_HOLD,
  REST_CLIP,
  SITTING,
  choresOf,
  routineCycle,
  routinePose,
  seedOf,
} from '@/lib/world/routine';

/** Клипы модели — прямо из её файла. */
function clipsOf(model: FigureModel): string[] {
  const file = readFileSync(`public/world/${FIGURE_MODELS[model]}`);
  const length = file.readUInt32LE(12);
  const header = JSON.parse(file.subarray(20, 20 + length).toString('utf8')) as {
    animations?: { name?: string }[];
  };
  return (header.animations ?? []).map((clip) => clip.name ?? '');
}

function figure(patch: Partial<WorldFigure> = {}): WorldFigure {
  return {
    id: 'один',
    role: 'gate',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [0, 0, 0],
    turn: 0,
    height: 0.117,
    ...patch,
  };
}

describe('seedOf', () => {
  it('даёт одно и то же число одному и тому же имени', () => {
    expect(seedOf('лагерь-7')).toBe(seedOf('лагерь-7'));
  });

  it('разводит соседние имена', () => {
    expect(seedOf('лагерь-7')).not.toBe(seedOf('лагерь-8'));
  });
});

describe('routineCycle', () => {
  it('держит длительности в заданных пределах', () => {
    const names = worldFigures.map((one) => one.id);

    const cycles = names.map((id) => routineCycle(id));

    for (const cycle of cycles) {
      expect(cycle.hold).toBeGreaterThanOrEqual(MIN_HOLD);
      expect(cycle.hold).toBeLessThanOrEqual(MAX_HOLD);
      expect(cycle.chore).toBeGreaterThanOrEqual(MIN_CHORE);
      expect(cycle.chore).toBeLessThanOrEqual(MAX_CHORE);
      expect(cycle.offset).toBeLessThan(cycle.period);
    }
  });

  it('разводит круги соседей по фазе', () => {
    const first = routineCycle('лагерь-1');
    const second = routineCycle('лагерь-2');

    expect(Math.abs(first.offset - second.offset)).toBeGreaterThan(0.5);
  });
});

describe('routinePose', () => {
  it('в один и тот же миг даёт одну и ту же позу', () => {
    const one = figure({ id: 'вход-3' });

    expect(routinePose(one, 137.25)).toEqual(routinePose(one, 137.25));
  });

  it('повторяет позу через круг', () => {
    const one = figure({ id: 'вход-3' });
    const { period } = routineCycle(one.id);

    expect(routinePose(one, 10 + period * 3)).toEqual(routinePose(one, 10));
  });

  it('держит основное занятие большую часть круга', () => {
    const one = figure({ id: 'лагерь-12', role: 'camp', clip: 'Cheer' });
    const { period } = routineCycle(one.id);

    let own = 0;
    const steps = 500;
    for (let step = 0; step < steps; step++) {
      if (routinePose(one, (step * period) / steps).clip === one.clip) own++;
    }

    expect(own / steps).toBeGreaterThan(0.7);
  });

  it('уводит в отлучку и возвращает обратно', () => {
    const one = figure({ id: 'башня-4', role: 'tower' });
    const { hold, period, offset } = routineCycle(one.id);

    const own = routinePose(one, hold / 2 - offset);
    const away = routinePose(one, hold + (period - hold) / 2 - offset);

    expect(own.clip).toBe(one.clip);
    expect(CHORES.tower).toContain(away.clip);
  });

  it('на разных кругах отлучается по-разному', () => {
    const one = figure({ id: 'вход-9', role: 'gate' });
    const { hold, period, offset } = routineCycle(one.id);
    const middle = hold + (period - hold) / 2 - offset;

    const seen = new Set(
      [0, 1, 2].map((round) => routinePose(one, middle + round * period).clip),
    );

    expect(seen.size).toBe(CHORES.gate.length);
  });

  it('всегда зациклена: одноразовый клип застыл бы в последнем кадре', () => {
    const one = figure({ id: 'замок-2', role: 'castle' });
    const { period } = routineCycle(one.id);

    for (let step = 0; step < 50; step++) {
      expect(routinePose(one, (step * period) / 50).loop).toBe(true);
    }
  });
});

describe('choresOf', () => {
  it('добавляет отдых тому, кто сидит', () => {
    const sitting = figure({ id: 'лагерь-5', role: 'camp', clip: SITTING });

    expect(choresOf(sitting)).toContain(REST_CLIP);
  });

  it('не даёт лечь тому, кто стоит на посту', () => {
    const standing = figure({ id: 'вход-1', role: 'gate', clip: 'Idle' });

    expect(choresOf(standing)).not.toContain(REST_CLIP);
  });
});

describe('данные одиночек', () => {
  it('роль есть у каждой фигуры', () => {
    for (const one of worldFigures) {
      expect(CHORES[one.role], one.id).toBeDefined();
    }
  });

  it('роль совпадает с именем места', () => {
    const byPrefix: Record<string, string> = {
      башня: 'tower',
      вход: 'gate',
      замок: 'castle',
      лагерь: 'camp',
    };

    for (const one of worldFigures) {
      const prefix = one.id.split('-')[0]!;
      expect(one.role, one.id).toBe(byPrefix[prefix]);
    }
  });

  it('модель знает своё основное занятие', () => {
    for (const one of worldFigures) {
      expect(clipsOf(one.model), `${one.id}: ${one.clip}`).toContain(one.clip);
    }
  });

  it('за круг каждая фигура успевает отлучиться и вернуться', () => {
    for (const one of worldFigures) {
      const { period } = routineCycle(one.id);
      const poses = new Set<string>();
      for (let step = 0; step < 200; step++) {
        poses.add(routinePose(one, (step * period) / 200).clip);
      }

      expect(poses.has(one.clip), `${one.id}: не возвращается к своему`).toBe(true);
      expect(poses.size, `${one.id}: стоит весь круг в одной позе`).toBeGreaterThan(1);
    }
  });

  it('модель знает каждое занятие своего распорядка', () => {
    for (const one of worldFigures) {
      const known = clipsOf(one.model);
      for (const chore of choresOf(one)) {
        expect(known, `${one.id} (${one.role}): ${chore}`).toContain(chore);
      }
    }
  });
});
