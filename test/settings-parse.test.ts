import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, SETTINGS_VERSION } from '@/lib/settings/defaults';
import { parseStoredSettings, serializeSettings } from '@/lib/settings/parse';
import { DOCK_SIZE } from '@/lib/settings/types';

function stored(settings: unknown, version: number = SETTINGS_VERSION): string {
  return JSON.stringify({ version, settings });
}

describe('parseStoredSettings', () => {
  it('без записи возвращает значения по умолчанию', () => {
    expect(parseStoredSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('не падает на невалидном JSON', () => {
    expect(parseStoredSettings('{не json')).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings('null')).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings('[]')).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings('42')).toEqual(DEFAULT_SETTINGS);
  });

  it('читает сохранённое и возвращает его обратно', () => {
    const raw = serializeSettings({
      ...DEFAULT_SETTINGS,
      appearance: { ...DEFAULT_SETTINGS.appearance, theme: 'light', accent: 'moss' },
      language: 'en',
    });

    const parsed = parseStoredSettings(raw);

    expect(parsed.appearance.theme).toBe('light');
    expect(parsed.appearance.accent).toBe('moss');
    expect(parsed.language).toBe('en');
  });

  it('заменяет неизвестные значения на значения по умолчанию', () => {
    const parsed = parseStoredSettings(
      stored({
        appearance: { theme: 'neon', accent: 42, density: null },
        motion: { animations: 'turbo', hoverEffects: 'yes' },
        language: 'de',
      }),
    );

    expect(parsed.appearance.theme).toBe(DEFAULT_SETTINGS.appearance.theme);
    expect(parsed.appearance.accent).toBe(DEFAULT_SETTINGS.appearance.accent);
    expect(parsed.appearance.density).toBe(DEFAULT_SETTINGS.appearance.density);
    expect(parsed.motion.animations).toBe(DEFAULT_SETTINGS.motion.animations);
    expect(parsed.motion.hoverEffects).toBe(DEFAULT_SETTINGS.motion.hoverEffects);
    expect(parsed.language).toBe(DEFAULT_SETTINGS.language);
  });

  it('сохраняет корректные поля рядом с испорченными', () => {
    const parsed = parseStoredSettings(
      stored({ appearance: { theme: 'dark', accent: '<script>' } }),
    );

    expect(parsed.appearance.theme).toBe('dark');
    expect(parsed.appearance.accent).toBe(DEFAULT_SETTINGS.appearance.accent);
  });

  it('прижимает размер иконок дока к диапазону и шагу', () => {
    const size = (value: unknown) =>
      parseStoredSettings(stored({ desktop: { dockSize: value } })).desktop.dockSize;

    expect(size(1000)).toBe(DOCK_SIZE.max);
    expect(size(0)).toBe(DOCK_SIZE.min);
    expect(size(DOCK_SIZE.min + 1)).toBe(DOCK_SIZE.min);
    expect(size(Number.NaN)).toBe(DOCK_SIZE.default);
    expect(size('44')).toBe(DOCK_SIZE.default);
    expect((size(43) - DOCK_SIZE.min) % DOCK_SIZE.step).toBe(0);
  });

  it('сбрасывает несовместимую версию схемы', () => {
    const settings = { appearance: { theme: 'light' } };

    expect(parseStoredSettings(stored(settings, SETTINGS_VERSION + 1))).toEqual(
      DEFAULT_SETTINGS,
    );
    expect(parseStoredSettings(stored(settings, 0))).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings(JSON.stringify({ settings }))).toEqual(DEFAULT_SETTINGS);
  });

  it('записывает версию рядом со значениями', () => {
    expect(JSON.parse(serializeSettings(DEFAULT_SETTINGS))).toEqual({
      version: SETTINGS_VERSION,
      settings: DEFAULT_SETTINGS,
    });
  });
});
