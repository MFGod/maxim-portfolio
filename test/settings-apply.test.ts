import { describe, expect, it } from 'vitest';

import {
  ATTRIBUTE_SPEC,
  attributesFor,
  cssVariablesFor,
  resolveAnimations,
  resolveTheme,
} from '@/lib/settings/apply';
import { DEFAULT_SETTINGS } from '@/lib/settings/defaults';
import type { Settings } from '@/lib/settings/types';

const system = { prefersDark: true, prefersReducedMotion: false };

function settings(patch: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('resolveTheme', () => {
  it('системная тема следует за системой', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('явный выбор сильнее системы', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('resolveAnimations', () => {
  it('системный запрос на покой понижает полный уровень', () => {
    expect(resolveAnimations('full', true)).toBe('reduced');
  });

  it('не повышает уровень, выбранный пользователем', () => {
    expect(resolveAnimations('off', true)).toBe('off');
    expect(resolveAnimations('reduced', true)).toBe('reduced');
    expect(resolveAnimations('full', false)).toBe('full');
  });
});

describe('ATTRIBUTE_SPEC', () => {
  it('каждый путь существует в настройках по умолчанию и совпадает по типу', () => {
    for (const entry of ATTRIBUTE_SPEC) {
      let cursor: unknown = DEFAULT_SETTINGS;
      for (const key of entry.path) {
        expect(typeof cursor).toBe('object');
        cursor = (cursor as Record<string, unknown>)[key];
      }

      if (entry.kind === 'enum') {
        expect(entry.values).toContain(cursor);
      } else if (entry.kind === 'bool') {
        expect(typeof cursor).toBe('boolean');
      } else {
        expect(typeof cursor).toBe('number');
      }
    }
  });

  it('не содержит повторяющихся атрибутов', () => {
    const names = ATTRIBUTE_SPEC.map((entry) =>
      entry.kind === 'size' ? entry.property : entry.attr,
    );
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('attributesFor', () => {
  it('переводит булевы настройки в on/off', () => {
    const result = attributesFor(
      settings({ desktop: { ...DEFAULT_SETTINGS.desktop, showDock: false } }),
      system,
    );

    expect(result['data-show-dock']).toBe('off');
    expect(result['data-show-menubar']).toBe('on');
  });

  it('повышенный контраст выражается своими значениями', () => {
    expect(attributesFor(DEFAULT_SETTINGS, system)['data-contrast']).toBe('normal');
    expect(
      attributesFor(
        settings({
          accessibility: { ...DEFAULT_SETTINGS.accessibility, highContrast: true },
        }),
        system,
      )['data-contrast'],
    ).toBe('high');
  });

  it('в атрибуты попадает разрешённая тема, а не «system»', () => {
    expect(attributesFor(DEFAULT_SETTINGS, system)['data-theme']).toBe('dark');
    expect(
      attributesFor(DEFAULT_SETTINGS, { ...system, prefersDark: false })['data-theme'],
    ).toBe('light');
  });

  it('системный запрос на покой доходит до атрибута движения', () => {
    expect(
      attributesFor(DEFAULT_SETTINGS, { ...system, prefersReducedMotion: true })[
        'data-motion'
      ],
    ).toBe('reduced');
  });
});

describe('cssVariablesFor', () => {
  it('размер иконок дока приходит в пикселях', () => {
    expect(cssVariablesFor(DEFAULT_SETTINGS)['--dock-icon-size']).toBe(
      `${DEFAULT_SETTINGS.desktop.dockSize}px`,
    );
  });
});
