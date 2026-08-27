'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { SettingRow, Toggle } from '@/components/applications/settings/controls';
import { Slider } from '@/components/applications/settings/pickers';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fileStore, useFiles } from '@/lib/files/store';
import { DOCK_SIZE } from '@/lib/settings/types';

import { useSection, type SectionProps } from './shared';

export function DesktopSection({ highlightId }: SectionProps) {
  const { t, settings, patch } = useSection();
  const { desktop } = settings;

  return (
    <div className="space-y-2">
      <FilesRow highlighted={highlightId === 'files'} />

      <SettingRow
        id="showIcons"
        highlighted={highlightId === 'showIcons'}
        label={t('desktop.showIcons.label')}
        control={
          <Toggle
            label={t('desktop.showIcons.label')}
            checked={desktop.showIcons}
            onChange={(showIcons) => patch({ desktop: { showIcons } })}
          />
        }
      />

      <SettingRow
        id="showDock"
        highlighted={highlightId === 'showDock'}
        label={t('desktop.showDock.label')}
        control={
          <Toggle
            label={t('desktop.showDock.label')}
            checked={desktop.showDock}
            onChange={(showDock) => patch({ desktop: { showDock } })}
          />
        }
      />

      <SettingRow
        id="autoHideDock"
        highlighted={highlightId === 'autoHideDock'}
        label={t('desktop.autoHideDock.label')}
        description={t('desktop.autoHideDock.description')}
        control={
          <Toggle
            label={t('desktop.autoHideDock.label')}
            checked={desktop.autoHideDock}
            onChange={(autoHideDock) => patch({ desktop: { autoHideDock } })}
          />
        }
      />

      <SettingRow
        id="dockSize"
        highlighted={highlightId === 'dockSize'}
        label={t('desktop.dockSize.label')}
        control={
          <Slider
            label={t('desktop.dockSize.label')}
            value={desktop.dockSize}
            min={DOCK_SIZE.min}
            max={DOCK_SIZE.max}
            step={DOCK_SIZE.step}
            unit="px"
            onChange={(dockSize) => patch({ desktop: { dockSize } })}
          />
        }
      />

      <SettingRow
        id="dockMagnification"
        highlighted={highlightId === 'dockMagnification'}
        label={t('desktop.dockMagnification.label')}
        description={t('desktop.dockMagnification.description')}
        control={
          <Toggle
            label={t('desktop.dockMagnification.label')}
            checked={desktop.dockMagnification}
            onChange={(dockMagnification) => patch({ desktop: { dockMagnification } })}
          />
        }
      />

      <SettingRow
        id="showMenuBar"
        highlighted={highlightId === 'showMenuBar'}
        label={t('desktop.showMenuBar.label')}
        control={
          <Toggle
            label={t('desktop.showMenuBar.label')}
            checked={desktop.showMenuBar}
            onChange={(showMenuBar) => patch({ desktop: { showMenuBar } })}
          />
        }
      />

      <SettingRow
        id="windowShadows"
        highlighted={highlightId === 'windowShadows'}
        label={t('desktop.windowShadows.label')}
        control={
          <Toggle
            label={t('desktop.windowShadows.label')}
            checked={desktop.windowShadows}
            onChange={(windowShadows) => patch({ desktop: { windowShadows } })}
          />
        }
      />
    </div>
  );
}

/**
 * Очистка файлов рабочего стола. Единственная настройка, которая удаляет данные,
 * поэтому она спрашивает подтверждение и гаснет, когда удалять нечего.
 */
function FilesRow({ highlighted }: { highlighted: boolean }) {
  const { t } = useSection();
  const { nodes } = useFiles();
  const [confirming, setConfirming] = useState(false);
  const count = Object.keys(nodes).length;

  return (
    <>
      <SettingRow
        id="files"
        highlighted={highlighted}
        label={t('desktop.files.label')}
        description={t('desktop.files.description')}
        control={
          <button
            type="button"
            disabled={count === 0}
            onClick={() => setConfirming(true)}
            className={
              count === 0
                ? 'border-line-subtle text-ink-faint flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs opacity-50'
                : 'border-line-subtle text-ink-muted hover:border-danger hover:text-danger flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors duration-(--duration-fast)'
            }
          >
            <Trash2 aria-hidden className="size-3.5" />
            {t('desktop.files.action')}
            <span className="font-mono">{count}</span>
          </button>
        }
      />

      {confirming ? (
        <ConfirmDialog
          title={t('desktop.files.confirm')}
          body={t('desktop.files.confirmBody')}
          confirmLabel={t('desktop.files.action')}
          tone="danger"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            fileStore.clear();
            setConfirming(false);
          }}
        />
      ) : null}
    </>
  );
}
