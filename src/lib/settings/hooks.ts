'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { DEFAULT_SETTINGS } from './defaults';
import { settingsStore } from './store';
import type { Settings } from './types';

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
  const getSnapshot = useCallback(() => select(settingsStore.getSnapshot()), [select]);
  const getServerSnapshot = useCallback(() => select(DEFAULT_SETTINGS), [select]);
  return useSyncExternalStore(settingsStore.subscribe, getSnapshot, getServerSnapshot);
}
