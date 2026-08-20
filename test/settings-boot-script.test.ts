import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  attributesFor,
  cssVariablesFor,
  THEME_COLORS,
  type SystemPreferences,
} from '@/lib/settings/apply';
import { settingsBootScript } from '@/lib/settings/boot-script';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
} from '@/lib/settings/defaults';
import { parseStoredSettings, serializeSettings } from '@/lib/settings/parse';

/**
 * Стартовый скрипт повторяет логику `attributesFor` на чистом JS — иначе тема
 * успевала бы моргнуть до гидратации. Этот тест держит обе стороны в согласии:
 * при любом содержимом хранилища результат должен совпадать.
 */

type Applied = {
  attributes: Record<string, string>;
  variables: Record<string, string>;
  themeColor: string | null;
};

function run(raw: string | null, system: SystemPreferences): Applied {
  const attributes: Record<string, string> = {};
  const variables: Record<string, string> = {};
  let themeColor: string | null = null;

  const themeColorMeta = {
    setAttribute(name: string, value: string) {
      if (name === 'content') themeColor = value;
    },
  };

  const documentElement = {
    setAttribute(name: string, value: string) {
      attributes[name] = value;
    },
    style: {
      setProperty(name: string, value: string) {
        variables[name] = value;
      },
    },
  };

  const sandbox = {
    document: {
      documentElement,
      querySelector: (selector: string) =>
        selector === 'meta[name="theme-color"]' ? themeColorMeta : null,
    },
    window: {
      localStorage: {
        getItem: (key: string) => (key === SETTINGS_STORAGE_KEY ? raw : null),
      },
      matchMedia: (query: string) => ({
        matches: query.includes('prefers-color-scheme: dark')
          ? system.prefersDark
          : system.prefersReducedMotion,
      }),
    },
  };

  runInNewContext(settingsBootScript(), sandbox);
  return { attributes, variables, themeColor };
}

const systems: SystemPreferences[] = [
  { prefersDark: true, prefersReducedMotion: false },
  { prefersDark: false, prefersReducedMotion: false },
  { prefersDark: true, prefersReducedMotion: true },
  { prefersDark: false, prefersReducedMotion: true },
];

const stored: Array<[string, string | null]> = [
  ['пустое хранилище', null],
  ['битый JSON', '{это не json'],
  ['не объект', '"строка"'],
  ['чужая версия', JSON.stringify({ version: SETTINGS_VERSION + 1, settings: {} })],
  ['без конверта', JSON.stringify(DEFAULT_SETTINGS)],
  ['значения по умолчанию', serializeSettings(DEFAULT_SETTINGS)],
  [
    'светлая тема и другой акцент',
    serializeSettings({
      ...DEFAULT_SETTINGS,
      appearance: {
        ...DEFAULT_SETTINGS.appearance,
        theme: 'light',
        accent: 'tide',
        wallpaper: 'gradient',
        transparency: 'off',
        density: 'compact',
      },
    }),
  ],
  [
    'выключенные элементы оболочки',
    serializeSettings({
      ...DEFAULT_SETTINGS,
      motion: {
        animations: 'off',
        windowAnimations: false,
        dockAnimations: false,
        hoverEffects: false,
      },
      desktop: {
        ...DEFAULT_SETTINGS.desktop,
        showDock: false,
        showMenuBar: false,
        showIcons: false,
        dockSize: 60,
      },
      accessibility: {
        highContrast: true,
        textScale: 'larger',
        focusRing: 'strong',
        singleKeyShortcuts: false,
      },
    }),
  ],
  [
    'мусор вместо значений',
    JSON.stringify({
      version: SETTINGS_VERSION,
      settings: {
        appearance: { theme: 'neon' },
        desktop: { dockSize: 999, showDock: 'да' },
      },
    }),
  ],
];

describe('settingsBootScript', () => {
  for (const [label, raw] of stored) {
    for (const system of systems) {
      const suffix = `тёмная=${system.prefersDark}, покой=${system.prefersReducedMotion}`;

      it(`совпадает с attributesFor: ${label} (${suffix})`, () => {
        const applied = run(raw, system);
        const settings = parseStoredSettings(raw);

        expect(applied.attributes).toEqual(attributesFor(settings, system));
        expect(applied.variables).toEqual(cssVariablesFor(settings));
        expect(applied.themeColor).toBe(
          THEME_COLORS[applied.attributes['data-theme'] as 'dark' | 'light'],
        );
      });
    }
  }

  it('не выполняет ничего опасного при недоступном хранилище', () => {
    const sandbox = {
      document: {
        documentElement: { setAttribute() {}, style: { setProperty() {} } },
        querySelector: () => null,
      },
      window: {
        localStorage: {
          getItem() {
            throw new Error('доступ к хранилищу запрещён');
          },
        },
        matchMedia: () => ({ matches: false }),
      },
    };

    expect(() => runInNewContext(settingsBootScript(), sandbox)).not.toThrow();
  });

  it('не закрывает тег script раньше времени', () => {
    expect(settingsBootScript()).not.toContain('</');
  });
});
