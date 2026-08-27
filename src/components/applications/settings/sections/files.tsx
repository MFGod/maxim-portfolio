'use client';

import {
  SegmentedControl,
  SettingRow,
} from '@/components/applications/settings/controls';
import { Slider } from '@/components/applications/settings/pickers';
import { FILE_GROUPS, FILE_VIEWS, ICON_SIZE_RANGE } from '@/lib/settings/types';

import { options, useSection, type SectionProps } from './shared';

/** Раздел «Файлы»: как выглядят значки на столе и в окнах папок. */
export function FilesSection({ highlightId }: SectionProps) {
  const { t, settings, patch } = useSection();
  const { files } = settings;

  return (
    <div className="space-y-2">
      <SettingRow
        id="view"
        highlighted={highlightId === 'view'}
        label={t('files.view.label')}
        description={t('files.view.description')}
        control={
          <SegmentedControl
            label={t('files.view.label')}
            value={files.view}
            options={options(FILE_VIEWS, 'files.view', t)}
            onChange={(view) => patch({ files: { view } })}
          />
        }
      />

      <SettingRow
        id="group"
        highlighted={highlightId === 'group'}
        label={t('files.group.label')}
        description={t('files.group.description')}
        control={
          <SegmentedControl
            label={t('files.group.label')}
            value={files.group}
            options={options(FILE_GROUPS, 'files.group', t)}
            onChange={(group) => patch({ files: { group } })}
          />
        }
      />

      <SettingRow
        id="iconSize"
        highlighted={highlightId === 'iconSize'}
        label={t('files.iconSize.label')}
        description={t('files.iconSize.description')}
        control={
          <Slider
            label={t('files.iconSize.label')}
            value={files.iconSize}
            min={ICON_SIZE_RANGE.min}
            max={ICON_SIZE_RANGE.max}
            step={ICON_SIZE_RANGE.step}
            unit="px"
            onChange={(iconSize) => patch({ files: { iconSize } })}
          />
        }
      />
    </div>
  );
}
