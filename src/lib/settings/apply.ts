/**
 * Настройки превращаются в атрибуты и переменные на `<html>`, а внешний вид
 * описан в CSS через них. Поэтому смена темы, акцента или плотности не
 * перерисовывает ни один компонент, а стартовый скрипт применяет их до
 * первой отрисовки.
 */
import { deepFreeze } from '@/lib/freeze';

import { DEFAULT_SETTINGS } from './defaults';
import {
  ACCENTS,
  ANIMATION_LEVELS,
  DENSITIES,
  DOCK_SIZE,
  FOCUS_RINGS,
  ICON_SIZE_RANGE,
  TEXT_SCALES,
  THEMES,
  TRANSPARENCY_LEVELS,
  WALLPAPERS,
  type AnimationLevel,
  type ResolvedTheme,
  type Settings,
  type ThemePreference,
} from './types';

export type SystemPreferences = {
  prefersDark: boolean;
  prefersReducedMotion: boolean;
};

type EnumEntry = {
  kind: 'enum';
  attr: string;
  path: readonly string[];
  values: readonly string[];
  fallback: string;
};

type BoolEntry = {
  kind: 'bool';
  attr: string;
  path: readonly string[];
  fallback: boolean;
  on: string;
  off: string;
};

type SizeEntry = {
  kind: 'size';
  property: string;
  path: readonly string[];
  range: { min: number; max: number; step: number };
  fallback: number;
  unit: string;
};

type AttributeEntry = EnumEntry | BoolEntry | SizeEntry;

const flag = (
  attr: string,
  path: readonly string[],
  fallback: boolean,
  on = 'on',
  off = 'off',
): BoolEntry => ({ kind: 'bool', attr, path, fallback, on, off });

/**
 * Единственное описание связи «настройка → DOM». Его читают и применение из
 * React, и стартовый скрипт в `<head>`, поэтому расходиться им негде.
 */
export const ATTRIBUTE_SPEC: readonly AttributeEntry[] = deepFreeze([
  {
    kind: 'enum',
    attr: 'data-theme',
    path: ['appearance', 'theme'],
    values: THEMES,
    fallback: DEFAULT_SETTINGS.appearance.theme,
  },
  {
    kind: 'enum',
    attr: 'data-accent',
    path: ['appearance', 'accent'],
    values: ACCENTS,
    fallback: DEFAULT_SETTINGS.appearance.accent,
  },
  {
    kind: 'enum',
    attr: 'data-wallpaper',
    path: ['appearance', 'wallpaper'],
    values: WALLPAPERS,
    fallback: DEFAULT_SETTINGS.appearance.wallpaper,
  },
  {
    kind: 'enum',
    attr: 'data-transparency',
    path: ['appearance', 'transparency'],
    values: TRANSPARENCY_LEVELS,
    fallback: DEFAULT_SETTINGS.appearance.transparency,
  },
  {
    kind: 'enum',
    attr: 'data-density',
    path: ['appearance', 'density'],
    values: DENSITIES,
    fallback: DEFAULT_SETTINGS.appearance.density,
  },
  {
    kind: 'enum',
    attr: 'data-motion',
    path: ['motion', 'animations'],
    values: ANIMATION_LEVELS,
    fallback: DEFAULT_SETTINGS.motion.animations,
  },
  flag('data-window-animations', ['motion', 'windowAnimations'], true),
  flag('data-dock-animations', ['motion', 'dockAnimations'], true),
  flag('data-hover', ['motion', 'hoverEffects'], true),
  flag('data-show-icons', ['desktop', 'showIcons'], true),
  flag('data-show-dock', ['desktop', 'showDock'], true),
  flag('data-autohide-dock', ['desktop', 'autoHideDock'], false),
  flag('data-dock-magnify', ['desktop', 'dockMagnification'], false),
  flag('data-show-menubar', ['desktop', 'showMenuBar'], true),
  flag('data-shadows', ['desktop', 'windowShadows'], true),
  flag('data-show-welcome', ['behavior', 'welcomeMessage'], true),
  flag('data-contrast', ['accessibility', 'highContrast'], false, 'high', 'normal'),
  {
    kind: 'enum',
    attr: 'data-text-scale',
    path: ['accessibility', 'textScale'],
    values: TEXT_SCALES,
    fallback: DEFAULT_SETTINGS.accessibility.textScale,
  },
  {
    kind: 'enum',
    attr: 'data-focus',
    path: ['accessibility', 'focusRing'],
    values: FOCUS_RINGS,
    fallback: DEFAULT_SETTINGS.accessibility.focusRing,
  },
  {
    kind: 'size',
    property: '--dock-icon-size',
    path: ['desktop', 'dockSize'],
    range: DOCK_SIZE,
    fallback: DOCK_SIZE.default,
    unit: 'px',
  },
  {
    kind: 'size',
    property: '--icon-size',
    path: ['files', 'iconSize'],
    range: ICON_SIZE_RANGE,
    fallback: ICON_SIZE_RANGE.default,
    unit: 'px',
  },
]);

/** Цвет системной панели браузера. Совпадает с `--color-void` соответствующей темы. */
export const THEME_COLORS: Record<ResolvedTheme, string> = deepFreeze({
  dark: '#0a0806',
  light: '#e4dccb',
});

function at(source: unknown, path: readonly string[]): unknown {
  let cursor: unknown = source;
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

/** Разрешает «системную» тему в конкретную по схеме ОС. */
export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** Из пользовательского и системного уровня движения выигрывает более тихий. */
export function resolveAnimations(
  level: AnimationLevel,
  prefersReducedMotion: boolean,
): AnimationLevel {
  if (prefersReducedMotion && level === 'full') return 'reduced';
  return level;
}

/** Настройки → атрибуты `<html>`, по которым CSS выбирает внешний вид. */
export function attributesFor(
  settings: Settings,
  system: SystemPreferences,
): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const entry of ATTRIBUTE_SPEC) {
    if (entry.kind === 'size') continue;

    const value = at(settings, entry.path);
    if (entry.kind === 'enum') {
      attributes[entry.attr] =
        typeof value === 'string' && entry.values.includes(value)
          ? value
          : entry.fallback;
      continue;
    }

    const resolved = typeof value === 'boolean' ? value : entry.fallback;
    attributes[entry.attr] = resolved ? entry.on : entry.off;
  }

  attributes['data-theme'] = resolveTheme(
    settings.appearance.theme,
    system.prefersDark,
  );
  attributes['data-motion'] = resolveAnimations(
    settings.motion.animations,
    system.prefersReducedMotion,
  );

  return attributes;
}

/** Настройки → CSS-переменные `<html>`: всё, что задаётся числом. */
export function cssVariablesFor(settings: Settings): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const entry of ATTRIBUTE_SPEC) {
    if (entry.kind !== 'size') continue;
    const value = at(settings, entry.path);
    const numeric =
      typeof value === 'number' && Number.isFinite(value) ? value : entry.fallback;
    const clamped = Math.min(Math.max(numeric, entry.range.min), entry.range.max);
    const stepped =
      entry.range.min +
      Math.round((clamped - entry.range.min) / entry.range.step) * entry.range.step;
    variables[entry.property] = `${stepped}${entry.unit}`;
  }

  return variables;
}
