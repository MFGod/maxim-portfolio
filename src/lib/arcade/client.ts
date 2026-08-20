import type { GameId, LeaderboardView, RunReport } from './types';

/** Сколько строк показывает таблица. */
export const TOP_LIMIT = 10;

const BASE = '/api/arcade';

/** Причина отказа. Различаются те, на которые человек может повлиять. */
export type ArcadeFailure = 'name' | 'rejected' | 'rate-limit' | 'unavailable';

export class ArcadeError extends Error {
  readonly reason: ArcadeFailure;

  constructor(reason: ArcadeFailure) {
    super(reason);
    this.name = 'ArcadeError';
    this.reason = reason;
  }
}

function failureOf(status: number, code: unknown): ArcadeFailure {
  if (code === 'invalid-name') return 'name';
  if (status === 429) return 'rate-limit';
  if (status === 400 || status === 403) return 'rejected';
  return 'unavailable';
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ArcadeError('unavailable');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const code = (payload as { error?: unknown } | null)?.error;
    throw new ArcadeError(failureOf(response.status, code));
  }

  return payload as T;
}

/** Токен запуска. Без него результат не примут. */
export async function openRun(game: GameId, signal?: AbortSignal): Promise<string> {
  const { token } = await request<{ token: string }>('/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game }),
    signal,
  });
  return token;
}

export function loadLeaderboard(
  game: GameId,
  signal?: AbortSignal,
): Promise<LeaderboardView> {
  return request<LeaderboardView>(`/leaderboard?game=${game}`, {
    method: 'GET',
    signal,
  });
}

export function submitRun(
  input: { token: string; name: string; run: RunReport },
  signal?: AbortSignal,
): Promise<LeaderboardView> {
  return request<LeaderboardView>('/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
}
