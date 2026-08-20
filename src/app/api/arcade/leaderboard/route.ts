import { TOP_LIMIT } from '@/lib/arcade/client';
import { arcadeStore } from '@/lib/arcade/store';
import { isGameId, type LeaderboardView } from '@/lib/arcade/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const game = new URL(request.url).searchParams.get('game');

  if (!isGameId(game)) {
    return Response.json({ error: 'unknown-game' }, { status: 400 });
  }

  try {
    const [entries, total] = await Promise.all([
      arcadeStore.top(game, TOP_LIMIT),
      arcadeStore.total(game),
    ]);

    const view: LeaderboardView = {
      entries,
      total,
      rank: null,
      entryId: null,
      persistent: arcadeStore.persistent,
    };
    return Response.json(view);
  } catch (error) {
    console.error('[arcade] таблица результатов недоступна', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
}
