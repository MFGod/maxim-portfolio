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
  // Мемоизация здесь была бы пустой: селектор приходит новой стрелкой на каждом
  // рендере, а `useSyncExternalStore` и так зовёт снимок при каждом рендере.
  return useSyncExternalStore(
    settingsStore.subscribe,
    () => select(settingsStore.getSnapshot()),
    () => select(DEFAULT_SETTINGS),
  );
}

/**
 * Тема, разрешённая до светлой или тёмной.
 *
 * «Системная» сама по себе ничего не значит для того, кто по ней рисует: свет
 * мира, канвас или холст видят только две. Разрешение живёт здесь, а не у
 * каждого потребителя, — иначе один прочитал бы схему ОС, а другой забыл.
 *
 * На сервере считается светлой: тем же значением по умолчанию, что и у
 * стартового скрипта, иначе первый клиентский рендер разошёлся бы с разметкой.
 */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useSetting((settings) => settings.appearance.theme);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  return resolveTheme(preference, prefersDark);
}
