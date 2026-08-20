import { describe, expect, it } from 'vitest';

import {
  failureFromResponse,
  parseCache,
  parseRepositories,
  REPOS_CACHE_TTL_MS,
  REPOS_SHOWN,
} from '@/lib/github';

const repo = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'portfolio',
  description: 'Интерактивное портфолио',
  html_url: 'https://github.com/MFGod/portfolio',
  language: 'TypeScript',
  stargazers_count: 3,
  updated_at: '2026-08-01T10:00:00Z',
  fork: false,
  ...overrides,
});

describe('parseRepositories', () => {
  it('разбирает нормальный ответ', () => {
    expect(parseRepositories([repo()])).toEqual([
      {
        id: 1,
        name: 'portfolio',
        description: 'Интерактивное портфолио',
        url: 'https://github.com/MFGod/portfolio',
        language: 'TypeScript',
        stars: 3,
        updatedAt: '2026-08-01T10:00:00Z',
      },
    ]);
  });

  it('не падает на мусоре вместо массива', () => {
    expect(parseRepositories(null)).toEqual([]);
    expect(parseRepositories({ message: 'Not Found' })).toEqual([]);
  });

  it('пропускает форки — это чужая работа', () => {
    expect(parseRepositories([repo({ fork: true })])).toEqual([]);
  });

  it('отбрасывает запись со ссылкой на чужой домен', () => {
    expect(
      parseRepositories([repo({ html_url: 'https://evil.example/MFGod' })]),
    ).toEqual([]);
  });

  it('обрезает слишком длинное описание', () => {
    const [parsed] = parseRepositories([repo({ description: 'а'.repeat(400) })]);
    expect(parsed!.description).toHaveLength(160);
    expect(parsed!.description!.endsWith('…')).toBe(true);
  });

  it('показывает не больше витрины', () => {
    const many = Array.from({ length: 20 }, (_, index) => repo({ id: index }));
    expect(parseRepositories(many)).toHaveLength(REPOS_SHOWN);
  });
});

describe('parseCache', () => {
  const now = 1_000_000;
  const cached = JSON.stringify({ fetchedAt: now, repositories: [repo()] });

  it('возвращает свежий кэш', () => {
    expect(parseCache(cached, now + 1000)).toHaveLength(1);
  });

  it('протухший кэш не используется', () => {
    expect(parseCache(cached, now + REPOS_CACHE_TTL_MS + 1)).toBeNull();
  });

  it('битое хранилище не роняет окно', () => {
    expect(parseCache('{не json', now)).toBeNull();
    expect(parseCache(null, now)).toBeNull();
    expect(parseCache(JSON.stringify({ repositories: [] }), now)).toBeNull();
  });
});

describe('failureFromResponse', () => {
  it('исчерпанный лимит отличается от сетевой ошибки', () => {
    expect(failureFromResponse(403, '0')).toBe('rate-limit');
    expect(failureFromResponse(403, '12')).toBe('network');
    expect(failureFromResponse(500, null)).toBe('network');
  });
});
