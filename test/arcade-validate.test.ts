import { describe, expect, it } from 'vitest';

import { NAME_MAX_LENGTH, parseRun, sanitizeName } from '@/lib/arcade/validate';

describe('имя игрока', () => {
  it('оставляет буквы, цифры и разделители', () => {
    expect(sanitizeName('Максим_1')).toBe('Максим_1');
    expect(sanitizeName('Alex Doe')).toBe('Alex Doe');
  });

  it('схлопывает пробелы и обрезает края', () => {
    expect(sanitizeName('  Max   Power  ')).toBe('Max Power');
  });

  it('вырезает разметку, невидимые символы и эмодзи', () => {
    expect(sanitizeName('<b>Max</b>')).toBe('bMaxb');
    expect(sanitizeName('Max\u200B')).toBe('Max');
    expect(sanitizeName('Max \u{1F525}')).toBe('Max');
  });

  it('обрезает длину', () => {
    expect(sanitizeName('a'.repeat(50))).toHaveLength(NAME_MAX_LENGTH);
  });

  it('отклоняет пустое и слишком короткое', () => {
    expect(sanitizeName('')).toBeNull();
    expect(sanitizeName('   ')).toBeNull();
    expect(sanitizeName('a')).toBeNull();
    expect(sanitizeName('\u{1F525}')).toBeNull();
    expect(sanitizeName(42)).toBeNull();
    expect(sanitizeName(null)).toBeNull();
  });
});

describe('разбор отчёта о забеге', () => {
  it('читает линии «Трёх в ряд»', () => {
    expect(parseRun('three-in-row', { matches: [{ size: 3, cascade: 0 }] })).toEqual({
      game: 'three-in-row',
      matches: [{ size: 3, cascade: 0 }],
    });
  });

  it('игнорирует поля, которых нет в типе', () => {
    expect(parseRun('memory', { rounds: 4, score: 99_999 })).toEqual({
      game: 'memory',
      rounds: 4,
    });
  });

  it('отклоняет дробные и отрицательные значения', () => {
    expect(parseRun('memory', { rounds: 1.5 })).toBeNull();
    expect(parseRun('tower-builder', { blocks: -1, perfect: 0 })).toBeNull();
  });

  it('отклоняет мусор вместо тела', () => {
    expect(parseRun('memory', null)).toBeNull();
    expect(parseRun('memory', 'rounds=4')).toBeNull();
    expect(parseRun('three-in-row', { matches: 'many' })).toBeNull();
    expect(
      parseRun('three-in-row', { matches: [{ size: '3', cascade: 0 }] }),
    ).toBeNull();
  });

  it('отклоняет список линий сверх разумного', () => {
    const matches = Array.from({ length: 401 }, () => ({ size: 3, cascade: 0 }));
    expect(parseRun('three-in-row', { matches })).toBeNull();
  });
});
