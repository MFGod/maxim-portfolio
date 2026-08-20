'use client';

import { Star } from 'lucide-react';

import { GithubMark } from '@/components/ui/brand-icons';
import { AppBody, LinkOut, Section } from '@/components/ui/primitives';
import { profile } from '@/data/profile';
import { useGithubRepositories } from '@/hooks/use-github-repositories';
import { GITHUB_LOGIN, type GithubFailure, type Repository } from '@/lib/github';

const PROFILE_URL = `https://github.com/${GITHUB_LOGIN}`;

const FAILURE_TEXT: Record<GithubFailure, string> = {
  'rate-limit': 'Исчерпан лимит запросов к GitHub. Список открывается на профиле.',
  network: 'GitHub не ответил. Список открывается на профиле.',
  empty: 'Публичных репозиториев в ответе нет.',
};

export function GithubApp() {
  const state = useGithubRepositories();
  const contact = profile.contacts.find((entry) => entry.kind === 'github');

  return (
    <AppBody>
      <div className="flex items-center gap-3.5">
        <span className="border-line-subtle bg-surface-2 text-ink grid size-11 shrink-0 place-items-center rounded-xl border">
          <GithubMark aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-ink text-lg font-semibold tracking-tight">
            github.com/{GITHUB_LOGIN}
          </h2>
          <p className="text-ink-muted text-sm">
            {contact?.hint ?? 'Открытый код и инструменты.'}
          </p>
        </div>
      </div>

      <Section title="Репозитории" className="mt-7">
        {state.status === 'loading' ? (
          <p className="text-ink-faint text-sm">Загружаю список с GitHub…</p>
        ) : null}

        {state.status === 'error' ? (
          <p className="text-ink-muted text-sm">{FAILURE_TEXT[state.reason]}</p>
        ) : null}

        {state.status === 'ready' ? (
          <ul className="divide-line-subtle border-line-subtle divide-y rounded-lg border">
            {state.repositories.map((repository) => (
              <RepositoryRow key={repository.id} repository={repository} />
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Профиль">
        <LinkOut href={PROFILE_URL}>Открыть профиль на GitHub</LinkOut>
      </Section>
    </AppBody>
  );
}

function RepositoryRow({ repository }: { repository: Repository }) {
  return (
    <li>
      <a
        href={repository.url}
        target="_blank"
        rel="noreferrer noopener"
        className="group hover:bg-surface-2 kbd-focus:bg-surface-2 block px-3 py-2.5 transition-colors duration-(--duration-fast)"
      >
        <span className="flex items-baseline gap-3">
          <span className="text-ink group-hover:text-accent min-w-0 flex-1 truncate text-sm font-medium">
            {repository.name}
          </span>
          {repository.stars > 0 ? (
            <span className="text-2xs text-ink-faint flex shrink-0 items-center gap-1 font-mono tabular-nums">
              <Star aria-hidden className="size-3" />
              {repository.stars}
            </span>
          ) : null}
          {repository.language ? (
            <span className="text-2xs text-ink-faint shrink-0 font-mono">
              {repository.language}
            </span>
          ) : null}
        </span>
        {repository.description ? (
          <span className="text-ink-muted mt-1 block text-xs">
            {repository.description}
          </span>
        ) : null}
      </a>
    </li>
  );
}
