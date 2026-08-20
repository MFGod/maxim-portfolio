'use client';

import {
  ClipboardPaste,
  Copy,
  FilePlus,
  Folder,
  FolderPlus,
  LayoutGrid,
  NotepadText,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';

import {
  ContextMenu,
  menuAt,
  type MenuItem,
  type MenuState,
} from '@/components/ui/context-menu';
import { IconBadge } from '@/components/ui/icon-badge';
import { applications, type AppId } from '@/data/applications';
import { SELECT_KEY_ATTRIBUTE, useMarquee } from '@/hooks/use-marquee';
import { usePointerDrag } from '@/hooks/use-pointer-drag';
import { cn } from '@/lib/cn';
import { fileStore, useFiles } from '@/lib/files/store';
import { childrenOf, splitName } from '@/lib/files/tree';
import type { FileNode } from '@/lib/files/types';
import { extendTo, sameSet, toggle } from '@/lib/selection';
import {
  clampIconPosition,
  defaultPositions,
  findIconAt,
  iconMetrics,
  iconsInRect,
  snapToGrid,
  type IconMetrics,
  type IconPosition,
  type IconPositions,
} from '@/lib/desktop-icons';
import { desktopIconStore } from '@/lib/desktop-icons-store';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';
import type { Workspace } from '@/lib/window-manager/types';

/** Порог в пикселях: ниже него жест считается кликом. */
const DRAG_THRESHOLD = 4;
/** Шаг перемещения ярлыка стрелками. */
const NUDGE_STEP = 24;

const desktopApps: AppId[] = Object.values(applications)
  .filter((app) => app.onDesktop)
  .map((app) => app.id);

/**
 * Ключ позиции ярлыка. У программ это их идентификатор — так сохранённые
 * раскладки переживают появление файлов; у файлов — префикс и узел.
 */
function fileKey(id: string): string {
  return `file:${id}`;
}

/** Идентификатор файла из ключа ярлыка. Ярлык программы — не файл. */
function fileIdOf(key: string): string | null {
  return key.startsWith('file:') ? key.slice('file:'.length) : null;
}

/** Только файлы группы: ярлыки программ нельзя ни удалить, ни перенести. */
function fileIdsOf(keys: Iterable<string>): string[] {
  const ids: string[] = [];
  for (const key of keys) {
    const id = fileIdOf(key);
    if (id) ids.push(id);
  }
  return ids;
}

/** Модификаторы, при которых клик и рамка добавляют к выделению, а не заменяют. */
type Modifiers = Pick<React.MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>;

type DesktopEntry =
  | { key: string; kind: 'app'; app: AppId }
  | { key: string; kind: 'file'; node: FileNode };

export function DesktopIcons() {
  const { workspace, open } = useWindowManager();
  const { nodes, clipboard } = useFiles();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Отсчёт для Shift-диапазона: последний ярлык, выделенный обычным нажатием. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Размер значка — настройка: от него зависят и раскладка, и попадания.
  const iconSize = useSetting((current) => current.files.iconSize);
  const metrics = useMemo(() => iconMetrics(iconSize), [iconSize]);

  // Файлы читаются из хранилища один раз за загрузку страницы.
  useEffect(() => fileStore.hydrate(), []);

  const entries = useMemo<DesktopEntry[]>(
    () => [
      ...desktopApps.map((app) => ({ key: app, kind: 'app' as const, app })),
      ...childrenOf(nodes, null).map((node) => ({
        key: fileKey(node.id),
        kind: 'file' as const,
        node,
      })),
    ],
    [nodes],
  );

  const ids = useMemo(() => entries.map((entry) => entry.key), [entries]);
  const folderKeys = useMemo(
    () =>
      entries
        .filter((entry) => entry.kind === 'file' && entry.node.kind === 'folder')
        .map((entry) => entry.key),
    [entries],
  );

  const positions = useSyncExternalStore(
    desktopIconStore.subscribe,
    desktopIconStore.getSnapshot,
    desktopIconStore.getServerSnapshot,
  );

  const order = useSyncExternalStore(
    desktopIconStore.subscribeOrder,
    desktopIconStore.getOrderSnapshot,
    desktopIconStore.getServerOrderSnapshot,
  );

  // Раскладка по умолчанию нужна до гидратации хранилища и как запасной вариант.
  const fallback = useMemo(
    () => defaultPositions(ids, workspace, metrics),
    [ids, metrics, workspace],
  );

  // Синхронизируем до отрисовки, иначе сохранённые позиции заметно прыгнут.
  useIsomorphicLayoutEffect(() => {
    desktopIconStore.sync(ids, workspace, metrics);
  }, [ids, metrics, workspace]);

  /** Где ярлыки на самом деле: хранилище поверх раскладки по умолчанию. */
  const placed = useMemo<IconPositions>(
    () => ({ ...fallback, ...positions }),
    [fallback, positions],
  );

  const selectOnly = useCallback((key: string) => {
    setSelectedKeys(new Set([key]));
    setAnchor(key);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
    setAnchor(null);
  }, []);

  /**
   * Обновляет выделение по нажатию и сразу возвращает результат: перетаскивание
   * группы начинается в этом же событии и не может ждать следующего рендера.
   */
  const selectForPointer = useCallback(
    (key: string, modifiers: Modifiers): ReadonlySet<string> => {
      if (modifiers.shiftKey) {
        const next = extendTo(ids, anchor, key);
        setSelectedKeys(next);
        return next;
      }
      if (modifiers.ctrlKey || modifiers.metaKey) {
        const next = toggle(selectedKeys, key);
        setSelectedKeys(next);
        setAnchor(key);
        return next;
      }
      // Нажатие на ярлыке из группы группу не рушит: её собираются тянуть.
      if (selectedKeys.has(key)) return selectedKeys;

      const next = new Set([key]);
      setSelectedKeys(next);
      setAnchor(key);
      return next;
    },
    [anchor, ids, selectedKeys],
  );

  /**
   * Что было выделено до рамки: к этому добавляются попадания. С модификатором
   * рамка дополняет выделение, без него начинает с чистого листа.
   */
  const marqueeBaseRef = useRef<ReadonlySet<string>>(new Set());
  /** Прошлые попадания: рамка пересчитывается каждый кадр, а меняется редко. */
  const marqueeHitsRef = useRef<ReadonlySet<string>>(new Set());

  const { boxRef, onPointerDown: beginMarquee } = useMarquee({
    containerRef: listRef,
    onSelect: (rect) => {
      const hits = new Set(iconsInRect(placed, ids, rect, metrics));
      if (sameSet(hits, marqueeHitsRef.current)) return;
      marqueeHitsRef.current = hits;
      setSelectedKeys(new Set([...marqueeBaseRef.current, ...hits]));
      setAnchor(null);
    },
    onCancel: () => {
      marqueeHitsRef.current = new Set();
      setSelectedKeys(marqueeBaseRef.current);
    },
  });

  /** Готовит рамку: запоминает исходное выделение и сбрасывает его без модификатора. */
  const startMarquee = (event: React.PointerEvent<HTMLElement>) => {
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    marqueeBaseRef.current = additive ? selectedKeys : new Set();
    marqueeHitsRef.current = new Set();
    if (!additive) clearSelection();
    beginMarquee(event);
  };

  /** Создаёт узел и кладёт его туда, где вызвали меню. */
  const createAt = useCallback(
    (kind: FileNode['kind'], point: IconPosition) => {
      const created = fileStore.create(kind, null);
      if (!created) return;
      desktopIconStore.move(
        fileKey(created.id),
        clampIconPosition(
          { x: snapToGrid(point.x), y: snapToGrid(point.y) },
          workspace,
          metrics,
        ),
      );
      selectOnly(fileKey(created.id));
      setRenamingKey(fileKey(created.id));
    },
    [metrics, selectOnly, workspace],
  );

  const backgroundMenu = useCallback(
    (point: IconPosition): MenuItem[] => [
      {
        id: 'new-folder',
        label: 'Создать папку',
        icon: FolderPlus,
        onSelect: () => createAt('folder', point),
      },
      {
        id: 'new-text',
        label: 'Создать текстовый документ',
        icon: FilePlus,
        onSelect: () => createAt('text', point),
      },
      {
        id: 'paste',
        label: 'Вставить',
        icon: ClipboardPaste,
        separated: true,
        disabled: !fileStore.canPaste(null),
        onSelect: () => fileStore.paste(null),
      },
      {
        id: 'arrange',
        label: 'Упорядочить ярлыки',
        icon: LayoutGrid,
        separated: true,
        onSelect: () => desktopIconStore.reset(ids, workspace, metrics),
      },
    ],
    [createAt, ids, metrics, workspace],
  );

  /** Меню ярлыка. Буфер и удаление берут группу, правка имени — один ярлык. */
  const fileMenu = useCallback(
    (node: FileNode, targets: string[]): MenuItem[] => {
      const count = targets.length;
      const suffix = count > 1 ? ` (${count})` : '';

      return [
        {
          id: 'open',
          label: node.kind === 'folder' ? 'Открыть' : 'Открыть в редакторе',
          icon: node.kind === 'folder' ? Folder : NotepadText,
          disabled: count > 1,
          onSelect: () =>
            open(node.kind === 'folder' ? 'folder' : 'editor', { fileId: node.id }),
        },
        {
          id: 'rename',
          label: 'Переименовать',
          icon: Pencil,
          separated: true,
          disabled: count > 1,
          onSelect: () => setRenamingKey(fileKey(node.id)),
        },
        {
          id: 'cut',
          label: `Вырезать${suffix}`,
          icon: Scissors,
          onSelect: () => fileStore.setClipboard({ ids: targets, mode: 'cut' }),
        },
        {
          id: 'copy',
          label: `Копировать${suffix}`,
          icon: Copy,
          onSelect: () => fileStore.setClipboard({ ids: targets, mode: 'copy' }),
        },
        {
          id: 'delete',
          label: `Удалить${suffix}`,
          icon: Trash2,
          danger: true,
          separated: true,
          onSelect: () => {
            fileStore.removeMany(targets);
            clearSelection();
          },
        },
      ];
    },
    [clearSelection, open],
  );

  const appMenu = useCallback(
    (app: AppId): MenuItem[] => [
      {
        id: 'open',
        label: 'Открыть',
        icon: applications[app].icon,
        onSelect: () => open(app),
      },
    ],
    [open],
  );

  return (
    <ul
      ref={listRef}
      aria-label="Ярлыки на рабочем столе"
      data-shell="desktop-icons"
      className="absolute inset-0 z-(--z-desktop-icons)"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        startMarquee(event);
      }}
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        clearSelection();
        setMenu(menuAt(event, backgroundMenu({ x: event.clientX, y: event.clientY })));
      }}
    >
      {/* Рамка выделения. Внутри списка её держит `li`: `div` здесь был бы
          недопустимым потомком `ul`. */}
      <li aria-hidden>
        <div
          ref={boxRef}
          className="border-accent-dim bg-accent-wash pointer-events-none absolute top-0 left-0 hidden rounded-xs border data-[active]:block"
        />
      </li>

      {entries.map((entry) => (
        <DesktopIcon
          key={entry.key}
          entry={entry}
          position={placed[entry.key] ?? { x: workspace.x, y: workspace.y }}
          positions={placed}
          folderKeys={folderKeys}
          workspace={workspace}
          metrics={metrics}
          zIndex={Math.max(0, order.indexOf(entry.key))}
          selected={selectedKeys.has(entry.key)}
          cut={
            entry.kind === 'file' && (clipboard?.ids.includes(entry.node.id) ?? false)
          }
          renaming={entry.key === renamingKey}
          selectedKeys={selectedKeys}
          onSelect={(modifiers) => selectForPointer(entry.key, modifiers)}
          onOpened={() => selectOnly(entry.key)}
          onClearSelection={clearSelection}
          onRenameEnd={() => setRenamingKey(null)}
          onRenameStart={() => setRenamingKey(entry.key)}
          onContextMenu={(event) => {
            event.preventDefault();
            const grouped = selectedKeys.has(entry.key);
            if (!grouped) selectOnly(entry.key);
            const targets = grouped ? fileIdsOf(selectedKeys) : fileIdsOf([entry.key]);
            setMenu(
              menuAt(
                event,
                entry.kind === 'file'
                  ? fileMenu(entry.node, targets)
                  : appMenu(entry.app),
              ),
            );
          }}
        />
      ))}

      {menu ? <ContextMenu {...menu} onClose={() => setMenu(null)} /> : null}
    </ul>
  );
}

function applyPosition(node: HTMLElement, position: IconPosition): void {
  node.style.setProperty('--icon-x', `${position.x}px`);
  node.style.setProperty('--icon-y', `${position.y}px`);
}

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

/** Смещение курсора: одно на всю перетаскиваемую группу. */
type DragOffset = { dx: number; dy: number };

function DesktopIcon({
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
  const dropTargetRef = useRef<string | null>(null);
  /** Что едет в этом жесте и откуда. Заполняется на нажатии. */
  const groupRef = useRef<IconPositions>({});

  const isFolder = entry.kind === 'file' && entry.node.kind === 'folder';
  const Icon =
    entry.kind === 'app'
      ? applications[entry.app].icon
      : isFolder
        ? Folder
        : NotepadText;
  const label = entry.kind === 'app' ? applications[entry.app].title : entry.node.name;

  /** Ярлык группы по ключу. Свой узел известен, остальные ищем рядом в списке. */
  const nodeFor = useCallback(
    (key: string, self: HTMLElement): HTMLElement | null => {
      if (key === entry.key) return self;
      return (
        self.parentElement?.querySelector<HTMLElement>(
          `[${SELECT_KEY_ATTRIBUTE}="${key}"]`,
        ) ?? null
      );
    },
    [entry.key],
  );

  /** Позиции всей группы при таком смещении курсора. */
  const positionsFor = useCallback(
    (offset: DragOffset): IconPositions => {
      const next: IconPositions = {};
      for (const [key, start] of Object.entries(groupRef.current)) {
        next[key] = clampIconPosition(
          { x: snapToGrid(start.x + offset.dx), y: snapToGrid(start.y + offset.dy) },
          workspace,
          metrics,
        );
      }
      return next;
    },
    [metrics, workspace],
  );

  /** Папка под центром перетаскиваемого ярлыка. Файл можно бросить внутрь. */
  const folderUnder = useCallback(
    (next: IconPosition): string | null => {
      if (entry.kind !== 'file') return null;
      const center = {
        x: next.x + metrics.width / 2,
        y: next.y + metrics.height / 2,
      };
      // Папка, которую тянут вместе с группой, приёмником быть не может.
      const targets = folderKeys.filter((key) => !(key in groupRef.current));
      return findIconAt(positions, targets, center, metrics);
    },
    [entry.kind, folderKeys, metrics, positions],
  );

  /** На каждом кадре двигаем всю группу и подсвечиваем папку под курсором. */
  const apply = useCallback(
    (node: HTMLElement, offset: DragOffset) => {
      const next = positionsFor(offset);
      for (const [key, position] of Object.entries(next)) {
        const target = nodeFor(key, node);
        if (target) applyPosition(target, position);
      }

      const self = next[entry.key];
      const target = self ? folderUnder(self) : null;
      if (target === dropTargetRef.current) return;

      const list = node.parentElement;
      if (dropTargetRef.current) {
        list
          ?.querySelector(`[${SELECT_KEY_ATTRIBUTE}="${dropTargetRef.current}"]`)
          ?.removeAttribute('data-drop-target');
      }
      if (target) {
        list
          ?.querySelector(`[${SELECT_KEY_ATTRIBUTE}="${target}"]`)
          ?.setAttribute('data-drop-target', '');
      }
      dropTargetRef.current = target;
    },
    [entry.key, folderUnder, nodeFor, positionsFor],
  );

  const commit = useCallback(
    (offset: DragOffset) => {
      const next = positionsFor(offset);
      const self = nodeRef.current;
      const list = self?.parentElement;

      if (self) {
        for (const key of Object.keys(next)) {
          nodeFor(key, self)?.removeAttribute('data-dragging');
        }
      }

      const target = dropTargetRef.current;
      if (target) {
        list
          ?.querySelector(`[${SELECT_KEY_ATTRIBUTE}="${target}"]`)
          ?.removeAttribute('data-drop-target');
        dropTargetRef.current = null;
      }

      // Группу отпустили над папкой — это перенос, а не новые позиции на столе.
      // Ярлыки программ и файлы, которые переехать не смогли, встают на место.
      const folderId = target ? fileIdOf(target) : null;
      if (folderId) {
        const movedIds = fileStore.moveMany(fileIdsOf(Object.keys(next)), folderId);
        for (const id of movedIds) delete next[fileKey(id)];
      }

      desktopIconStore.moveMany(next);
    },
    [nodeFor, positionsFor],
  );

  const { begin, movedRef } = usePointerDrag<DragOffset>({
    nodeRef,
    apply,
    onStart: (node) => {
      for (const key of Object.keys(groupRef.current)) {
        nodeFor(key, node)?.setAttribute('data-dragging', '');
      }
    },
    onCommit: commit,
  });

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (renaming) return;
      // При наложении тронутый ярлык всплывает наверх, достаточно нажатия.
      desktopIconStore.bringToFront(entry.key);

      // Выделение обновляется здесь же: жест начинается в этом событии и не
      // может дождаться следующего рендера.
      const group = onSelect(event);
      const dragged = group.has(entry.key) ? [...group] : [entry.key];
      const starts: IconPositions = { [entry.key]: position };
      for (const key of dragged) {
        const start = positions[key];
        if (start) starts[key] = start;
      }
      groupRef.current = starts;

      return begin({
        event,
        start: { dx: 0, dy: 0 },
        threshold: DRAG_THRESHOLD,
        compute: (_start, dx, dy) => ({ dx, dy }),
      });
    },
    [begin, entry.key, onSelect, position, positions, renaming],
  );

  const openEntry = useCallback(() => {
    if (entry.kind === 'app') {
      open(entry.app);
      return;
    }
    open(entry.node.kind === 'folder' ? 'folder' : 'editor', {
      fileId: entry.node.id,
    });
  }, [entry, open]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
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
    },
    [movedRef, onOpened, openEntry],
  );

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

    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -NUDGE_STEP],
      ArrowDown: [0, NUDGE_STEP],
      ArrowLeft: [-NUDGE_STEP, 0],
      ArrowRight: [NUDGE_STEP, 0],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();

    const next: IconPositions = {};
    for (const key of group) {
      const start = key === entry.key ? position : positions[key];
      if (!start) continue;
      next[key] = clampIconPosition(
        { x: snapToGrid(start.x + move[0]), y: snapToGrid(start.y + move[1]) },
        workspace,
        metrics,
      );
    }
    desktopIconStore.moveMany(next);
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
