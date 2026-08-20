'use client';

import { useTranslate } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useSetting } from '@/lib/settings';
import type { LeaderboardView } from '@/lib/arcade/types';

export type BoardState =
  | { status: 'loading' }
  | { status: 'ready'; view: LeaderboardView }
  | { status: 'error' };

/** Свой результат, чтобы подсветить строку или показать её отдельно. */
export type OwnResult = { id: string | null; score: number; rank: number | null };

export function Leaderboard({
  state,
  own,
  onRetry,
}: {
  state: BoardState;
  own: OwnResult | null;
  onRetry: () => void;
}) {
  const t = useTranslate();
  const locale = useSetting((settings) => settings.language);

  return (
    <section
      aria-label={t('arcade.board.title')}
      className="flex min-h-0 flex-col gap-3 p-4"
    >
      <h3 className="text-ink font-display shrink-0 text-sm tracking-[0.16em] uppercase">
        {t('arcade.board.title')}
      </h3>

      {state.status === 'loading' ? (
        <p className="text-ink-faint text-xs">{t('arcade.board.loading')}</p>
      ) : null}

      {state.status === 'error' ? (
        <div className="space-y-2">
          <p className="text-ink-muted text-xs">{t('arcade.board.error')}</p>
          <button
            type="button"
            onClick={onRetry}
            className="border-line text-ink-muted hover:border-accent-dim hover:text-accent rounded-md border px-2.5 py-1 text-xs transition-colors duration-(--duration-fast)"
          >
            {t('arcade.board.retry')}
          </button>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <Table view={state.view} own={own} locale={locale} />
      ) : null}
    </section>
  );
}

function Table({
  view,
  own,
  locale,
}: {
  view: LeaderboardView;
  own: OwnResult | null;
  locale: 'ru' | 'en';
}) {
  const t = useTranslate();
  const formatter = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
  });

  const listed = own?.id ? view.entries.some((entry) => entry.id === own.id) : false;

  if (view.entries.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-ink-faint text-xs">{t('arcade.board.empty')}</p>
        {view.persistent ? null : <VolatileNotice />}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="min-h-0 scrollbar-thin overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-2xs text-ink-faint text-left font-mono uppercase">
              <th scope="col" className="w-8 pb-1.5 font-normal">
                {t('arcade.board.rank')}
              </th>
              <th scope="col" className="pb-1.5 font-normal">
                {t('arcade.board.player')}
              </th>
              <th scope="col" className="pb-1.5 text-right font-normal">
                {t('arcade.board.score')}
              </th>
              <th scope="col" className="w-12 pb-1.5 text-right font-normal">
                {t('arcade.board.date')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-line-subtle divide-y">
            {view.entries.map((entry, index) => {
              const isOwn = own?.id === entry.id;
              return (
                <tr
                  key={entry.id}
                  className={cn(
                    'transition-colors duration-(--duration-fast)',
                    isOwn && 'bg-accent-wash',
                  )}
                >
                  <td
                    className={cn(
                      'py-1.5 font-mono tabular-nums',
                      index === 0 ? 'text-accent' : 'text-ink-faint',
                    )}
                  >
                    {index + 1}
                  </td>
                  <td
                    className={cn(
                      'max-w-0 truncate py-1.5 pr-2',
                      isOwn ? 'text-accent' : 'text-ink',
                    )}
                  >
                    {entry.name}
                  </td>
                  <td className="text-ink py-1.5 text-right font-mono tabular-nums">
                    {entry.score}
                  </td>
                  <td className="text-ink-faint py-1.5 text-right font-mono">
                    {formatter.format(entry.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {own && own.id && !listed ? (
        <div className="border-accent-dim/40 bg-accent-wash flex items-baseline gap-2 rounded-md border px-2.5 py-1.5">
          <span className="text-2xs text-ink-faint shrink-0 font-mono uppercase">
            {t('arcade.board.you')}
          </span>
          <span className="text-accent flex-1 text-right font-mono text-xs tabular-nums">
            {own.rank === null ? t('arcade.result.outsideTop') : `#${own.rank}`} ·{' '}
            {own.score}
          </span>
        </div>
      ) : null}

      {view.persistent ? null : <VolatileNotice />}
    </div>
  );
}

function VolatileNotice() {
  const t = useTranslate();
  return <p className="text-2xs text-ink-faint">{t('arcade.board.volatile')}</p>;
}
