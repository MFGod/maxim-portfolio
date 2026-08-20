'use client';

import {
  SegmentedControl,
  SettingRow,
  SettingsHint,
} from '@/components/applications/settings/controls';
import { LOCALES } from '@/lib/settings/types';

import { options, useSection, type SectionProps } from './shared';

export function LanguageSection({ highlightId }: SectionProps) {
  const { t, settings, patch } = useSection();

  return (
    <div className="space-y-2">
      <SettingRow
        id="language"
        highlighted={highlightId === 'language'}
        label={t('language.label')}
        description={t('language.description')}
        control={
          <SegmentedControl
            label={t('language.label')}
            value={settings.language}
            options={options(LOCALES, 'language', t)}
            onChange={(language) => patch({ language })}
          />
        }
      />

      <SettingsHint>{t('language.note')}</SettingsHint>
    </div>
  );
}
