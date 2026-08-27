'use client';

import { Folder, NotepadText } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { IconBadge } from '@/components/ui/icon-badge';
import { applications, type AppId } from '@/data/applications';
import { useIconDrag } from '@/hooks/use-icon-drag';
import type { Modifiers } from '@/hooks/use-tile-selection';
import { SELECT_KEY_ATTRIBUTE } from '@/hooks/use-marquee';
import { cn } from '@/lib/cn';
import {
  fileIdsOf,
  shiftPositions,
  type IconMetrics,
  type IconPosition,
  type IconPositions,
} from '@/lib/desktop-icons';
import { desktopIconStore } from '@/lib/desktop-icons-store';
import { fileStore } from '@/lib/files/store';
import { splitName } from '@/lib/files/tree';
import type { FileNode } from '@/lib/files/types';
import { useWindowManager } from '@/lib/window-manager';
import type { Workspace } from '@/lib/window-manager/types';

/** Шаг перемещения ярлыка стрелками. */
const NUDGE_STEP = 24;

export type DesktopEntry =
  | { key: string; kind: 'app'; app: AppId }
  | { key: string; kind: 'file'; node: FileNode };

type IconProps = {
  entry: DesktopEntry;
  position: IconPosition;
  positions: IconPositions;
  folderKeys: string[];
  workspace: Workspace;
  metrics: IconMetrics;
  zIndex: number;
  selected: boolean;
  selectedKeys: ReadonlySet<string>;
  cut: boolean;
  renaming: boolean;
  /** Меняет выделение и возвращает то, что выделено после нажатия. */
  onSelect: (modifiers: Modifiers) => ReadonlySet<string>;
  onOpened: () => void;
  onClearSelection: () => void;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
};

export function DesktopIcon({
  entry,
  position,
  positions,
  folderKeys,
  workspace,
  metrics,
  zIndex,
  selected,
  selectedKeys,
  cut,
  renaming,
  onSelect,
  onOpened,
  onClearSelection,
  onRenameStart,
  onRenameEnd,
  onContextMenu,
}: IconProps) {
  const { open } = useWindowManager();
  const nodeRef = useRef<HTMLLIElement | null>(null);

  const isFolder = entry.kind === 'file' && entry.node.kind === 'folder';
  const Icon =
    entry.kind === 'app'
      ? applications[entry.app].icon
      : isFolder
        ? Folder
        : NotepadText;
  const label = entry.kind === 'app' ? applications[entry.app].title : entry.node.name;

  const { beginDrag, movedRef } = useIconDrag({
    nodeRef,
    iconKey: entry.key,
    isFile: entry.kind === 'file',
    positions,
    folderKeys,
    workspace,
    metrics,
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (renaming) return;
    // При наложении тронутый ярлык всплывает наверх, достаточно нажатия.
    desktopIconStore.bringToFront(entry.key);

    // Выделение обновляется здесь же: жест начинается в этом событии и не
    // может дождаться следующего рендера.
    const group = onSelect(event);
    const dragged = group.has(entry.key) ? [...group] : [entry.key];

    return beginDrag(event, dragged, position);
  };

  const openEntry = () => {
    if (entry.kind === 'app') {
      open(entry.app);
      return;
    }
    open(entry.node.kind === 'folder' ? 'folder' : 'editor', {
      fileId: entry.node.id,
    });
  };

  const handleClick = (event: React.MouseEvent) => {
    // Перетаскивание завершается кликом, открывать в этом случае нельзя.
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    // Клик с модификатором набирает выделение и ничего не открывает.
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    // Обычный клик по группе оставляет выделенным только этот ярлык.
    onOpened();
    openEntry();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    /** Клавиши работают на выделение, а вне выделения — на один ярлык. */
    const group = selected && selectedKeys.size > 0 ? [...selectedKeys] : [entry.key];

    if (event.key === 'Escape' && selectedKeys.size > 0) {
      event.preventDefault();
      onClearSelection();
      return;
    }
    if (event.key === 'F2' && entry.kind === 'file' && group.length === 1) {
      event.preventDefault();
      onRenameStart();
      return;
    }
    if (event.key === 'Delete') {
      const ids = fileIdsOf(group);
      if (ids.length === 0) return;
      event.preventDefault();
      fileStore.removeMany(ids);
      onClearSelection();
      return;
    }

    const moves: Record<string, { dx: number; dy: number }> = {
      ArrowUp: { dx: 0, dy: -NUDGE_STEP },
      ArrowDown: { dx: 0, dy: NUDGE_STEP },
      ArrowLeft: { dx: -NUDGE_STEP, dy: 0 },
      ArrowRight: { dx: NUDGE_STEP, dy: 0 },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();

    // Своя позиция известна отдельно: до гидратации хранилища её в общей
    // раскладке ещё нет.
    const starts: IconPositions = { [entry.key]: position };
    for (const key of group) {
      const start = positions[key];
      if (start) starts[key] = start;
    }

    desktopIconStore.moveMany(shiftPositions(starts, move, workspace, metrics));
  };

  return (
    <li
      ref={nodeRef}
      {...{ [SELECT_KEY_ATTRIBUTE]: entry.key }}
      style={
        {
          '--icon-x': `${position.x}px`,
          '--icon-y': `${position.y}px`,
          transform: 'translate3d(var(--icon-x), var(--icon-y), 0)',
          zIndex,
        } as React.CSSProperties
      }
      className="group/tile absolute top-0 left-0 will-change-transform data-[dragging]:z-[1000]"
      onContextMenu={onContextMenu}
    >
      {/* Во время переименования плитка перестаёт быть кнопкой: поле ввода
          внутри `button` — недопустимая вложенность, и браузер не отдаёт ему
          ни фокус, ни набор текста. */}
      {renaming && entry.kind === 'file' ? (
        <div className="before:bg-accent-wash relative flex size-(--icon-size) flex-col items-center justify-center gap-(--icon-gap) rounded-md p-(--icon-pad) before:absolute before:inset-0.5 before:-z-10 before:rounded-md">
          <IconBadge icon={Icon} accent={isFolder} />
          <DesktopRename node={entry.node} onDone={onRenameEnd} />
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          aria-label={
            entry.kind === 'app'
              ? `${label}. Открыть. Стрелки перемещают ярлык`
              : `${label}. Открыть. F2 переименовать, Delete удалить`
          }
          className={cn(
            'group relative flex size-(--icon-size) touch-none flex-col items-center justify-center gap-(--icon-gap) overflow-hidden rounded-md p-(--icon-pad) select-none',
            // Подсветка — отдельным слоем с отступом 2px от края плитки. Сама
            // плитка остаётся ровно в габарите из `iconMetrics`: по этой коробке
            // считаются попадания рамки и привязка к сетке.
            'before:absolute before:inset-0.5 before:-z-10 before:rounded-md',
            'before:transition-colors before:duration-(--duration-fast)',
            selected ? 'before:bg-accent-wash' : 'hover:before:bg-white/5',
            cut && 'opacity-50',
          )}
        >
          <IconBadge icon={Icon} accent={isFolder} />
          <span className="text-ink-muted group-hover:text-ink line-clamp-2 text-center text-(length:--icon-label) leading-tight break-words hyphens-auto">
            {label}
          </span>
        </button>
      )}
    </li>
  );
}

function DesktopRename({ node, onDone }: { node: FileNode; onDone: () => void }) {
  const [value, setValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    const { base } = splitName(node.name, node.kind);
    input.setSelectionRange(0, base.length);
  }, [node.kind, node.name]);

  const commit = () => {
    fileStore.rename(node.id, value);
    onDone();
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onDone();
        }
      }}
      aria-label={`Имя: ${node.name}`}
      className="border-accent-dim bg-surface-1 text-2xs text-ink w-full rounded-sm border px-1 py-0.5 text-center outline-none"
    />
  );
}
