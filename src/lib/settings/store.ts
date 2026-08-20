/**
 * Настройки живут вне React, по образцу `desktop-icons-store`: их меняет
 * интерфейс, применяет DOM, сохраняет localStorage. Компоненты подписаны только
 * там, где от настройки зависит поведение; внешний вид описан в CSS и меняется
 * без единого перерисованного компонента.
 */

import {
  attributesFor,
  cssVariablesFor,
  THEME_COLORS,
  type SystemPreferences,
} from './apply';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from './defaults';
import { readStorage, writeStorage } from '@/lib/storage';

import { parseStoredSettings, serializeSettings } from './parse';
import type { ResolvedTheme, Settings } from './types';

export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object
    ? Partial<Settings[K]>
    : Settings[K];
};

const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let settings: Settings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function systemPreferences(): SystemPreferences {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return { prefersDark: true, prefersReducedMotion: false };
  }
  return {
    prefersDark: window.matchMedia(DARK_QUERY).matches,
    prefersReducedMotion: window.matchMedia(REDUCED_MOTION_QUERY).matches,
  };
}

function applyToDocument(next: Settings): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const attributes = attributesFor(next, systemPreferences());
  for (const [name, value] of Object.entries(attributes)) {
    if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }

  for (const [property, value] of Object.entries(cssVariablesFor(next))) {
    root.style.setProperty(property, value);
  }

  const theme = attributes['data-theme'] as ResolvedTheme | undefined;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && theme && THEME_COLORS[theme]) {
    meta.setAttribute('content', THEME_COLORS[theme]);
  }
}

function persist(): void {
  writeStorage(SETTINGS_STORAGE_KEY, serializeSettings(settings));
}

function commit(next: Settings): void {
  settings = next;
  applyToDocument(next);
  notify();
}

function merge(current: Settings, patch: SettingsPatch): Settings {
  return {
    appearance: { ...current.appearance, ...patch.appearance },
    motion: { ...current.motion, ...patch.motion },
    desktop: { ...current.desktop, ...patch.desktop },
    windows: { ...current.windows, ...patch.windows },
    behavior: { ...current.behavior, ...patch.behavior },
    accessibility: { ...current.accessibility, ...patch.accessibility },
    files: { ...current.files, ...patch.files },
    language: patch.language ?? current.language,
  };
}

/** Системная схема и запрос на покой меняются на лету — переприменяем внешний вид. */
function watchSystem(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const reapply = () => applyToDocument(settings);
  window.matchMedia(DARK_QUERY).addEventListener('change', reapply);
  window.matchMedia(REDUCED_MOTION_QUERY).addEventListener('change', reapply);
}

export const settingsStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot: () => settings,

  /** На сервере доступны только значения по умолчанию, их же видит первый рендер. */
  getServerSnapshot: () => DEFAULT_SETTINGS,

  /**
   * Чтение хранилища отложено до монтирования: первый клиентский рендер обязан
   * совпасть с серверным, иначе гидратация разойдётся. Внешний вид к этому
   * моменту уже верный, его выставил стартовый скрипт. Повторный вызов — no-op.
   */
  hydrate() {
    if (hydrated) return;
    hydrated = true;

    const stored = parseStoredSettings(readStorage(SETTINGS_STORAGE_KEY));

    watchSystem();
    commit(stored);
  },

  patch(patch: SettingsPatch) {
    commit(merge(settings, patch));
    persist();
  },

  reset() {
    commit(DEFAULT_SETTINGS);
    persist();
  },
};
