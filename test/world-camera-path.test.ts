import { describe, expect, it } from 'vitest';

import { SEA_LEVEL } from '@/data/world-places';
import { entryPath } from '@/data/world-shots';
import {
  easeFlight,
  flightDuration,
  pathLengths,
  pathTurn,
  samplePath,
  type PathKey,
} from '@/lib/world/camera-path';

const keys: PathKey[] = [
  { at: [0, 10, 0], look: [0, 0, -10] },
  { at: [10, 6, -10], look: [10, 0, -20] },
  { at: [20, 2, -10], look: [20, 0, -20] },
];

const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('траектория камеры', () => {
  it('проходит ровно через первую и последнюю опору', () => {
    expect(samplePath(keys, 0).position).toEqual(keys[0]!.at);
    expect(samplePath(keys, 1).position).toEqual(keys.at(-1)!.at);
  });

  it('точку взгляда ведёт вместе с камерой', () => {
    for (const [axis, value] of samplePath(keys, 0).look.entries()) {
      expect(value).toBeCloseTo(keys[0]!.look[axis]!, 10);
    }
    for (const [axis, value] of samplePath(keys, 1).look.entries()) {
      expect(value).toBeCloseTo(keys.at(-1)!.look[axis]!, 10);
    }
  });

  it('доля пути зажимается: за концы кривой камера не выходит', () => {
    expect(samplePath(keys, -3).position).toEqual(keys[0]!.at);
    expect(samplePath(keys, 42).position).toEqual(keys.at(-1)!.at);
  });

  it('идёт без разрывов: соседние доли дают соседние точки', () => {
    let previous = samplePath(keys, 0).position;
    const { total } = pathLengths(keys);

    for (let step = 1; step <= 100; step++) {
      const current = samplePath(keys, step / 100).position;
      expect(distance(previous, current)).toBeLessThan(total / 10);
      previous = current;
    }
  });

  it('движется равномерно: длинный участок не проглатывается', () => {
    const middle = samplePath(keys, 0.5).position;
    const fromStart = distance(keys[0]!.at, middle);
    const toEnd = distance(middle, keys.at(-1)!.at);

    expect(Math.abs(fromStart - toEnd)).toBeLessThan(fromStart * 0.35);
  });

  it('вырожденный путь не роняет расчёт', () => {
    const single: PathKey[] = [{ at: [1, 2, 3], look: [4, 5, 6] }];
    expect(samplePath(single, 0.5).position).toEqual([1, 2, 3]);

    const same: PathKey[] = [
      { at: [1, 2, 3], look: [4, 5, 6] },
      { at: [1, 2, 3], look: [4, 5, 6] },
    ];
    expect(samplePath(same, 0.7).position).toEqual([1, 2, 3]);
  });

  it('пустой путь — ошибка, а не молчаливый ноль', () => {
    expect(() => samplePath([], 0.5)).toThrow(/некуда лететь/);
  });
});

describe('плавность', () => {
  it('начинается в нуле и заканчивается единицей', () => {
    expect(easeFlight(0)).toBeCloseTo(0, 5);
    expect(easeFlight(1)).toBeCloseTo(1, 5);
  });

  it('не идёт вспять', () => {
    let previous = 0;
    for (let step = 1; step <= 50; step++) {
      const value = easeFlight(step / 50);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('длительность', () => {
  it('растёт вместе с длиной пути', () => {
    const short = flightDuration([keys[0]!, keys[1]!]);
    const long = flightDuration(keys);
    expect(long).toBeGreaterThan(short);
  });

  it('держится в разумных пределах', () => {
    const tiny: PathKey[] = [
      { at: [0, 1, 0], look: [0, 1, -5] },
      { at: [0.2, 1, 0], look: [0.2, 1, -5] },
    ];
    const huge: PathKey[] = [
      { at: [-200, 90, -200], look: [0, 0, 0] },
      { at: [200, 90, 200], look: [0, 0, 0] },
    ];

    expect(flightDuration(tiny)).toBeGreaterThanOrEqual(1400);
    expect(flightDuration(huge)).toBeLessThanOrEqual(11000);
  });
});

describe('вход как траектория', () => {
  it('не ныряет под воду ни на одном кадре', () => {
    for (let step = 0; step <= 200; step++) {
      const { position } = samplePath(entryPath, easeFlight(step / 200));
      expect(position[1], `доля ${step / 200}`).toBeGreaterThan(SEA_LEVEL);
    }
  });

  it('идёт от благодати вверх и приходит к первой главе внизу', () => {
    const start = samplePath(entryPath, 0).position;
    const peak = Array.from(
      { length: 101 },
      (_, step) => samplePath(entryPath, step / 100).position[1],
    ).reduce((max, value) => Math.max(max, value), -Infinity);
    const end = samplePath(entryPath, 1).position;

    expect(peak).toBeGreaterThan(start[1] + 5);
    expect(end[1]).toBeLessThan(peak);
  });

  it('длится от трёх до одиннадцати секунд: не рывок и не перемотка', () => {
    const duration = flightDuration(entryPath);
    expect(duration).toBeGreaterThan(3000);
    expect(duration).toBeLessThanOrEqual(11000);
  });
});

/** Как ведёт себя кадр вдоль перелёта. */
function aiming(keys: PathKey[], durationMs = flightDuration(keys)) {
  const frames = Math.max(16, Math.round((durationMs / 1000) * 60));
  const step = durationMs / frames / 1000;

  const directions = Array.from({ length: frames + 1 }, (_, index) => {
    const { position, look } = samplePath(keys, easeFlight(index / frames));
    const away = [look[0] - position[0], look[1] - position[1], look[2] - position[2]];
    const reach = Math.hypot(...away) || 1;

    return { unit: away.map((value) => value / reach), reach };
  });

  const speeds: number[] = [];
  for (let index = 1; index <= frames; index++) {
    const before = directions[index - 1]!.unit;
    const after = directions[index]!.unit;
    const cos =
      before[0]! * after[0]! + before[1]! * after[1]! + before[2]! * after[2]!;

    speeds.push((Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI / step);
  }

  const mean = speeds.reduce((sum, value) => sum + value, 0) / speeds.length;

  return {
    peak: Math.max(...speeds),
    mean,
    ratio: Math.max(...speeds) / (mean || 1),
    closest: Math.min(...directions.map((item) => item.reach)),
  };
}

describe('взгляд', () => {
  /**
   * Разворот кадра почти назад: точка взгляда при движении по прямой прошла бы
   * вплотную к камере, и кадр в этот миг швыряло бы.
   */
  const around: PathKey[] = [
    { at: [0, 3, 0], look: [0, 3, -12] },
    { at: [6, 3, 4], look: [-4, 4, 20] },
  ];

  it('не швыряет там, где точка взгляда прошла бы у самой камеры', () => {
    expect(aiming(around).peak).toBeLessThan(150);
  });

  it('скорость разворота ровная: пик задаёт плавность, а не геометрия', () => {
    expect(aiming(around).ratio).toBeLessThan(2.1);
  });

  it('на входе кадр не швыряет', () => {
    expect(aiming(entryPath).peak).toBeLessThan(150);
  });

  it('дальность взгляда не схлопывается: кадр остаётся кадром', () => {
    expect(aiming(around).closest).toBeGreaterThan(1);
    expect(aiming(entryPath).closest).toBeGreaterThan(1);
  });
});

describe('разворот кадра', () => {
  it('считается по настоящему углу между направлениями', () => {
    const quarter: PathKey[] = [
      { at: [0, 0, 0], look: [0, 0, -10] },
      { at: [1, 0, 0], look: [-9, 0, 0] },
    ];

    expect(pathTurn(quarter)).toBeCloseTo(90, 4);
  });

  it('прямой взгляд вдоль пути разворота не даёт', () => {
    const straight: PathKey[] = [
      { at: [0, 0, 0], look: [0, 0, -10] },
      { at: [0, 0, -5], look: [0, 0, -15] },
    ];

    expect(pathTurn(straight)).toBeCloseTo(0, 6);
  });

  it('длится дольше, когда кадр разворачивается сильно', () => {
    const turned: PathKey[] = [
      { at: [0, 3, 0], look: [0, 3, -12] },
      { at: [2, 3, 1], look: [-10, 3, 6] },
    ];

    expect(pathTurn(turned)).toBeGreaterThan(100);
    expect(flightDuration(turned)).toBeGreaterThan(2200);
  });
});
