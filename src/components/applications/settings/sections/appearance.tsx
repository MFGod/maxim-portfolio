'use client';

import {
  SegmentedControl,
  SettingRow,
  SwatchPicker,
  TilePicker,
} from '@/components/applications/settings/controls';
import {
  ACCENTS,
  DENSITIES,
  THEMES,
  TRANSPARENCY_LEVELS,
  WALLPAPERS,
} from '@/lib/settings/types';

import { options, useSection, type SectionProps } from './shared';

export function AppearanceSection({ highlightId }: SectionProps) {
  const { t, settings, patch } = useSection();
  const { appearance } = settings;

  return (
    <div className="space-y-2">
      <SettingRow
        id="theme"
        highlighted={highlightId === 'theme'}
        label={t('appearance.theme.label')}
        description={t('appearance.theme.description')}
        control={
          <SegmentedControl
            label={t('appearance.theme.label')}
            value={appearance.theme}
            options={options(THEMES, 'appearance.theme', t)}
            onChange={(theme) => patch({ appearance: { theme } })}
          />
        }
      />

      <SettingRow
        id="accent"
        highlighted={highlightId === 'accent'}
        label={t('appearance.accent.label')}
        description={t('appearance.accent.description')}
        control={
          <SwatchPicker
            label={t('appearance.accent.label')}
            value={appearance.accent}
            options={options(ACCENTS, 'appearance.accent', t)}
            onChange={(accent) => patch({ appearance: { accent } })}
          />
        }
      />

      <SettingRow
        id="wallpaper"
        stacked
        highlighted={highlightId === 'wallpaper'}
        label={t('appearance.wallpaper.label')}
        control={
          <TilePicker
            label={t('appearance.wallpaper.label')}
            value={appearance.wallpaper}
            options={options(WALLPAPERS, 'appearance.wallpaper', t)}
            onChange={(wallpaper) => patch({ appearance: { wallpaper } })}
          />
        }
      />

      <SettingRow
        id="transparency"
        highlighted={highlightId === 'transparency'}
        label={t('appearance.transparency.label')}
        description={t('appearance.transparency.description')}
        control={
          <SegmentedControl
            label={t('appearance.transparency.label')}
            value={appearance.transparency}
            options={options(TRANSPARENCY_LEVELS, 'appearance.transparency', t)}
            onChange={(transparency) => patch({ appearance: { transparency } })}
          />
        }
      />

      <SettingRow
        id="density"
        highlighted={highlightId === 'density'}
        label={t('appearance.density.label')}
        description={t('appearance.density.description')}
        control={
          <SegmentedControl
            label={t('appearance.density.label')}
            value={appearance.density}
            options={options(DENSITIES, 'appearance.density', t)}
            onChange={(density) => patch({ appearance: { density } })}
          />
        }
      />
    </div>
  );
}
