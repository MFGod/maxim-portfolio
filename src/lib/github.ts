/**
 * Разбор ответа GitHub API. Формат внешний и ничем не гарантирован, поэтому
 * разбор отделён от компонента и пропускает только известные поля.
 */

export type Repository = {
  id: number;
  name: string;
  description: string | null;
  url: string;
  language: string | null;
  stars: number;
  updatedAt: string;
};

export const GITHUB_LOGIN = 'MFGod';
export const GITHUB_REPOS_URL = `https://api.github.com/users/${GITHUB_LOGIN}/repos?sort=updated&per_page=30`;

/** Сколько репозиториев показываем в окне. */
export const REPOS_SHOWN = 6;

/** Кэш на сессию: повторное открытие окна не тратит лимит запросов. */
export const REPOS_CACHE_KEY = 'portfolio:github-repos';
export const REPOS_CACHE_TTL_MS = 10 * 60 * 1000;

/** Описание в ответе не ограничено по длине, обрезаем под одну строку. */
const DESCRIPTION_LIMIT = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
}

/** Принимает только `https://github.com`: чужой домен из ответа отбрасывается. */
function repositoryUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Ответ API → список репозиториев. Форки отбрасываются. Записи без имени или
 * без валидной ссылки пропускаются молча: одна битая строка не ломает окно.
 */
export function parseRepositories(payload: unknown): Repository[] {
  if (!Array.isArray(payload)) return [];

  const repositories: Repository[] = [];
  for (const entry of payload) {
    if (!isRecord(entry)) continue;
    if (entry.fork === true) continue;

    const name = text(entry.name, 80);
    const url = repositoryUrl(entry.html_url);
    if (!name || !url || typeof entry.id !== 'number') continue;

    repositories.push({
      id: entry.id,
      name,
      description: text(entry.description, DESCRIPTION_LIMIT),
      url,
      language: text(entry.language, 40),
      stars: typeof entry.stargazers_count === 'number' ? entry.stargazers_count : 0,
      updatedAt: typeof entry.updated_at === 'string' ? entry.updated_at : '',
    });
  }

  return repositories.slice(0, REPOS_SHOWN);
}

/** Кэш лежит в sessionStorage, поэтому проверяется так же, как ответ API. */
export function parseCache(raw: string | null, now: number): Repository[] | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.fetchedAt !== 'number') return null;
  if (now - parsed.fetchedAt > REPOS_CACHE_TTL_MS) return null;

  const repositories = parseRepositories(parsed.repositories);
  return repositories.length > 0 ? repositories : null;
}

export type GithubFailure = 'rate-limit' | 'network' | 'empty';

/** Причина отказа по ответу API. Лимит выделен отдельно: он временный. */
export function failureFromResponse(
  status: number,
  remaining: string | null,
): GithubFailure {
  if ((status === 403 || status === 429) && remaining === '0') return 'rate-limit';
  return 'network';
}
