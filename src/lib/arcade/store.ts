import type { GameId, ScoreEntry } from './types';

/** Сколько результатов на игру хранится. Показываем десять, держим запас. */
const BOARD_CAPACITY = 100;
/** Отправок с одного адреса в минуту. */
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;
/** Одноразовость запуска переживает самую долгую партию. */
const NONCE_TTL_SECONDS = 30 * 60;

export type ArcadeStore = {
  /** Ложь — работает запасной драйвер в памяти, таблица не переживёт перезапуск. */
  readonly persistent: boolean;
  top(game: GameId, limit: number): Promise<ScoreEntry[]>;
  total(game: GameId): Promise<number>;
  /**
   * Записывает результат и возвращает занятое место, начиная с первого.
   * `null` — результат не попал даже в хранимый запас.
   */
  submit(game: GameId, entry: ScoreEntry): Promise<number | null>;
  /** Гасит запуск. Ложь — этот токен уже предъявляли. */
  claimNonce(nonce: string): Promise<boolean>;
  /** Ложь — лимит отправок исчерпан. */
  withinRateLimit(key: string): Promise<boolean>;
};

const boardKey = (game: GameId) => `arcade:board:${game}`;

function encode(entry: ScoreEntry): string {
  return JSON.stringify({ id: entry.id, name: entry.name, at: entry.createdAt });
}

function decode(member: string, score: number): ScoreEntry | null {
  try {
    const parsed: unknown = JSON.parse(member);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { id, name, at } = parsed as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string') return null;
    return {
      id,
      name,
      score,
      createdAt: typeof at === 'number' ? at : 0,
    };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Upstash Redis по REST: обычный fetch, без клиентской библиотеки             */
/* -------------------------------------------------------------------------- */

type UpstashConfig = { url: string; token: string };

function upstashConfig(): UpstashConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

function createUpstashStore({ url, token }: UpstashConfig): ArcadeStore {
  const run = async (commands: (string | number)[][]): Promise<unknown[]> => {
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Upstash ответил ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error('Upstash вернул неожиданный ответ');

    return payload.map((item) => {
      const fields = item as { result?: unknown; error?: unknown };
      if (typeof fields.error === 'string') throw new Error(fields.error);
      return fields.result;
    });
  };

  /** `ZRANGE … WITHSCORES` отдаёт плоский список: элемент, его очки, элемент… */
  const readPairs = (raw: unknown): ScoreEntry[] => {
    if (!Array.isArray(raw)) return [];
    const entries: ScoreEntry[] = [];
    for (let index = 0; index + 1 < raw.length; index += 2) {
      const member = raw[index];
      const score = Number(raw[index + 1]);
      if (typeof member !== 'string' || !Number.isFinite(score)) continue;
      const entry = decode(member, score);
      if (entry) entries.push(entry);
    }
    return entries;
  };

  return {
    persistent: true,

    async top(game, limit) {
      const [raw] = await run([
        ['ZRANGE', boardKey(game), 0, limit - 1, 'REV', 'WITHSCORES'],
      ]);
      return readPairs(raw);
    },

    async total(game) {
      const [raw] = await run([['ZCARD', boardKey(game)]]);
      return Number(raw) || 0;
    },

    async submit(game, entry) {
      const key = boardKey(game);
      const member = encode(entry);
      const [, , rank] = await run([
        ['ZADD', key, entry.score, member],
        ['ZREMRANGEBYRANK', key, 0, -(BOARD_CAPACITY + 1)],
        ['ZREVRANK', key, member],
      ]);
      // Вылетел из запаса сразу после записи — места в таблице у него нет.
      return typeof rank === 'number' ? rank + 1 : null;
    },

    async claimNonce(nonce) {
      const [result] = await run([
        ['SET', `arcade:nonce:${nonce}`, 1, 'NX', 'EX', NONCE_TTL_SECONDS],
      ]);
      return result === 'OK';
    },

    async withinRateLimit(key) {
      const counter = `arcade:rate:${key}`;
      const [hits] = await run([['INCR', counter]]);
      const count = Number(hits) || 0;
      if (count === 1) await run([['EXPIRE', counter, RATE_WINDOW_SECONDS]]);
      return count <= RATE_LIMIT;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Запасной драйвер: держит таблицу в памяти инстанса                          */
/* -------------------------------------------------------------------------- */

function createMemoryStore(): ArcadeStore {
  const boards = new Map<GameId, ScoreEntry[]>();
  const expiries = new Map<string, number>();

  const boardOf = (game: GameId): ScoreEntry[] => {
    const existing = boards.get(game);
    if (existing) return existing;
    const created: ScoreEntry[] = [];
    boards.set(game, created);
    return created;
  };

  /** Одна карта на одноразовые запуски и счётчики: у обеих ролей есть срок. */
  const alive = (key: string): boolean => {
    const expiresAt = expiries.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt > Date.now()) return true;
    expiries.delete(key);
    return false;
  };

  const counters = new Map<string, number>();

  return {
    persistent: false,

    async top(game, limit) {
      return boardOf(game).slice(0, limit);
    },

    async total(game) {
      return boardOf(game).length;
    },

    async submit(game, entry) {
      const board = boardOf(game);
      board.push(entry);
      board.sort((left, right) => right.score - left.score);
      board.length = Math.min(board.length, BOARD_CAPACITY);
      const index = board.findIndex((candidate) => candidate.id === entry.id);
      return index === -1 ? null : index + 1;
    },

    async claimNonce(nonce) {
      const key = `nonce:${nonce}`;
      if (alive(key)) return false;
      expiries.set(key, Date.now() + NONCE_TTL_SECONDS * 1000);
      return true;
    },

    async withinRateLimit(key) {
      const counter = `rate:${key}`;
      if (!alive(counter)) {
        counters.set(counter, 0);
        expiries.set(counter, Date.now() + RATE_WINDOW_SECONDS * 1000);
      }
      const count = (counters.get(counter) ?? 0) + 1;
      counters.set(counter, count);
      return count <= RATE_LIMIT;
    },
  };
}

const config = upstashConfig();

/**
 * Драйвер выбирается один раз при загрузке модуля. Без переменных Upstash
 * аркада работает целиком, но таблица результатов живёт до перезапуска
 * инстанса — об этом честно говорит `persistent`.
 */
export const arcadeStore: ArcadeStore = config
  ? createUpstashStore(config)
  : createMemoryStore();
