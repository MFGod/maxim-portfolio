import { randomUUID } from 'node:crypto';

import { TOP_LIMIT } from '@/lib/arcade/client';
import { isPlausible, scoreOf } from '@/lib/arcade/scoring';
import { verifyToken } from '@/lib/arcade/session';
import { arcadeStore } from '@/lib/arcade/store';
import type { LeaderboardView, ScoreEntry } from '@/lib/arcade/types';
import { parseRun, sanitizeName } from '@/lib/arcade/validate';

export const dynamic = 'force-dynamic';

/** Адрес отправителя для счётчика частоты. За прокси — первый в цепочке. */
function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || 'unknown';
}

function reject(error: string, status: number) {
  return Response.json({ error }, { status });
}

/**
 * Приём результата. Клиент присылает показатели забега, а не очки: счёт —
 * производная от них, и считает её этот обработчик.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return reject('malformed', 400);
  }

  const { token, name, run } = body as Record<string, unknown>;

  const session = verifyToken(token);
  if (!session) return reject('invalid-token', 403);

  const player = sanitizeName(name);
  if (!player) return reject('invalid-name', 400);

  const report = parseRun(session.game, run);
  if (!report) return reject('malformed', 400);

  if (!isPlausible(report, Date.now() - session.issuedAt)) {
    return reject('implausible', 403);
  }

  const score = scoreOf(report);
  if (score <= 0) return reject('implausible', 403);

  try {
    if (!(await arcadeStore.withinRateLimit(clientKey(request)))) {
      return reject('rate-limit', 429);
    }

    // Токен одноразовый: один запуск — один результат в таблице.
    if (!(await arcadeStore.claimNonce(session.nonce))) {
      return reject('already-submitted', 403);
    }

    const entry: ScoreEntry = {
      id: randomUUID(),
      name: player,
      score,
      createdAt: Date.now(),
    };

    const rank = await arcadeStore.submit(session.game, entry);
    const [entries, total] = await Promise.all([
      arcadeStore.top(session.game, TOP_LIMIT),
      arcadeStore.total(session.game),
    ]);

    const view: LeaderboardView = {
      entries,
      total,
      rank,
      entryId: entry.id,
      persistent: arcadeStore.persistent,
    };
    return Response.json(view);
  } catch (error) {
    console.error('[arcade] не удалось записать результат', error);
    return reject('unavailable', 503);
  }
}
