'use client';

import { useSyncExternalStore } from 'react';

import { useRuntimeEnvironment } from '@/hooks/use-runtime-environment';
import { useSetting } from '@/lib/settings/hooks';

import { detectWebgl2, worldSupport, type WorldSupport } from './capability';

/**
 * Поддержка WebGL2 неизменна на всю сессию, поэтому это не состояние, а
 * внешнее значение: подписка пустая, снимок считается один раз и кэшируется.
 * Проба создаёт контекст, а их у браузера конечное число.
 */
let webgl2Cache: boolean | null = null;

const webgl2Store = {
  subscribe: () => () => {},
  getSnapshot: () => {
    if (webgl2Cache === null) webgl2Cache = detectWebgl2();
    return webgl2Cache;
  },
  // На сервере считаем, что WebGL2 есть: иначе при гидратации мелькнёт
  // сообщение о неподдерживаемом браузере у тех, у кого всё в порядке.
  getServerSnapshot: () => true,
};

/** Готовность машины к трёхмерному миру. */
export function useWorldSupport(): WorldSupport {
  const animations = useSetting((settings) => settings.motion.animations);
  const { viewport } = useRuntimeEnvironment();
  const webgl2 = useSyncExternalStore(
    webgl2Store.subscribe,
    webgl2Store.getSnapshot,
    webgl2Store.getServerSnapshot,
  );

  return worldSupport({
    viewportWidth: viewport?.width ?? null,
    animations,
    webgl2,
    deviceMemory:
      typeof navigator === 'undefined'
        ? null
        : ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null),
  });
}
