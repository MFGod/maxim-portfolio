import { describe, expect, it } from 'vitest';

import {
  durationInMonths,
  formatAge,
  formatCount,
  formatDuration,
  formatPeriod,
  formatTimestamp,
  formatYears,
} from '@/lib/format';

describe('formatPeriod', () => {
  it('раскрывает месяцы по-русски', () => {
    expect(formatPeriod({ from: '2024-05', to: '2025-04' })).toBe(
      'май 2024 — апрель 2025',
    );
  });

  it('открытый период читается как «настоящее время»', () => {
    expect(formatPeriod({ from: '2025-04', to: null })).toBe(
      'апрель 2025 — настоящее время',
    );
  });
});

describe('formatYears', () => {
  it('схлопывает период внутри одного года', () => {
    expect(formatYears({ from: '2022-01', to: '2022-11' })).toBe('2022');
  });

  it('текущее место помечает как «сейчас»', () => {
    expect(formatYears({ from: '2025-04', to: null })).toBe('2025 — сейчас');
  });
});

describe('durationInMonths', () => {
  it('считает закрытый период', () => {
    expect(durationInMonths({ from: '2024-05', to: '2025-04' })).toBe(11);
  });

  it('открытый период считает от переданной даты', () => {
    const now = new Date('2026-08-18T00:00:00Z');
    expect(durationInMonths({ from: '2025-04', to: null }, now)).toBe(16);
  });
});

describe('formatDuration', () => {
  it.each([
    [1, '1 месяц'],
    [3, '3 месяца'],
    [11, '11 месяцев'],
    [12, '1 год'],
    [16, '1 год 4 месяца'],
    [25, '2 года 1 месяц'],
    [60, '5 лет'],
  ])('склоняет %i месяцев как «%s»', (months, expected) => {
    expect(formatDuration(months)).toBe(expected);
  });

  it('нулевую длительность не выводит пустой строкой', () => {
    expect(formatDuration(0)).toBe('меньше месяца');
  });
});

describe('formatAge', () => {
  it('склоняет возраст, а не печатает «26 года»', () => {
    expect(formatAge(26)).toBe('26 лет');
    expect(formatAge(21)).toBe('21 год');
    expect(formatAge(22)).toBe('22 года');
    expect(formatAge(11)).toBe('11 лет');
  });
});

describe('formatCount', () => {
  const forms: [string, string, string] = ['программа', 'программы', 'программ'];

  it('склоняет счётчик по числу', () => {
    expect(formatCount(1, forms)).toBe('1 программа');
    expect(formatCount(3, forms)).toBe('3 программы');
    expect(formatCount(12, forms)).toBe('12 программ');
  });
});

describe('formatTimestamp', () => {
  it('пишет дату и время фиксированной ширины', () => {
    const moment = new Date(2026, 7, 20, 9, 5).getTime();
    expect(formatTimestamp(moment)).toBe('20.08.2026 09:05');
  });

  it('двузначные части не теряют цифр', () => {
    const moment = new Date(2026, 10, 12, 21, 45).getTime();
    expect(formatTimestamp(moment)).toBe('12.11.2026 21:45');
  });

  it('нечисло превращается в прочерк, а не в «Invalid Date»', () => {
    expect(formatTimestamp(Number.NaN)).toBe('—');
  });
});
