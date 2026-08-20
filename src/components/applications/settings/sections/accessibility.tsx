'use client';

import {
  SegmentedControl,
  SettingRow,
  SettingsHint,
  Toggle,
} from '@/components/applications/settings/controls';
import { FOCUS_RINGS, TEXT_SCALES } from '@/lib/settings/types';

import { options, useSection, type SectionProps } from './shared';

export function AccessibilitySection({ highlightId }: SectionProps) {
  const { t, settings, patch } = useSection();
  const { accessibility } = settings;

  return (
    <div className="space-y-2">
      <SettingRow
        id="highContrast"
        highlighted={highlightId === 'highContrast'}
        label={t('accessibility.highContrast.label')}
        description={t('accessibility.highContrast.description')}
        control={
          <Toggle
            label={t('accessibility.highContrast.label')}
            checked={accessibility.highContrast}
            onChange={(highContrast) => patch({ accessibility: { highContrast } })}
          />
        }
      />

      <SettingRow
        id="textScale"
        highlighted={highlightId === 'textScale'}
        label={t('accessibility.textScale.label')}
        control={
          <SegmentedControl
            label={t('accessibility.textScale.label')}
            value={accessibility.textScale}
            options={options(TEXT_SCALES, 'accessibility.textScale', t)}
            onChange={(textScale) => patch({ accessibility: { textScale } })}
          />
        }
      />

      <SettingRow
        id="focusRing"
        highlighted={highlightId === 'focusRing'}
        label={t('accessibility.focusRing.label')}
        description={t('accessibility.focusRing.description')}
        control={
          <SegmentedControl
            label={t('accessibility.focusRing.label')}
            value={accessibility.focusRing}
            options={options(FOCUS_RINGS, 'accessibility.focusRing', t)}
            onChange={(focusRing) => patch({ accessibility: { focusRing } })}
          />
        }
      />

      <SettingRow
        id="singleKeyShortcuts"
        highlighted={highlightId === 'singleKeyShortcuts'}
        label={t('accessibility.singleKeyShortcuts.label')}
        description={t('accessibility.singleKeyShortcuts.description')}
        control={
          <Toggle
            label={t('accessibility.singleKeyShortcuts.label')}
            checked={accessibility.singleKeyShortcuts}
            onChange={(singleKeyShortcuts) =>
              patch({ accessibility: { singleKeyShortcuts } })
            }
          />
        }
      />

      <SettingsHint>{t('accessibility.motionHint')}</SettingsHint>
    </div>
  );
}
