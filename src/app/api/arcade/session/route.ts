import { issueToken } from '@/lib/arcade/session';
import { isGameId } from '@/lib/arcade/types';

export const dynamic = 'force-dynamic';

/** Открывает забег: клиент получает подписанный токен со временем старта. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const game = (body as { game?: unknown } | null)?.game;

  if (!isGameId(game)) {
    return Response.json({ error: 'unknown-game' }, { status: 400 });
  }

  try {
    return Response.json({ token: issueToken(game) });
  } catch (error) {
    console.error('[arcade] не удалось подписать запуск', error);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
}
