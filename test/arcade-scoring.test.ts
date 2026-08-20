import { describe, expect, it } from 'vitest';

import {
  DURATION_BOUNDS,
  MATCH3_DURATION_MS,
  isPlausible,
  matchPoints,
  scoreOf,
} from '@/lib/arcade/scoring';
import type { RunReport } from '@/lib/arcade/types';

const FULL_MINUTE = MATCH3_DURATION_MS;

describe('цена линии', () => {
  it('растёт с длиной', () => {
    expect(matchPoints(3, 0)).toBe(30);
    expect(matchPoints(4, 0)).toBe(60);
    expect(matchPoints(5, 0)).toBe(90);
  });

  it('умножается каскадом', () => {
    expect(matchPoints(3, 1)).toBe(60);
    expect(matchPoints(3, 2)).toBe(90);
  });
});

describe('счёт забега', () => {
  it('складывает линии «Трёх в ряд»', () => {
    const score = scoreOf({
      game: 'three-in-row',
      matches: [
        { size: 3, cascade: 0 },
        { size: 4, cascade: 1 },
      ],
    });
    expect(score).toBe(30 + 120);
  });

  it('считает башню по блокам и точным попаданиям', () => {
    expect(scoreOf({ game: 'tower-builder', blocks: 10, perfect: 4 })).toBe(160);
  });

  it('считает память нарастающей ценой раунда', () => {
    expect(scoreOf({ game: 'memory', rounds: 0 })).toBe(0);
    expect(scoreOf({ game: 'memory', rounds: 1 })).toBe(25);
    expect(scoreOf({ game: 'memory', rounds: 4 })).toBe(250);
  });
});

describe('правдоподобие забега', () => {
  it('принимает минуту «Трёх в ряд»', () => {
    const run: RunReport = {
      game: 'three-in-row',
      matches: [{ size: 3, cascade: 0 }],
    };
    expect(isPlausible(run, FULL_MINUTE)).toBe(true);
  });

  it('отклоняет партию короче таймера', () => {
    expect(isPlausible({ game: 'three-in-row', matches: [] }, 5_000)).toBe(false);
  });

  it('отклоняет партию, пролежавшую слишком долго', () => {
    const tooLate = DURATION_BOUNDS['three-in-row'].max + 1;
    expect(isPlausible({ game: 'three-in-row', matches: [] }, tooLate)).toBe(false);
  });

  it('отклоняет линию невозможной длины', () => {
    const run: RunReport = {
      game: 'three-in-row',
      matches: [{ size: 40, cascade: 0 }],
    };
    expect(isPlausible(run, FULL_MINUTE)).toBe(false);
  });

  it('отклоняет башню, построенную быстрее физически возможного', () => {
    expect(isPlausible({ game: 'tower-builder', blocks: 100, perfect: 0 }, 3_000)).toBe(
      false,
    );
    expect(isPlausible({ game: 'tower-builder', blocks: 5, perfect: 2 }, 30_000)).toBe(
      true,
    );
  });

  it('отклоняет больше точных попаданий, чем блоков', () => {
    expect(isPlausible({ game: 'tower-builder', blocks: 3, perfect: 9 }, 30_000)).toBe(
      false,
    );
  });

  it('отклоняет память, пройденную мгновенно', () => {
    expect(isPlausible({ game: 'memory', rounds: 20 }, 4_000)).toBe(false);
    expect(isPlausible({ game: 'memory', rounds: 3 }, 30_000)).toBe(true);
  });
});
