import type { GameId, RunReport } from './types';

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;

/** Больше линий за минуту не сложится: длинный массив дальше не разбираем. */
const MAX_MATCH_EVENTS = 400;

/**
 * Имя игрока — внешние данные, попадающие в публичную таблицу. Оставляем
 * буквы, цифры, пробел, дефис и подчёркивание: разметка, управляющие символы и
 * эмодзи в чужой строке рейтинга не нужны.
 *
 * @returns очищенное имя либо `null`, если после очистки не осталось смысла.
 */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const cleaned = raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length < NAME_MIN_LENGTH) return null;
  return cleaned.slice(0, NAME_MAX_LENGTH);
}

function countOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function fieldsOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Тело запроса → отчёт о забеге. Читаем только известные поля: чего нет в
 * типе, того не будет и в базе.
 */
export function parseRun(game: GameId, raw: unknown): RunReport | null {
  const source = fieldsOf(raw);
  if (!source) return null;

  if (game === 'three-in-row') {
    const { matches } = source;
    if (!Array.isArray(matches) || matches.length > MAX_MATCH_EVENTS) return null;

    const parsed: { size: number; cascade: number }[] = [];
    for (const entry of matches) {
      const fields = fieldsOf(entry);
      if (!fields) return null;
      const size = countOf(fields.size);
      const cascade = countOf(fields.cascade);
      if (size === null || cascade === null) return null;
      parsed.push({ size, cascade });
    }
    return { game, matches: parsed };
  }

  if (game === 'tower-builder') {
    const blocks = countOf(source.blocks);
    const perfect = countOf(source.perfect);
    if (blocks === null || perfect === null) return null;
    return { game, blocks, perfect };
  }

  const rounds = countOf(source.rounds);
  if (rounds === null) return null;
  return { game: 'memory', rounds };
}
