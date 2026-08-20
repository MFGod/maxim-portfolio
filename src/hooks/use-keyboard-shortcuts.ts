'use client';

import { useEffect } from 'react';

import { settingsStore } from '@/lib/settings/store';
import { useWindowManager } from '@/lib/window-manager';
import { deepFreeze } from '@/lib/freeze';

type Shortcut = { keys: string; description: string };

/** Показывается в окне подсказок. Держать синхронно с обработчиком ниже. */
export const shortcuts: Shortcut[] = deepFreeze([
  { keys: 'Esc', description: 'Закрыть активное окно' },
  { keys: '/', description: 'Поиск' },
  { keys: '?', description: 'Показать этот список' },
]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA'
  );
}

/** Глобальные сокращения без модификаторов: `Esc`, `/`, `?`. */
export function useKeyboardShortcuts(
  onToggleHelp: () => void,
  onToggleSearch: () => void,
) {
  const { state, requestClose } = useWindowManager();
  const focusedId = state.focusedId;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!settingsStore.getSnapshot().accessibility.singleKeyShortcuts) return;

      if (event.key === '?') {
        event.preventDefault();
        onToggleHelp();
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        onToggleSearch();
        return;
      }

      if (event.key === 'Escape' && focusedId) {
        requestClose(focusedId);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [requestClose, focusedId, onToggleHelp, onToggleSearch]);
}
