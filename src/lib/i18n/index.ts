'use client';

import { useMemo } from 'react';

import { useSetting } from '@/lib/settings/hooks';
import type { Locale } from '@/lib/settings/types';

import { en } from './en';
import { ru, type Dictionary, type TranslationKey } from './ru';

const dictionaries: Record<Locale, Dictionary> = { ru, en };

export type Translate = (key: TranslationKey) => string;

/** Переводчик для языка. Вне React — им пользуются модули вне дерева компонентов. */
export function translator(locale: Locale): Translate {
  const dictionary = dictionaries[locale];
  return (key) => dictionary[key];
}

/**
 * Перевод системных строк. Язык читается одним значением, поэтому смена других
 * настроек компонент не перерисовывает.
 */
export function useTranslate(): Translate {
  const locale = useSetting((settings) => settings.language);
  return useMemo(() => translator(locale), [locale]);
}

export { dictionaries, type Dictionary, type TranslationKey };
