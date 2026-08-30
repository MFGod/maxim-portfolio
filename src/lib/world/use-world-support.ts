'use client';

import { useSyncExternalStore } from 'react';

import { useRuntimeEnvironment } from '@/hooks/use-runtime-environment';
import { useSetting } from '@/lib/settings/hooks';

import {
  detectWebgl2,
  worldQuality,
  worldSupport,
  type WorldEnvironment,
  type WorldQuality,
  type WorldSupport,
} from './capability';

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
  getServerSnapshot: () => true,
};

/** `navigator.deviceMemory` в гигабайтах. `null` — браузер его не сообщает. */
function deviceMemory(): number | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
}

/** Уровень отрисовки, снятый с браузера напрямую. */
export function detectWorldQuality(): WorldQuality {
  return worldQuality({
    viewportWidth: window.innerWidth,
    animations: 'full',
    webgl2: true,
    deviceMemory: deviceMemory(),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  });
}

/** Окружение, от которого зависит допуск в мир. */
function useWorldEnvironment(): WorldEnvironment {
  const animations = useSetting((settings) => settings.motion.animations);
  const { viewport, device } = useRuntimeEnvironment();
  const webgl2 = useSyncExternalStore(
    webgl2Store.subscribe,
    webgl2Store.getSnapshot,
    webgl2Store.getServerSnapshot,
  );

  return {
    viewportWidth: viewport?.width ?? null,
    animations,
    webgl2,
    deviceMemory: deviceMemory(),
    coarsePointer: device !== null && device !== 'desktop',
  };
}

/** Готовность машины к трёхмерному миру. */
export function useWorldSupport(): WorldSupport {
  return worldSupport(useWorldEnvironment());
}
