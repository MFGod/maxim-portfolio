import { describe, expect, it } from 'vitest';

import { dictionaries, translator } from '@/lib/i18n';
import { en } from '@/lib/i18n/en';
import { ru } from '@/lib/i18n/ru';
import { LOCALES } from '@/lib/settings/types';

describe('словари', () => {
  it('совпадают по набору ключей', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  it('не содержат пустых строк', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(dictionaries[locale])) {
        expect(value.trim(), `${locale}: ${key}`).not.toBe('');
      }
    }
  });

  it('переводчик отдаёт строку выбранного языка', () => {
    expect(translator('ru')('app.title')).toBe(ru['app.title']);
    expect(translator('en')('app.title')).toBe(en['app.title']);
  });
});
