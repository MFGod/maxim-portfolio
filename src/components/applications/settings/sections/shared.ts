'use client';

import { useTranslate, type Translate } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/ru';
import type { Option } from '@/components/applications/settings/controls';
import { useSettings } from '@/lib/settings/hooks';
import { settingsStore, type SettingsPatch } from '@/lib/settings/store';
import type { Settings } from '@/lib/settings/types';

export type SectionProps = {
  /** Настройка, найденная поиском: её строка подсвечивается до первого действия. */
  highlightId: string | null;
};

export function useSection(): {
  t: Translate;
  settings: Settings;
  patch: (next: SettingsPatch) => void;
} {
  return {
    t: useTranslate(),
    settings: useSettings(),
    patch: (next) => settingsStore.patch(next),
  };
}

/** Значения → подписанные варианты по общему правилу ключей. */
export function options<T extends string>(
  values: readonly T[],
  prefix: string,
  t: Translate,
): Option<T>[] {
  return values.map((value) => ({
    value,
    label: t(`${prefix}.${value}` as TranslationKey),
  }));
}
