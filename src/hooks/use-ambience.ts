'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { ambienceStore } from '@/lib/world/ambience-store';
import { SILENCE, type AmbienceChoice } from '@/lib/world/ambience';

/** Фоновая музыка мира: подписка на выбор и громкость, подъём звука при входе. */
export function useAmbience(enabled: boolean): {
  choice: AmbienceChoice;
  select: (choice: AmbienceChoice) => void;
  volume: number;
  setVolume: (volume: number) => void;
} {
  const stored = useSyncExternalStore(
    ambienceStore.subscribe,
    ambienceStore.getSnapshot,
    ambienceStore.getServerSnapshot,
  );

  useEffect(() => {
    if (!enabled) return;

    ambienceStore.enter();
    return () => ambienceStore.leave();
  }, [enabled]);

  return {
    choice: enabled ? stored.choice : SILENCE,
    select: ambienceStore.set,
    volume: stored.volume,
    setVolume: ambienceStore.setVolume,
  };
}
