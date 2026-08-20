import { describe, expect, it } from 'vitest';

import { translator } from '@/lib/i18n';
import { ru } from '@/lib/i18n/ru';
import {
  isSettingsSection,
  searchSettings,
  SETTINGS_ENTRIES,
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTIONS,
} from '@/lib/settings/registry';

const t = translator('ru');
const tEn = translator('en');

describe('реестр настроек', () => {
  it('описывает каждый раздел ровно один раз', () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      ...SETTINGS_SECTION_IDS,
    ]);
  });

  it('идентификаторы настроек уникальны', () => {
    const ids = SETTINGS_ENTRIES.map((entry) => `${entry.section}:${entry.id}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('все ключи переводов существуют', () => {
    const keys = new Set(Object.keys(ru));
    for (const section of SETTINGS_SECTIONS) {
      expect(keys).toContain(section.titleKey);
      expect(keys).toContain(section.summaryKey);
    }
    for (const entry of SETTINGS_ENTRIES) {
      expect(keys).toContain(entry.labelKey);
      expect(keys).toContain(entry.keywordsKey);
      if (entry.descriptionKey) expect(keys).toContain(entry.descriptionKey);
    }
  });

  it('каждая настройка принадлежит известному разделу', () => {
    for (const entry of SETTINGS_ENTRIES) {
      expect(isSettingsSection(entry.section)).toBe(true);
    }
  });
});

describe('searchSettings', () => {
  it('пустой запрос ничего не возвращает', () => {
    expect(searchSettings('', t)).toEqual([]);
    expect(searchSettings('   ', t)).toEqual([]);
  });

  it('находит по подписи на языке интерфейса', () => {
    expect(searchSettings('тема', t).map((entry) => entry.id)).toContain('theme');
    expect(searchSettings('theme', tEn).map((entry) => entry.id)).toContain('theme');
  });

  it('находит по синонимам на другом языке', () => {
    const ids = searchSettings('dark', t).map((entry) => entry.id);
    expect(ids).toContain('theme');
  });

  it('находит настройки из разных разделов по одному слову', () => {
    const sections = new Set(searchSettings('окн', t).map((entry) => entry.section));
    expect(sections.size).toBeGreaterThan(1);
  });

  it('не находит несуществующее', () => {
    expect(searchSettings('квазар', t)).toEqual([]);
  });

  it('ищет по описанию и названию раздела', () => {
    expect(searchSettings('доступность', t).length).toBeGreaterThan(0);
    expect(searchSettings('контраст', t).map((entry) => entry.id)).toContain(
      'highContrast',
    );
  });
});
