'use client';

import {
  Check,
  Columns3,
  GalleryVerticalEnd,
  LayoutGrid,
  List,
  ListTree,
} from 'lucide-react';
import { useState } from 'react';

import { ContextMenu, menuAt, type MenuState } from '@/components/ui/context-menu';
import type { IconComponent } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { settingsStore } from '@/lib/settings/store';
import {
  FILE_GROUPS,
  FILE_VIEWS,
  type FileGroup,
  type FileView,
} from '@/lib/settings/types';

/** Подписи способов группировки. Порядок — из `FILE_GROUPS`. */
const GROUP_LABELS: Record<FileGroup, string> = {
  none: 'Без групп',
  kind: 'По типу',
  name: 'По имени',
  modified: 'По дате',
};

/** Подписи и значки переключателя режимов. Порядок — из `FILE_VIEWS`. */
const VIEW_META: Record<FileView, { label: string; icon: IconComponent }> = {
  icons: { label: 'Значки', icon: LayoutGrid },
  list: { label: 'Список', icon: List },
  columns: { label: 'Колонки', icon: Columns3 },
  gallery: { label: 'Галерея', icon: GalleryVerticalEnd },
};

/**
 * Переключатель режима. Настройка общая на все окна: разные режимы в двух
 * окнах одной системы читаются как сбой, а не как удобство.
 */
export function ViewSwitch({ value }: { value: FileView }) {
  return (
    <div
      role="group"
      aria-label="Режим отображения"
      className="border-line-subtle bg-surface-2 flex items-center rounded-md border p-0.5"
    >
      {FILE_VIEWS.map((mode) => {
        const meta = VIEW_META[mode];
        const Icon = meta.icon;
        const active = mode === value;

        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            title={meta.label}
            aria-label={meta.label}
            onClick={() => settingsStore.patch({ files: { view: mode } })}
            className={cn(
              'grid size-6 place-items-center rounded-sm transition-colors duration-(--duration-fast)',
              active ? 'bg-surface-4 text-ink' : 'text-ink-faint hover:text-ink-muted',
            )}
          >
            <Icon aria-hidden className="size-3.5" strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Выбор группировки. Пунктов четыре, и в панели они заняли бы место, нужное
 * пути, — поэтому меню, а не ряд кнопок. В колонках и галерее группировка
 * ничего не меняет, и кнопка гаснет.
 */
export function GroupMenu({
  value,
  disabled,
}: {
  value: FileGroup;
  disabled: boolean;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={`Группировка: ${GROUP_LABELS[value]}`}
        aria-label={`Группировка: ${GROUP_LABELS[value]}`}
        onClick={(event) =>
          setMenu(
            menuAt(
              event,
              FILE_GROUPS.map((mode) => ({
                id: mode,
                label: GROUP_LABELS[mode],
                icon: mode === value ? Check : undefined,
                onSelect: () => settingsStore.patch({ files: { group: mode } }),
              })),
            ),
          )
        }
        className={cn(
          'border-line-subtle grid size-7 place-items-center rounded-md border transition-colors duration-(--duration-fast)',
          disabled
            ? 'text-ink-faint opacity-40'
            : value === 'none'
              ? 'text-ink-muted hover:border-accent-dim hover:text-accent'
              : 'border-accent-dim text-accent',
        )}
      >
        <ListTree aria-hidden className="size-4" strokeWidth={1.5} />
      </button>

      {menu ? <ContextMenu {...menu} onClose={() => setMenu(null)} /> : null}
    </>
  );
}
