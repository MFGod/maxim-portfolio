'use client';

import {
  SettingRow,
  SettingsHint,
  Toggle,
} from '@/components/applications/settings/controls';

import { useSection, type SectionProps } from './shared';

export function WindowsSection({ highlightId }: SectionProps) {
  const { t, settings, patch } = useSection();
  const { windows } = settings;

  return (
    <div className="space-y-2">
      <SettingRow
        id="rememberPositions"
        highlighted={highlightId === 'rememberPositions'}
        label={t('windows.rememberPositions.label')}
        description={t('windows.rememberPositions.description')}
        control={
          <Toggle
            label={t('windows.rememberPositions.label')}
            checked={windows.rememberPositions}
            onChange={(rememberPositions) => patch({ windows: { rememberPositions } })}
          />
        }
      />

      <SettingRow
        id="openCentered"
        highlighted={highlightId === 'openCentered'}
        label={t('windows.openCentered.label')}
        description={t('windows.openCentered.description')}
        control={
          <Toggle
            label={t('windows.openCentered.label')}
            checked={windows.openCentered}
            onChange={(openCentered) => patch({ windows: { openCentered } })}
          />
        }
      />

      <SettingRow
        id="openMaximized"
        highlighted={highlightId === 'openMaximized'}
        label={t('windows.openMaximized.label')}
        control={
          <Toggle
            label={t('windows.openMaximized.label')}
            checked={windows.openMaximized}
            onChange={(openMaximized) => patch({ windows: { openMaximized } })}
          />
        }
      />

      <SettingRow
        id="confirmClose"
        highlighted={highlightId === 'confirmClose'}
        label={t('windows.confirmClose.label')}
        description={t('windows.confirmClose.description')}
        control={
          <Toggle
            label={t('windows.confirmClose.label')}
            checked={windows.confirmClose}
            onChange={(confirmClose) => patch({ windows: { confirmClose } })}
          />
        }
      />

      <SettingsHint>{t('windows.motionHint')}</SettingsHint>
    </div>
  );
}
