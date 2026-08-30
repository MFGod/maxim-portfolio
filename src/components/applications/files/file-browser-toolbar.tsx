'use client';

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ClipboardPaste,
  FilePlus,
  FolderPlus,
} from 'lucide-react';

import { ToolbarButton } from '@/components/ui/toolbar-button';
import { cn } from '@/lib/cn';
import { fileStore } from '@/lib/files/store';
import type { FileNode } from '@/lib/files/types';
import type { FileGroup, FileView } from '@/lib/settings/types';

import { GroupMenu, ViewSwitch } from './file-view-controls';

/** Навигация по папкам. Историю ведёт вызывающий: см. `FileBrowser`. */
type Navigation = {
  canBack: boolean;
  canForward: boolean;
  canUp: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onNavigate: (parentId: string | null) => void;
};

type Props = {
  /** Открытая папка. `null` — корень, то есть рабочий стол. */
  parentId: string | null;
  /** Цепочка папок до открытой. Пустая на корне. */
  path: FileNode[];
  /** Показывать ли путь. В «Моём компьютере» его роль играет дерево слева. */
  showPath: boolean;
  navigation: Navigation;
  /** Сколько объектов в папке и сколько из них выделено. */
  counts: { total: number; selected: number };
  mode: FileView;
  grouping: FileGroup;
  onCreate: (kind: FileNode['kind']) => void;
};

/** Панель проводника: навигация, путь, режимы отображения и создание объектов. */
export function FileBrowserToolbar({
  parentId,
  path,
  showPath,
  navigation,
  counts,
  mode,
  grouping,
  onCreate,
}: Props) {
  return (
    <div className="border-line-subtle flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      <div className="flex items-center gap-1">
        <ToolbarButton
          icon={ArrowLeft}
          label="Назад"
          disabled={!navigation.canBack}
          onSelect={navigation.onBack}
        />
        <ToolbarButton
          icon={ArrowRight}
          label="Вперёд"
          disabled={!navigation.canForward}
          onSelect={navigation.onForward}
        />
        <ToolbarButton
          icon={ArrowUp}
          label="На уровень вверх"
          disabled={!navigation.canUp}
          onSelect={navigation.onUp}
        />
      </div>

      {showPath ? (
        <nav
          aria-label="Путь"
          className="flex min-w-32 flex-1 items-center gap-1 overflow-hidden"
        >
          <PathButton
            label="Рабочий стол"
            current={parentId === null}
            onSelect={() => navigation.onNavigate(null)}
          />
          {path.map((entry) => (
            <PathButton
              key={entry.id}
              label={entry.name}
              current={entry.id === parentId}
              onSelect={() => navigation.onNavigate(entry.id)}
            />
          ))}
        </nav>
      ) : (
        <span className="text-2xs text-ink-faint flex-1 font-mono">
          {counts.total === 0 ? 'пусто' : `объектов: ${counts.total}`}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {counts.selected > 1 ? (
          <span className="text-2xs text-accent shrink-0 font-mono">
            выделено: {counts.selected}
          </span>
        ) : null}

        <GroupMenu
          value={grouping}
          disabled={mode === 'columns' || mode === 'gallery'}
        />
        <ViewSwitch value={mode} />

        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={FolderPlus}
            label="Создать папку"
            onSelect={() => onCreate('folder')}
          />
          <ToolbarButton
            icon={FilePlus}
            label="Создать документ"
            onSelect={() => onCreate('text')}
          />
          <ToolbarButton
            icon={ClipboardPaste}
            label="Вставить"
            disabled={!fileStore.canPaste(parentId)}
            onSelect={() => fileStore.paste(parentId)}
          />
        </div>
      </div>
    </div>
  );
}

function PathButton({
  label,
  current,
  onSelect,
}: {
  label: string;
  current?: boolean;
  onSelect: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onSelect}
        aria-current={current || undefined}
        className={cn(
          'max-w-40 truncate rounded-sm px-1.5 py-0.5 text-xs transition-colors duration-(--duration-fast)',
          current ? 'text-ink' : 'text-ink-faint hover:text-accent',
        )}
      >
        {label}
      </button>
      {current ? null : (
        <span aria-hidden className="text-ink-faint text-2xs">
          /
        </span>
      )}
    </>
  );
}
