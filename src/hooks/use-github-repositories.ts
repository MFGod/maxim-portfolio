'use client';

import { useEffect, useState } from 'react';

import {
  failureFromResponse,
  parseCache,
  parseRepositories,
  GITHUB_REPOS_URL,
  REPOS_CACHE_KEY,
  type GithubFailure,
  type Repository,
} from '@/lib/github';

type GithubState =
  | { status: 'loading' }
  | { status: 'ready'; repositories: Repository[] }
  | { status: 'error'; reason: GithubFailure };

/** Недоступное хранилище (приватный режим) не должно ронять окно. */
function readCache(): Repository[] | null {
  try {
    return parseCache(sessionStorage.getItem(REPOS_CACHE_KEY), Date.now());
  } catch {
    return null;
  }
}

function writeCache(repositories: Repository[]): void {
  try {
    sessionStorage.setItem(
      REPOS_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), repositories }),
    );
  } catch {}
}

/**
 * Репозитории с GitHub. Запрос не критичен: при любой ошибке окно работает
 * и показывает прямую ссылку на профиль.
 */
export function useGithubRepositories(): GithubState {
  const [state, setState] = useState<GithubState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      const cached = readCache();
      if (cached) {
        setState({ status: 'ready', repositories: cached });
        return;
      }

      try {
        const response = await fetch(GITHUB_REPOS_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/vnd.github+json' },
        });

        if (!response.ok) {
          setState({
            status: 'error',
            reason: failureFromResponse(
              response.status,
              response.headers.get('x-ratelimit-remaining'),
            ),
          });
          return;
        }

        const repositories = parseRepositories(await response.json());
        if (repositories.length === 0) {
          setState({ status: 'error', reason: 'empty' });
          return;
        }

        writeCache(repositories);
        setState({ status: 'ready', repositories });
      } catch {
        if (controller.signal.aborted) return;
        setState({ status: 'error', reason: 'network' });
      }
    };

    void load();
    return () => controller.abort();
  }, []);

  return state;
}
