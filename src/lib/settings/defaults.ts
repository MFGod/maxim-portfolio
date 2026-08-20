import { deepFreeze } from '@/lib/freeze';

import { DOCK_SIZE, ICON_SIZE_RANGE, type Settings } from './types';

/** Ключ хранилища и версия схемы. Версия растёт только вместе с миграцией. */
export const SETTINGS_STORAGE_KEY = 'portfolio:settings';
export const SETTINGS_VERSION = 1;

/**
 * Единственный источник значений по умолчанию. Компоненты своих не знают:
 * первый визит, сброс и битое хранилище приводят сюда.
 */
export const DEFAULT_SETTINGS: Settings = deepFreeze({
  appearance: {
    theme: 'system',
    accent: 'ember',
    wallpaper: 'default',
    transparency: 'default',
    density: 'comfortable',
  },
  motion: {
    animations: 'full',
    windowAnimations: true,
    dockAnimations: true,
    hoverEffects: true,
  },
  desktop: {
    showIcons: true,
    showDock: true,
    autoHideDock: false,
    dockSize: DOCK_SIZE.default,
    dockMagnification: false,
    showMenuBar: true,
    windowShadows: true,
  },
  windows: {
    rememberPositions: true,
    openCentered: false,
    openMaximized: false,
    confirmClose: false,
  },
  behavior: {
    startup: 'none',
    startupAnimation: true,
    welcomeMessage: true,
  },
  accessibility: {
    highContrast: false,
    textScale: 'default',
    focusRing: 'standard',
    singleKeyShortcuts: true,
  },
  files: {
    iconSize: ICON_SIZE_RANGE.default,
    view: 'icons',
    group: 'none',
  },
  language: 'ru',
});
