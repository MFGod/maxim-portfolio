'use client';

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ClipboardPaste,
  Columns3,
  Copy,
  FilePlus,
  Check,
  Folder,
  FolderPlus,
  GalleryVerticalEnd,
  LayoutGrid,
  List,
  ListTree,
  NotepadText,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import {
  ContextMenu,
  menuAt,
  type MenuItem,
  type MenuState,
} from '@/components/ui/context-menu';
import type { IconComponent } from '@/components/ui/icons';
import { applications, type AppId } from '@/data/applications';
import { SELECT_KEY_ATTRIBUTE, toContentRect, useMarquee } from '@/hooks/use-marquee';
import { cn } from '@/lib/cn';
import { fileStore, useFiles } from '@/lib/files/store';
import { groupEntries, type GroupEntry } from '@/lib/files/grouping';
import { childrenOf, pathOf } from '@/lib/files/tree';
import type { FileNode } from '@/lib/files/types';
import { extendTo, intersects, sameSet, toggle, type Rect } from '@/lib/selection';
import { useSetting } from '@/lib/settings';
import { settingsStore } from '@/lib/settings/store';
import {
  FILE_GROUPS,
  FILE_VIEWS,
  type FileGroup,
  type FileView,
} from '@/lib/settings/types';
import { useWindowManager } from '@/lib/window-manager';

import { ColumnsView, type ColumnPane } from './views/columns-view';
import { GalleryView } from './views/gallery-view';
import { IconsView } from './views/icons-view';
import { ListView } from './views/list-view';
import {
  DRAG_TYPE,
  readDragIds,
  type BrowserItem,
  type ItemGroup,
  type ItemView,
  type Modifiers,
} from './views/shared';

/**
 * Ярлыки, которые лежат на самом столе. В корне проводника они показываются
 * рядом с файлами: иначе «Рабочий стол» отвечал бы «пусто», когда на столе
 * видно четыре ярлыка. Переносить и удалять их нельзя — это часть системы.
 */
const desktopShortcuts: AppId[] = Object.values(applications)
  .filter((app) => app.onDesktop)
  .map((app) => app.id);

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

type Props = {
  /** Открытая папка. `null` — корень, то есть рабочий стол. */
  parentId: string | null;
  onNavigate: (parentId: string | null) => void;
  /** Показывать ли путь. В «Моём компьютере» его роль играет дерево слева. */
  showPath?: boolean;
  /** Ярлык программы, в окне которой мы находимся. «Мой компьютер» внутри
      «Моего компьютера» — лишняя плитка, ведущая в это же окно. */
  excludeShortcut?: AppId;
  /** История переходов ведёт вызывающий: в «Моём компьютере» в неё попадают
      ещё и «Программы» с «Проектами», а не только папки. */
  onBack?: () => void;
  onForward?: () => void;
  canBack?: boolean;
  canForward?: boolean;
};

/**
 * Содержимое папки: создание, переименование, удаление, буфер обмена, перенос
 * мышью и четыре режима отображения. Один и тот же вид используют окно папки и
 * «Мой компьютер», поэтому навигация вынесена наружу — её ведёт вызывающий.
 *
 * Раскладку рисуют компоненты из `views/`, здесь остаётся всё остальное:
 * выделение, рамка, буфер, меню и клавиатура одинаковы во всех режимах.
 */
export function FileBrowser({
  parentId,
  onNavigate,
  showPath = true,
  excludeShortcut,
  onBack,
  onForward,
  canBack = false,
  canForward = false,
}: Props) {
  const { open } = useWindowManager();
  const { nodes, clipboard } = useFiles();
  const mode = useSetting((settings) => settings.files.view);
  const grouping = useSetting((settings) => settings.files.group);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  /** Отсчёт для Shift-диапазона: последний объект, выделенный обычным кликом. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const path = parentId ? pathOf(nodes, parentId) : [];
  /** Родитель текущей папки. `null` на корне — подниматься некуда. */
  const upId = parentId ? (nodes[parentId]?.parentId ?? null) : null;
  const canGoUp = parentId !== null;

  const flat = browserItems(parentId, nodes, excludeShortcut);
  const isEmpty = flat.length === 0;

  // Группировка меняет порядок чтения, а значит и диапазон по Shift. В колонках
  // и галерее групп нет: там объекты и так разложены по панелям и по ленте.
  const groups = groupsOf(
    flat,
    mode === 'icons' || mode === 'list' ? grouping : 'none',
  );
  /** Плоский список в порядке показа: по нему идут Shift-диапазон и Ctrl+A. */
  const items = groups.flatMap((group) => group.items);
  const order = items.map((item) => item.key);
  /** Файлы выделения. Ярлыки программ отсеиваются: их нельзя ни резать, ни удалять. */
  const selectedFiles = [...selected].filter((key) => nodes[key]);
  /** Единственный выделенный файл: под него открытие и правка имени. */
  const onlyFile = selected.size === 1 ? selectedFiles[0] : undefined;
  const single = onlyFile ? (nodes[onlyFile] ?? null) : null;
  const cutIds = clipboard?.mode === 'cut' ? clipboard.ids : [];

  // Папка исчезла — например, её удалили из другого окна: возвращаемся на стол.
  useEffect(() => {
    if (parentId && !nodes[parentId]) onNavigate(null);
  }, [nodes, onNavigate, parentId]);

  // Переход в другую папку начинается с чистого листа: выделение осталось бы
  // висеть на объектах, которых в этой папке нет. Правка состояния прямо в
  // рендере — тот случай, ради которого React её и допускает: эффект показал
  // бы кадр с чужим выделением.
  const [selectionParent, setSelectionParent] = useState(parentId);
  if (selectionParent !== parentId) {
    setSelectionParent(parentId);
    setSelected(new Set());
    setAnchor(null);
  }

  const selectOnly = (key: string) => {
    setSelected(new Set([key]));
    setAnchor(key);
  };

  const selectWith = (key: string, modifiers: Modifiers) => {
    if (modifiers.shiftKey) {
      setSelected(extendTo(order, anchor, key));
      return;
    }
    if (modifiers.ctrlKey || modifiers.metaKey) {
      setSelected(toggle(selected, key));
      setAnchor(key);
      return;
    }
    selectOnly(key);
  };

  const clearSelection = () => {
    setSelected(new Set());
    setAnchor(null);
  };

  /** Что затронет действие меню: всё выделение или один объект под курсором. */
  const targetsFor = (key: string): string[] =>
    selected.has(key) ? selectedFiles : nodes[key] ? [key] : [];

  /** Выделение до рамки: к нему добавляются попадания. */
  const marqueeBaseRef = useRef<ReadonlySet<string>>(new Set());
  /** Прошлые попадания: рамка считается каждый кадр, а меняется редко. */
  const marqueeHitsRef = useRef<ReadonlySet<string>>(new Set());
  /**
   * Плитки, замеренные на старте жеста. Внутри жеста сетка не меняется, а
   * `getBoundingClientRect` на каждом кадре стоил бы прокрутки по кадру.
   */
  const marqueeTilesRef = useRef<Array<{ key: string; rect: Rect }>>([]);

  const { boxRef, onPointerDown: beginMarquee } = useMarquee({
    containerRef: contentRef,
    onSelect: (rect) => {
      const hits = new Set<string>();
      for (const tile of marqueeTilesRef.current) {
        if (intersects(rect, tile.rect)) hits.add(tile.key);
      }
      if (sameSet(hits, marqueeHitsRef.current)) return;
      marqueeHitsRef.current = hits;
      setSelected(new Set([...marqueeBaseRef.current, ...hits]));
      setAnchor(null);
    },
    onCancel: () => {
      marqueeHitsRef.current = new Set();
      setSelected(marqueeBaseRef.current);
    },
  });

  /** Готовит рамку: замеряет объекты и запоминает исходное выделение. */
  const startMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
    const container = contentRef.current;
    // В колонках панелей несколько: жест, начатый в одной, захватывал бы соседние.
    if (!container || mode === 'columns') return;

    const measured: Array<{ key: string; rect: Rect }> = [];
    for (const tile of container.querySelectorAll<HTMLElement>(
      `[${SELECT_KEY_ATTRIBUTE}]`,
    )) {
      const key = tile.getAttribute(SELECT_KEY_ATTRIBUTE);
      if (key) {
        measured.push({
          key,
          rect: toContentRect(container, tile.getBoundingClientRect()),
        });
      }
    }
    marqueeTilesRef.current = measured;

    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    marqueeBaseRef.current = additive ? selected : new Set();
    marqueeHitsRef.current = new Set();
    if (!additive) clearSelection();
    beginMarquee(event);
  };

  const create = (kind: FileNode['kind']) => {
    const created = fileStore.create(kind, parentId);
    if (!created) return;
    selectOnly(created.id);
    setRenamingId(created.id);
  };

  const openItem = (item: BrowserItem) => {
    if (item.kind === 'app') {
      open(item.app);
      return;
    }
    if (item.node.kind === 'folder') onNavigate(item.node.id);
    else open('editor', { fileId: item.node.id });
  };

  const openNode = (node: FileNode) => {
    if (node.kind === 'folder') onNavigate(node.id);
    else open('editor', { fileId: node.id });
  };

  /** Меню плитки. Действия применяются ко всей группе, правка имени — к одному. */
  const itemMenu = (node: FileNode, targets: string[]): MenuItem[] => {
    const count = targets.length;
    const suffix = count > 1 ? ` (${count})` : '';

    return [
      {
        id: 'open',
        label: node.kind === 'folder' ? 'Открыть' : 'Открыть в редакторе',
        icon: node.kind === 'folder' ? Folder : NotepadText,
        disabled: count > 1,
        onSelect: () => openNode(node),
      },
      {
        id: 'rename',
        label: 'Переименовать',
        icon: Pencil,
        separated: true,
        disabled: count > 1,
        onSelect: () => setRenamingId(node.id),
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
        id: 'paste-into',
        label: 'Вставить в папку',
        icon: ClipboardPaste,
        disabled: count > 1 || node.kind !== 'folder' || !fileStore.canPaste(node.id),
        onSelect: () => fileStore.paste(node.id),
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
  };

  const backgroundMenu = (): MenuItem[] => [
    {
      id: 'new-folder',
      label: 'Создать папку',
      icon: FolderPlus,
      onSelect: () => create('folder'),
    },
    {
      id: 'new-text',
      label: 'Создать текстовый документ',
      icon: FilePlus,
      onSelect: () => create('text'),
    },
    {
      id: 'paste',
      label: 'Вставить',
      icon: ClipboardPaste,
      separated: true,
      disabled: !fileStore.canPaste(parentId),
      onSelect: () => fileStore.paste(parentId),
    },
  ];

  /** Состояние и обработчики, общие для всех режимов отображения. */
  const view: ItemView = {
    items,
    groups,
    selected,
    cutIds,
    dropTargetId,
    renamingId,
    dragIdsFor: (key) => (selected.has(key) ? selectedFiles : [key]),
    onSelect: selectWith,
    onSelectOnly: selectOnly,
    onOpen: openItem,
    onMenu: (item, event) => {
      event.preventDefault();
      if (!selected.has(item.key)) selectOnly(item.key);
      setMenu(
        menuAt(
          event,
          item.kind === 'file'
            ? itemMenu(item.node, targetsFor(item.key))
            : [
                {
                  id: 'open',
                  label: 'Открыть',
                  icon: applications[item.app].icon,
                  onSelect: () => open(item.app),
                },
              ],
        ),
      );
    },
    onDropTarget: setDropTargetId,
    onRenameEnd: () => setRenamingId(null),
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (renamingId) return;

    // Те же сочетания, что и в проводнике: Alt со стрелками ходит по истории
    // и поднимает на уровень выше.
    if (event.altKey) {
      if (event.key === 'ArrowLeft' && canBack) onBack?.();
      else if (event.key === 'ArrowRight' && canForward) onForward?.();
      else if (event.key === 'ArrowUp' && canGoUp) onNavigate(upId);
      else return;
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape' && selected.size > 0) {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      selectedFiles.length > 0
    ) {
      event.preventDefault();
      fileStore.removeMany(selectedFiles);
      clearSelection();
      return;
    }
    // Переименование и открытие — только когда выбран ровно один объект.
    if (event.key === 'F2' && single) {
      event.preventDefault();
      setRenamingId(single.id);
      return;
    }
    if (event.key === 'Enter' && single) {
      event.preventDefault();
      openNode(single);
      return;
    }
    if (!event.ctrlKey && !event.metaKey) return;

    const key = event.key.toLowerCase();
    if (key === 'a') setSelected(new Set(order));
    else if (key === 'x' && selectedFiles.length > 0) {
      fileStore.setClipboard({ ids: selectedFiles, mode: 'cut' });
    } else if (key === 'c' && selectedFiles.length > 0) {
      fileStore.setClipboard({ ids: selectedFiles, mode: 'copy' });
    } else if (key === 'v') fileStore.paste(parentId);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col outline-none"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="border-line-subtle flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={ArrowLeft}
            label="Назад"
            disabled={!canBack}
            onSelect={() => onBack?.()}
          />
          <ToolbarButton
            icon={ArrowRight}
            label="Вперёд"
            disabled={!canForward}
            onSelect={() => onForward?.()}
          />
          <ToolbarButton
            icon={ArrowUp}
            label="На уровень вверх"
            disabled={!canGoUp}
            onSelect={() => onNavigate(upId)}
          />
        </div>

        {showPath ? (
          // Путь не сжимается ниже читаемого: на узком окне на новую строку
          // уходит группа кнопок справа, а не название текущей папки.
          <nav
            aria-label="Путь"
            className="flex min-w-32 flex-1 items-center gap-1 overflow-hidden"
          >
            <PathButton
              label="Рабочий стол"
              current={parentId === null}
              onSelect={() => onNavigate(null)}
            />
            {path.map((entry) => (
              <PathButton
                key={entry.id}
                label={entry.name}
                current={entry.id === parentId}
                onSelect={() => onNavigate(entry.id)}
              />
            ))}
          </nav>
        ) : (
          <span className="text-2xs text-ink-faint flex-1 font-mono">
            {isEmpty ? 'пусто' : `объектов: ${items.length}`}
          </span>
        )}

        {/* Правая половина панели переносится целиком: разорванная на части,
            она перемешалась бы с путём. */}
        <div className="ml-auto flex items-center gap-2">
          {/* Сколько объектов затронет следующее действие. Подсказка из
              рекомендаций Microsoft к спискам с множественным выделением. */}
          {selected.size > 1 ? (
            <span className="text-2xs text-accent shrink-0 font-mono">
              выделено: {selected.size}
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
              onSelect={() => create('folder')}
            />
            <ToolbarButton
              icon={FilePlus}
              label="Создать документ"
              onSelect={() => create('text')}
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

      <div
        ref={contentRef}
        className={cn(
          'relative min-h-0 flex-1 scrollbar-thin',
          // Колонки прокручиваются каждая своя и занимают всю высоту; остальные
          // режимы — общая вертикальная прокрутка с полями.
          mode === 'columns' ? 'overflow-hidden' : 'overflow-y-auto p-3',
        )}
        onPointerDown={(event) => {
          // Нажатие на объекте — его дело: выделение или перетаскивание.
          if (
            event.target instanceof Element &&
            event.target.closest(`[${SELECT_KEY_ATTRIBUTE}]`)
          ) {
            return;
          }
          startMarquee(event);
        }}
        onContextMenu={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          clearSelection();
          setMenu(menuAt(event, backgroundMenu()));
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          const ids = readDragIds(event.dataTransfer.getData(DRAG_TYPE));
          if (ids.length > 0) fileStore.moveMany(ids, parentId);
          setDropTargetId(null);
        }}
      >
        <div
          ref={boxRef}
          aria-hidden
          className="border-accent-dim bg-accent-wash pointer-events-none absolute top-0 left-0 hidden rounded-xs border data-[active]:block"
        />

        {isEmpty && mode !== 'columns' ? (
          <p className="text-ink-faint pointer-events-none px-1 py-6 text-sm">
            Папка пуста. Правый клик — создать папку или текстовый документ.
          </p>
        ) : (
          <Layout
            mode={mode}
            view={view}
            nodes={nodes}
            // Цепочка панелей нужна только колонкам: в остальных режимах её
            // расчёт обошёл бы всех предков папки впустую.
            panes={mode === 'columns' ? columnPanes(nodes, path, excludeShortcut) : []}
            focused={items.find((item) => item.key === [...selected][0]) ?? null}
            onNavigate={onNavigate}
          />
        )}
      </div>

      {menu ? <ContextMenu {...menu} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}

/** Содержимое папки в виде объектов списка: сначала ярлыки, потом файлы. */
function browserItems(
  parentId: string | null,
  nodes: Parameters<typeof childrenOf>[0],
  excludeShortcut?: AppId,
): BrowserItem[] {
  const shortcuts =
    parentId === null ? desktopShortcuts.filter((id) => id !== excludeShortcut) : [];

  return [
    ...shortcuts.map((app): BrowserItem => ({
      key: `app:${app}`,
      kind: 'app',
      app,
      name: applications[app].title,
    })),
    ...childrenOf(nodes, parentId).map((node): BrowserItem => ({
      key: node.id,
      kind: 'file',
      node,
      name: node.name,
    })),
  ];
}

/** Объекты, разложенные по группам. Внутри группы порядок исходный. */
function groupsOf(items: BrowserItem[], mode: FileGroup): ItemGroup[] {
  const entries: GroupEntry[] = items.map((item) => ({
    key: item.key,
    name: item.name,
    kind: item.kind === 'app' ? 'app' : item.node.kind,
    modifiedAt: item.kind === 'app' ? null : item.node.updatedAt,
  }));

  const byKey = new Map(items.map((item) => [item.key, item]));

  return groupEntries(entries, mode).map((group) => ({
    id: group.id,
    title: group.title,
    items: group.keys.flatMap((key) => {
      const item = byKey.get(key);
      return item ? [item] : [];
    }),
  }));
}

/**
 * Цепочка панелей для режима колонок: корень, каждая папка пути и текущая
 * папка. В каждой отмечено, какая подпапка раскрыта следующей панелью.
 */
function columnPanes(
  nodes: Parameters<typeof childrenOf>[0],
  path: FileNode[],
  excludeShortcut?: AppId,
): ColumnPane[] {
  const chain: Array<{ id: string | null; title: string }> = [
    { id: null, title: 'Рабочий стол' },
    ...path.map((node) => ({ id: node.id, title: node.name })),
  ];

  return chain.map((pane, index) => ({
    id: pane.id,
    title: pane.title,
    items: browserItems(pane.id, nodes, excludeShortcut),
    // Раскрыта та папка, которая стала следующей панелью. У последней панели
    // следующей нет — раскрывать нечего.
    openedId: chain[index + 1]?.id ?? null,
  }));
}

/** Раскладка по выбранному режиму. Всё остальное у режимов общее. */
function Layout({
  mode,
  view,
  nodes,
  panes,
  focused,
  onNavigate,
}: {
  mode: FileView;
  view: ItemView;
  nodes: Parameters<typeof childrenOf>[0];
  panes: ColumnPane[];
  focused: BrowserItem | null;
  onNavigate: (parentId: string | null) => void;
}) {
  switch (mode) {
    case 'icons':
      return <IconsView view={view} />;
    case 'list':
      return <ListView view={view} nodes={nodes} />;
    case 'columns':
      return <ColumnsView view={view} panes={panes} onNavigate={onNavigate} />;
    case 'gallery':
      return <GalleryView view={view} nodes={nodes} focused={focused} />;
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

/**
 * Переключатель режима. Настройка общая на все окна: разные режимы в двух
 * окнах одной системы читаются как сбой, а не как удобство.
 */
function ViewSwitch({ value }: { value: FileView }) {
  return (
    // Группа кнопок-переключателей, а не `radiogroup`: роль радиогруппы
    // обязывает к навигации стрелками и одному месту в табуляции, а здесь
    // четыре обычные кнопки — им хватает `aria-pressed`.
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
function GroupMenu({ value, disabled }: { value: FileGroup; disabled: boolean }) {
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

function ToolbarButton({
  icon: Icon,
  label,
  disabled,
  onSelect,
}: {
  icon: IconComponent;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'border-line-subtle grid size-7 place-items-center rounded-md border transition-colors duration-(--duration-fast)',
        disabled
          ? 'text-ink-faint opacity-40'
          : 'text-ink-muted hover:border-accent-dim hover:text-accent',
      )}
    >
      <Icon aria-hidden className="size-4" strokeWidth={1.5} />
    </button>
  );
}
