'use client';

import { AnimatePresence } from 'motion/react';
import { useState } from 'react';

import { Dock } from '@/components/dock/dock';
import { CloseConfirmDialog } from '@/components/window/close-confirm-dialog';
import { WindowLayer } from '@/components/window/window-layer';
import { useBootSequence } from '@/hooks/use-boot-sequence';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useUrlSync } from '@/hooks/use-url-sync';
import { DOCK_RESERVE, MENUBAR_HEIGHT, needsFallbackLauncher } from '@/lib/layout';
import { useSetting } from '@/lib/settings';

import { BootScreen } from './boot-screen';
import { DesktopIcons } from './desktop-icons';
import { Hero } from './hero';
import { MenuBar } from './menu-bar';
import { SearchDialog } from './search-dialog';
import { ShortcutsDialog } from './shortcuts-dialog';
import { Wallpaper } from './wallpaper';

export function DesktopShell() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const { isBooting, skip } = useBootSequence();
  const showMenuBar = useSetting((settings) => settings.desktop.showMenuBar);
  const showDock = useSetting((settings) => settings.desktop.showDock);
  const showIcons = useSetting((settings) => settings.desktop.showIcons);
  const autoHideDock = useSetting((settings) => settings.desktop.autoHideDock);
  const noEntryPoint = needsFallbackLauncher({ showDock, showIcons, showMenuBar });

  useUrlSync();
  useKeyboardShortcuts(
    () => setShowShortcuts((current) => !current),
    () => setShowSearch((current) => !current),
  );

  return (
    <div
      className="relative h-dvh w-full overflow-hidden"
      style={
        {
          '--menubar-height': `${showMenuBar ? MENUBAR_HEIGHT : 0}px`,
          '--dock-height': `${showDock && !autoHideDock ? DOCK_RESERVE : 0}px`,
        } as React.CSSProperties
      }
    >
      <Wallpaper />
      <MenuBar
        onOpenShortcuts={() => setShowShortcuts(true)}
        onOpenSearch={() => setShowSearch(true)}
      />
      <DesktopIcons />
      <Hero />
      <WindowLayer />
      <Dock />

      {noEntryPoint ? (
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          className="border-line bg-surface-1/80 text-ink-muted hover:border-accent-dim hover:text-ink absolute bottom-8 left-1/2 z-(--z-dock) -translate-x-1/2 rounded-full border px-4 py-2 text-sm backdrop-blur-(--glass-blur) transition-colors duration-(--duration-fast)"
        >
          Открыть программу
        </button>
      ) : null}

      <CloseConfirmDialog />

      <AnimatePresence>
        {isBooting ? <BootScreen onSkip={skip} /> : null}
      </AnimatePresence>

      {showShortcuts ? (
        <ShortcutsDialog onClose={() => setShowShortcuts(false)} />
      ) : null}
      {showSearch ? <SearchDialog onClose={() => setShowSearch(false)} /> : null}
    </div>
  );
}
