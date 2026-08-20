'use client';

import { ChevronLeft, Home } from 'lucide-react';

import {
  AppContent,
  appHint,
  appTitle,
  labelOf,
} from '@/components/applications/app-registry';
import { CloseConfirmDialog } from '@/components/window/close-confirm-dialog';
import { applications, launcherOrder, type AppId } from '@/data/applications';
import { profile } from '@/data/profile';
import { useUrlSync } from '@/hooks/use-url-sync';
import { cn } from '@/lib/cn';
import { Ornament } from '@/components/desktop/ornament';
import { useSetting } from '@/lib/settings';
import type { Locale } from '@/lib/settings/types';
import { useWindowManager } from '@/lib/window-manager';

/** Разделы нижней навигации. «Главная» — стартовый экран, окна для неё нет. */
const tabs: AppId[] = ['resume', 'projects', 'experience', 'contact'];

export function MobileShell() {
  const { state, open, closeAll } = useWindowManager();
  const locale = useSetting((settings) => settings.language);
  const active = state.focusedId ? state.windows[state.focusedId] : null;

  useUrlSync();

  return (
    <div className="bg-surface-0 flex h-dvh flex-col">
      {active ? (
        <>
          <header className="border-line-subtle bg-surface-1 flex h-13 shrink-0 items-center gap-2 border-b px-3">
            <button
              type="button"
              onClick={closeAll}
              aria-label="Назад на главную"
              className="border-line-subtle text-ink-muted grid size-9 shrink-0 place-items-center rounded-md border"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <h2 className="text-ink truncate text-sm font-medium">
              {labelOf(active, locale).title}
            </h2>
          </header>

          <main className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
            <AppContent instance={active} />
          </main>
        </>
      ) : (
        <MobileHome onOpen={open} locale={locale} />
      )}

      <nav
        aria-label="Разделы"
        className="border-line-subtle bg-surface-1 flex shrink-0 items-stretch border-t pb-[env(safe-area-inset-bottom)]"
      >
        <TabButton label="Главная" icon={Home} isActive={!active} onSelect={closeAll} />
        {tabs.map((id) => (
          <TabButton
            key={id}
            label={appTitle(id, locale)}
            icon={applications[id].icon}
            isActive={active?.app === id}
            onSelect={() => open(id)}
          />
        ))}
      </nav>

      <CloseConfirmDialog />
    </div>
  );
}

function TabButton({
  label,
  icon: Icon,
  isActive,
  onSelect,
}: {
  label: string;
  icon: (typeof applications)[AppId]['icon'];
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive || undefined}
      className={cn(
        'relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] transition-colors duration-(--duration-fast)',
        isActive ? 'text-accent' : 'text-ink-faint',
      )}
    >
      {isActive ? (
        <span
          aria-hidden
          className="bg-accent absolute inset-x-0 top-0 mx-auto h-px w-8 shadow-(--glow-soft)"
        />
      ) : null}
      <Icon aria-hidden className="size-5" strokeWidth={1.5} />
      {label}
    </button>
  );
}

/** Стартовый экран: имя, роль и полный список разделов. */
function MobileHome({
  onOpen,
  locale,
}: {
  onOpen: (app: AppId) => void;
  locale: Locale;
}) {
  return (
    <main className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
      <div className="border-line-subtle relative overflow-hidden border-b px-6 pt-12 pb-9">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: 'var(--wp-base)' }}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: 'var(--wp-rays)' }}
        />

        <div className="relative">
          <h1 className="text-gilded font-display text-3xl leading-tight">
            {profile.name}
          </h1>
          <p className="text-accent text-2xs mt-2 tracking-[0.2em] uppercase">
            {profile.role}
          </p>
          <Ornament className="text-accent-dim mt-4 w-32" />
          <p className="text-ink-muted mt-4 text-sm">{profile.tagline}</p>
        </div>
      </div>

      <ul className="divide-line-subtle divide-y">
        {launcherOrder.map((id) => {
          const app = applications[id];
          const Icon = app.icon;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onOpen(id)}
                className="flex w-full items-center gap-3.5 px-5 py-4 text-left"
              >
                <span className="border-line-subtle bg-surface-2 text-ink-muted grid size-10 shrink-0 place-items-center rounded-lg border">
                  <Icon aria-hidden className="size-4.5" strokeWidth={1.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block text-sm font-medium">
                    {appTitle(id, locale)}
                  </span>
                  <span className="text-ink-faint block truncate text-xs">
                    {appHint(id, locale)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
