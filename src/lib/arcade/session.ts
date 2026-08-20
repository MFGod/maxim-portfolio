import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import { isGameId, type GameId } from './types';

/** Токен живёт дольше самой долгой партии, но не бесконечно. */
const TOKEN_TTL_MS = 20 * 60_000;

const DEVELOPMENT_SECRET = 'arcade-development-secret';

export type RunToken = { game: GameId; nonce: string; issuedAt: number };

/**
 * Ключ подписи. В проде его отсутствие — не повод молча пускать любые очки:
 * лучше отказать с внятной причиной.
 */
function signingSecret(): string {
  const secret = process.env.ARCADE_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ARCADE_SECRET не задан: подписывать запуски нечем');
  }
  return DEVELOPMENT_SECRET;
}

function sign(payload: string): string {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Токен запуска: выдаётся перед партией и предъявляется при отправке. Держит
 * время старта — по нему сервер знает длительность забега, не веря клиенту.
 */
export function issueToken(game: GameId, now = Date.now()): string {
  const payload = `${game}.${randomUUID()}.${now}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: unknown, now = Date.now()): RunToken | null {
  if (typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 4) return null;

  const [game, nonce, issued, signature] = parts;
  if (!game || !nonce || !issued || !signature) return null;
  if (!isGameId(game)) return null;
  if (!equal(signature, sign(`${game}.${nonce}.${issued}`))) return null;

  const issuedAt = Number(issued);
  if (!Number.isInteger(issuedAt)) return null;

  const age = now - issuedAt;
  if (age < 0 || age > TOKEN_TTL_MS) return null;

  return { game, nonce, issuedAt };
}
