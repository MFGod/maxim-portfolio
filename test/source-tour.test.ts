import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOURCE_GROUPS, sourceTour } from '@/data/source-tour';

const root = resolve(__dirname, '..');

/** Тот же сдвиг, что применён при подготовке фрагмента: общий отступ убран. */
function dedent(code: string): string {
  const lines = code.split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.length - line.trimStart().length);
  const shift = indents.length > 0 ? Math.min(...indents) : 0;
  return lines
    .map((line) => (line.trim() === '' ? line : line.slice(shift)))
    .join('\n');
}

/**
 * Ищет фрагмент в файле по содержимому: берёт окно той же высоты на каждой
 * строке и сравнивает после дедента. Номер строки не хранится нигде — правка
 * выше по файлу сдвигает фрагмент, но не ломает витрину.
 *
 * Возвращает номер первой строки найденного фрагмента или `null`.
 */
function findExcerpt(path: string, excerpt: string): number | null {
  const fileLines = readFileSync(resolve(root, path), 'utf8').split('\n');
  const height = excerpt.split('\n').length;

  for (let start = 0; start + height <= fileLines.length; start += 1) {
    const window = fileLines.slice(start, start + height).join('\n');
    if (dedent(window) === excerpt) return start + 1;
  }
  return null;
}

describe('sourceTour', () => {
  it.each(sourceTour.map((entry) => [entry.id, entry] as const))(
    '%s показывает код, который есть в файле',
    (_id, entry) => {
      expect(findExcerpt(entry.path, entry.code)).not.toBeNull();
    },
  );

  it('фрагмент встречается в файле ровно один раз — иначе показан не тот код', () => {
    for (const entry of sourceTour) {
      const fileLines = readFileSync(resolve(root, entry.path), 'utf8').split('\n');
      const height = entry.code.split('\n').length;
      let hits = 0;
      for (let start = 0; start + height <= fileLines.length; start += 1) {
        if (dedent(fileLines.slice(start, start + height).join('\n')) === entry.code) {
          hits += 1;
        }
      }
      expect(hits, entry.id).toBe(1);
    }
  });

  it('каждая запись объясняет, что это и зачем', () => {
    for (const entry of sourceTour) {
      expect(entry.purpose.length).toBeGreaterThan(20);
      expect(entry.note.length).toBeGreaterThan(20);
      expect(entry.responsibilities.length).toBeGreaterThan(0);
    }
  });

  it('идентификаторы уникальны — по ним выбирается файл в окне', () => {
    const ids = sourceTour.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('группа записи существует в списке разделов', () => {
    const groups = new Set(SOURCE_GROUPS.map((group) => group.id));
    for (const entry of sourceTour) expect(groups.has(entry.group)).toBe(true);
  });
});
