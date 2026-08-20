'use client';

import { useEffect } from 'react';

import { labelOf } from '@/components/applications/app-registry';
import { pathnameFromWindow, targetFromPathname } from '@/lib/routes';
import { useSetting } from '@/lib/settings';
import { settingsSectionStore } from '@/lib/settings/section-store';
import { useWindowManager } from '@/lib/window-manager';

const SITE_TITLE = 'Максим Жихарев — Frontend Developer';

/**
 * Держит адрес и заголовок документа в соответствии с активным окном.
 * `replaceState`, чтобы переключение фокуса не засоряло историю.
 */
export function useUrlSync() {
  const { state, open, closeAll } = useWindowManager();
  const locale = useSetting((settings) => settings.language);
  const focusedId = state.focusedId;

  useEffect(() => {
    const focused = focusedId ? state.windows[focusedId] : null;
    const nextPath = focused ? pathnameFromWindow(focused) : '/';

    if (window.location.pathname !== nextPath) {
      window.history.replaceState(null, '', nextPath);
    }

    document.title = focused
      ? `${labelOf(focused, locale).title} — ${SITE_TITLE}`
      : SITE_TITLE;
  }, [focusedId, locale, state.windows]);

  useEffect(() => {
    const syncFromLocation = () => {
      const target = targetFromPathname(window.location.pathname);
      if (!target) {
        closeAll();
        return;
      }
      if (target.section) settingsSectionStore.set(target.section);
      open(target.app, target.payload);
    };

    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, [closeAll, open]);
}
