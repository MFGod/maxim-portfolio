'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect } from 'react';

import { markSessionStarted } from '@/hooks/use-boot-sequence';
import { useTranslate } from '@/lib/i18n';
import { DESKTOP_ROUTE } from '@/lib/routes';
import { settingsStore } from '@/lib/settings/store';
import { useWorldSupport } from '@/lib/world/use-world-support';

import { BookContents } from './book-contents';
import { ChapterList, WorldPlan } from './world-plan';

/**
 * Сцена только на клиенте: three и геометрия не должны попадать в бандл тому,
 * кто до неё не дошёл.
 */
const WorldCanvas = dynamic(
  () => import('./world-canvas').then((module) => module.WorldCanvas),
  { ssr: false },
);

/** Точка входа в портфолио — мир на весь экран. */
export function WorldEntry() {
  useEffect(() => {
    settingsStore.hydrate();
    markSessionStarted();
  }, []);

  const t = useTranslate();
  const support = useWorldSupport();

  if (support !== 'ready') {
    return (
      <main className="bg-surface-1 min-h-dvh w-full">
        <div className="mx-auto max-w-3xl px-5 py-10">
          <h1 className="text-ink font-display text-2xl tracking-tight">
            {t('world.screen.title')}
          </h1>
          <p className="text-ink-muted mt-1 text-sm">{t('world.screen.subtitle')}</p>

          <div className="mt-6">
            <WorldPlan support={support} />
          </div>

          <Link
            href={DESKTOP_ROUTE}
            className="border-line text-ink-muted hover:border-accent-dim hover:text-ink mt-6 inline-flex rounded-md border px-4 py-2 text-sm transition-colors duration-(--duration-fast)"
          >
            {t('world.screen.back')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <WorldCanvas fill interactive homeHref={DESKTOP_ROUTE} />

      <div className="sr-only">
        <h1>{t('world.screen.title')}</h1>
        <ChapterList />
        <BookContents />
      </div>
    </main>
  );
}
