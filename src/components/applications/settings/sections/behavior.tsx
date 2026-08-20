'use client';

import {
  SegmentedControl,
  SettingRow,
  Toggle,
} from '@/components/applications/settings/controls';
import { STARTUP_MODES } from '@/lib/settings/types';

import { options, useSection, type SectionProps } from './shared';

export function BehaviorSection({ highlightId }: SectionProps) {
  const { t, settings, patch } = useSection();
  const { behavior } = settings;

  return (
    <div className="space-y-2">
      <SettingRow
        id="startup"
        highlighted={highlightId === 'startup'}
        label={t('behavior.startup.label')}
        description={t('behavior.startup.description')}
        control={
          <SegmentedControl
            label={t('behavior.startup.label')}
            value={behavior.startup}
            options={options(STARTUP_MODES, 'behavior.startup', t)}
            onChange={(startup) => patch({ behavior: { startup } })}
          />
        }
      />

      <SettingRow
        id="startupAnimation"
        highlighted={highlightId === 'startupAnimation'}
        label={t('behavior.startupAnimation.label')}
        description={t('behavior.startupAnimation.description')}
        control={
          <Toggle
            label={t('behavior.startupAnimation.label')}
            checked={behavior.startupAnimation}
            onChange={(startupAnimation) => patch({ behavior: { startupAnimation } })}
          />
        }
      />

      <SettingRow
        id="welcomeMessage"
        highlighted={highlightId === 'welcomeMessage'}
        label={t('behavior.welcomeMessage.label')}
        control={
          <Toggle
            label={t('behavior.welcomeMessage.label')}
            checked={behavior.welcomeMessage}
            onChange={(welcomeMessage) => patch({ behavior: { welcomeMessage } })}
          />
        }
      />
    </div>
  );
}
