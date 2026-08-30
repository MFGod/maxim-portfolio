'use client';

import { useSyncExternalStore } from 'react';

import { useMediaQuery } from '@/hooks/use-media-query';

import { resolveTheme } from './apply';
import { DEFAULT_SETTINGS } from './defaults';
import { settingsStore } from './store';
import type { ResolvedTheme, Settings } from './types';

/** Весь объект настроек. Нужен только интерфейсу Settings. */
export function useSettings(): Settings {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getServerSnapshot,
  );
}

/**
 * Одно значение настройки: компонент перерисуется только при его изменении.
 * Селектор обязан возвращать примитив — сравнение идёт по значению.
 */
export function useSetting<T extends string | number | boolean>(
  select: (settings: Settings) => T,
): T {
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => select(settingsStore.getSnapshot()),
    () => select(DEFAULT_SETTINGS),
  );
}

/** Тема, разрешённая до светлой или тёмной. */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useSetting((settings) => settings.appearance.theme);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  return resolveTheme(preference, prefersDark);
}
