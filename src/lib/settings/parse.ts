/**
 * Содержимое localStorage — внешние данные: их могли править и они переживают
 * изменения схемы. Каждое поле проверяется отдельно, неизвестное заменяется
 * значением по умолчанию. Ни один ввод не приводит к исключению.
 */

import { DEFAULT_SETTINGS, SETTINGS_VERSION } from './defaults';
import {
  ACCENTS,
  ANIMATION_LEVELS,
  DENSITIES,
  DOCK_SIZE,
  FILE_GROUPS,
  FILE_VIEWS,
  FOCUS_RINGS,
  ICON_SIZE_RANGE,
  LOCALES,
  STARTUP_MODES,
  TEXT_SCALES,
  THEMES,
  TRANSPARENCY_LEVELS,
  WALLPAPERS,
  type Settings,
} from './types';

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Число из хранилища прижимается к диапазону и к шагу. */
function stepped(
  value: unknown,
  range: { min: number; max: number; step: number },
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(Math.max(value, range.min), range.max);
  return range.min + Math.round((clamped - range.min) / range.step) * range.step;
}

function normalize(raw: unknown): Settings {
  const source = record(raw);
  const appearance = record(source['appearance']);
  const motion = record(source['motion']);
  const desktop = record(source['desktop']);
  const windows = record(source['windows']);
  const behavior = record(source['behavior']);
  const accessibility = record(source['accessibility']);
  const files = record(source['files']);

  const defaults = DEFAULT_SETTINGS;

  return {
    appearance: {
      theme: oneOf(appearance['theme'], THEMES, defaults.appearance.theme),
      accent: oneOf(appearance['accent'], ACCENTS, defaults.appearance.accent),
      wallpaper: oneOf(
        appearance['wallpaper'],
        WALLPAPERS,
        defaults.appearance.wallpaper,
      ),
      transparency: oneOf(
        appearance['transparency'],
        TRANSPARENCY_LEVELS,
        defaults.appearance.transparency,
      ),
      density: oneOf(appearance['density'], DENSITIES, defaults.appearance.density),
    },
    motion: {
      animations: oneOf(
        motion['animations'],
        ANIMATION_LEVELS,
        defaults.motion.animations,
      ),
      windowAnimations: bool(
        motion['windowAnimations'],
        defaults.motion.windowAnimations,
      ),
      dockAnimations: bool(motion['dockAnimations'], defaults.motion.dockAnimations),
      hoverEffects: bool(motion['hoverEffects'], defaults.motion.hoverEffects),
    },
    desktop: {
      showIcons: bool(desktop['showIcons'], defaults.desktop.showIcons),
      showDock: bool(desktop['showDock'], defaults.desktop.showDock),
      autoHideDock: bool(desktop['autoHideDock'], defaults.desktop.autoHideDock),
      dockSize: stepped(desktop['dockSize'], DOCK_SIZE, defaults.desktop.dockSize),
      dockMagnification: bool(
        desktop['dockMagnification'],
        defaults.desktop.dockMagnification,
      ),
      showMenuBar: bool(desktop['showMenuBar'], defaults.desktop.showMenuBar),
      windowShadows: bool(desktop['windowShadows'], defaults.desktop.windowShadows),
    },
    windows: {
      rememberPositions: bool(
        windows['rememberPositions'],
        defaults.windows.rememberPositions,
      ),
      openCentered: bool(windows['openCentered'], defaults.windows.openCentered),
      openMaximized: bool(windows['openMaximized'], defaults.windows.openMaximized),
      confirmClose: bool(windows['confirmClose'], defaults.windows.confirmClose),
    },
    behavior: {
      startup: oneOf(behavior['startup'], STARTUP_MODES, defaults.behavior.startup),
      startupAnimation: bool(
        behavior['startupAnimation'],
        defaults.behavior.startupAnimation,
      ),
      welcomeMessage: bool(
        behavior['welcomeMessage'],
        defaults.behavior.welcomeMessage,
      ),
    },
    accessibility: {
      highContrast: bool(
        accessibility['highContrast'],
        defaults.accessibility.highContrast,
      ),
      textScale: oneOf(
        accessibility['textScale'],
        TEXT_SCALES,
        defaults.accessibility.textScale,
      ),
      focusRing: oneOf(
        accessibility['focusRing'],
        FOCUS_RINGS,
        defaults.accessibility.focusRing,
      ),
      singleKeyShortcuts: bool(
        accessibility['singleKeyShortcuts'],
        defaults.accessibility.singleKeyShortcuts,
      ),
    },
    files: {
      iconSize: stepped(files['iconSize'], ICON_SIZE_RANGE, defaults.files.iconSize),
      view: oneOf(files['view'], FILE_VIEWS, defaults.files.view),
      group: oneOf(files['group'], FILE_GROUPS, defaults.files.group),
    },
    language: oneOf(source['language'], LOCALES, defaults.language),
  };
}

/**
 * Миграция сохранённой схемы к текущей версии. Версия одна, поэтому любая
 * другая считается несовместимой и заменяется значениями по умолчанию.
 * Новая версия добавляется шагом `version → version + 1`; поля, которые шаг
 * не описал, подхватит `normalize`.
 */
function migrate(version: number, settings: unknown): unknown {
  if (version === SETTINGS_VERSION) return settings;
  return {};
}

/** Строка из localStorage → полные настройки. Исключений не бросает. */
export function parseStoredSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }

  const envelope = record(parsed);
  const version = typeof envelope['version'] === 'number' ? envelope['version'] : -1;
  return normalize(migrate(version, envelope['settings']));
}

/** Конверт для записи: версия рядом со значениями, иначе миграция невозможна. */
export function serializeSettings(settings: Settings): string {
  return JSON.stringify({ version: SETTINGS_VERSION, settings });
}
