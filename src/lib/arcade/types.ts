export const GAME_IDS = ['three-in-row', 'tower-builder', 'memory'] as const;

export type GameId = (typeof GAME_IDS)[number];

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}

/**
 * Отчёт о забеге. Клиент присылает не очки, а сырые показатели: очки —
 * производная, и считает её сервер.
 */
export type Match3Run = {
  game: 'three-in-row';
  /** Каждая сложившаяся линия: длина и номер каскада, начиная с нуля. */
  matches: { size: number; cascade: number }[];
};

export type TowerRun = {
  game: 'tower-builder';
  blocks: number;
  /** Блоки, легшие без свеса. */
  perfect: number;
};

export type MemoryRun = {
  game: 'memory';
  rounds: number;
};

export type RunReport = Match3Run | TowerRun | MemoryRun;

export type ScoreEntry = {
  id: string;
  name: string;
  score: number;
  createdAt: number;
};

export type LeaderboardView = {
  entries: ScoreEntry[];
  total: number;
  /** Место только что отправленного результата. `null` — таблицу просто читали. */
  rank: number | null;
  /** Идентификатор своей записи: по нему подсвечивается строка. */
  entryId: string | null;
  /** Хранилище переживает перезапуск. Ложь — работает запасной драйвер в памяти. */
  persistent: boolean;
};
