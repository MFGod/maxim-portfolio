'use client';

import {
  SegmentedControl,
  SettingRow,
  SettingsHint,
  Toggle,
} from '@/components/applications/settings/controls';
import { useMediaQuery } from '@/hooks/use-media-query';
import { ANIMATION_LEVELS } from '@/lib/settings/types';

import { options, useSection, type SectionProps } from './shared';

export function MotionSection({ highlightId }: SectionProps) {
  const { t, settings, patch } = useSection();
  const { motion } = settings;
  const systemPrefersCalm = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <div className="space-y-2">
      <SettingRow
        id="animations"
        highlighted={highlightId === 'animations'}
        label={t('motion.animations.label')}
        description={t('motion.animations.description')}
        control={
          <SegmentedControl
            label={t('motion.animations.label')}
            value={motion.animations}
            options={options(ANIMATION_LEVELS, 'motion.animations', t)}
            onChange={(animations) => patch({ motion: { animations } })}
          />
        }
      />

      {systemPrefersCalm && motion.animations === 'full' ? (
        <SettingsHint>{t('motion.animations.systemNotice')}</SettingsHint>
      ) : null}

      <SettingRow
        id="windowAnimations"
        highlighted={highlightId === 'windowAnimations'}
        label={t('motion.windowAnimations.label')}
        description={t('motion.windowAnimations.description')}
        control={
          <Toggle
            label={t('motion.windowAnimations.label')}
            checked={motion.windowAnimations}
            onChange={(windowAnimations) => patch({ motion: { windowAnimations } })}
          />
        }
      />

      <SettingRow
        id="dockAnimations"
        highlighted={highlightId === 'dockAnimations'}
        label={t('motion.dockAnimations.label')}
        description={t('motion.dockAnimations.description')}
        control={
          <Toggle
            label={t('motion.dockAnimations.label')}
            checked={motion.dockAnimations}
            onChange={(dockAnimations) => patch({ motion: { dockAnimations } })}
          />
        }
      />

      <SettingRow
        id="hoverEffects"
        highlighted={highlightId === 'hoverEffects'}
        label={t('motion.hoverEffects.label')}
        description={t('motion.hoverEffects.description')}
        control={
          <Toggle
            label={t('motion.hoverEffects.label')}
            checked={motion.hoverEffects}
            onChange={(hoverEffects) => patch({ motion: { hoverEffects } })}
          />
        }
      />
    </div>
  );
}
