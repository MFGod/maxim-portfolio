'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * На сервере отдаёт `serverValue`. Разметка рендерится десктопной, а стартовая
 * заставка перекрывает единственный кадр коррекции на мобильном.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  // Подписка обязана быть стабильной: новая функция на каждом рендере заставила
  // бы React переподписываться на медиазапрос.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
