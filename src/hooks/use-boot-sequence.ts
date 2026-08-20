'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { settingsStore } from '@/lib/settings/store';

const STORAGE_KEY = 'portfolio:booted';
const BOOT_DURATION = 1400;

/**
 * Состояние заставки живёт вне React: его меняют таймер и клик, а компонент
 * только подписан. Иначе понадобился бы setState прямо в эффекте.
 */
const bootStore = {
  isBooting: true,
  listeners: new Set<() => void>(),
  stop() {
    if (!this.isBooting) return;
    this.isBooting = false;
    for (const listener of this.listeners) listener();
  },
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  },
};

/**
 * Заставка показывается один раз за сессию и пропускается по любому действию.
 * Интерфейс под ней уже смонтирован и ничем не заблокирован.
 */
export function useBootSequence() {
  const isBooting = useSyncExternalStore(
    (listener) => bootStore.subscribe(listener),
    () => bootStore.isBooting,
    () => true,
  );

  useIsomorphicLayoutEffect(() => {
    settingsStore.hydrate();

    const alreadyBooted = window.sessionStorage.getItem(STORAGE_KEY) === '1';
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const { behavior, motion } = settingsStore.getSnapshot();
    const disabled = !behavior.startupAnimation || motion.animations === 'off';

    if (alreadyBooted || prefersReducedMotion || disabled) {
      bootStore.stop();
      return;
    }

    window.sessionStorage.setItem(STORAGE_KEY, '1');
    const timer = window.setTimeout(() => bootStore.stop(), BOOT_DURATION);
    return () => window.clearTimeout(timer);
  }, []);

  const skip = useCallback(() => bootStore.stop(), []);

  return { isBooting, skip };
}
