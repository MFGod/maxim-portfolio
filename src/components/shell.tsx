'use client';

import { DesktopShell } from '@/components/desktop/desktop-shell';
import { MobileShell } from '@/components/mobile/mobile-shell';
import { useFocusModality } from '@/hooks/use-focus-modality';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DESKTOP_BREAKPOINT } from '@/lib/layout';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { settingsSectionStore } from '@/lib/settings/section-store';
import { WindowManagerProvider } from '@/lib/window-manager';
import type { WindowPayload } from '@/lib/window-manager/types';
import type { AppId } from '@/data/applications';

type Props = {
  /** Приложение из маршрута, открытое сразу. */
  initialApp?: AppId | null;
  initialPayload?: WindowPayload | null;
  /** Раздел настроек из адреса вида `/settings/appearance`. */
  initialSection?: string | null;
};

/**
 * Корень клиентской части. Ниже `DESKTOP_BREAKPOINT` оконный менеджер не
 * монтируется — у мобильной версии своя оболочка. На сервере считаем десктопом:
 * единственный кадр коррекции перекрыт заставкой.
 */
export function Shell({
  initialApp = null,
  initialPayload = null,
  initialSection = null,
}: Props) {
  const isDesktop = useMediaQuery(`(min-width: ${DESKTOP_BREAKPOINT}px)`, true);

  useFocusModality();

  useIsomorphicLayoutEffect(() => {
    if (initialSection) settingsSectionStore.fromPathname(initialSection);
  }, [initialSection]);

  return (
    <WindowManagerProvider initialApp={initialApp} initialPayload={initialPayload}>
      {isDesktop ? <DesktopShell /> : <MobileShell />}
    </WindowManagerProvider>
  );
}
