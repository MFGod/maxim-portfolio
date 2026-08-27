'use client';

import { useSyncExternalStore } from 'react';

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
  // Мемоизация здесь была бы пустой: селектор приходит новой стрелкой на каждом
  // рендере, а `useSyncExternalStore` и так зовёт снимок при каждом рендере.
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => select(settingsStore.getSnapshot()),
    () => select(DEFAULT_SETTINGS),
  );
}
