'use client';

import { useEffect, useRef, useState } from 'react';

import { ContextMenu, menuAt, type MenuState } from '@/components/ui/context-menu';
import { appMenu, backgroundMenu, fileItemMenu } from '@/components/ui/file-menu-items';
import type { AppId } from '@/data/applications';
import { useFileActions } from '@/hooks/use-file-actions';
import { useFileShortcuts } from '@/hooks/use-file-shortcuts';
import { measureTiles, SELECT_KEY_ATTRIBUTE } from '@/hooks/use-marquee';
import { useTileSelection } from '@/hooks/use-tile-selection';
import { cn } from '@/lib/cn';
import { browserItems, columnPanes, groupsOf } from '@/lib/files/browser-items';
import { fileStore, useFiles } from '@/lib/files/store';
import { pathOf } from '@/lib/files/tree';
import { intersects, type Rect } from '@/lib/selection';
import { useSetting } from '@/lib/settings';

import { FileBrowserToolbar } from './file-browser-toolbar';
import { FileLayout } from './file-layout';
import { DRAG_TYPE, readDragIds, type ItemView } from './views/shared';

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
 * Раскладку рисуют компоненты из `views/`, панель — `FileBrowserToolbar`, а
 * здесь остаётся всё остальное: выделение, рамка, буфер, меню и клавиатура
 * одинаковы во всех режимах.
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
  const { nodes, clipboard } = useFiles();
  const mode = useSetting((settings) => settings.files.view);
  const grouping = useSetting((settings) => settings.files.group);
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
  const cutIds = clipboard?.mode === 'cut' ? clipboard.ids : [];

  // Папка исчезла — например, её удалили из другого окна: возвращаемся на стол.
  useEffect(() => {
    if (parentId && !nodes[parentId]) onNavigate(null);
  }, [nodes, onNavigate, parentId]);

  /**
   * Плитки, замеренные на старте жеста. Внутри жеста сетка не меняется, а
   * `getBoundingClientRect` на каждом кадре стоил бы прокрутки по кадру.
   */
  const marqueeTilesRef = useRef<Array<{ key: string; rect: Rect }>>([]);

  /** Замер плиток. В колонках рамки нет: жест из одной панели захватил бы соседние. */
  const prepareMarquee = (): boolean => {
    const container = contentRef.current;
    if (!container || mode === 'columns') return false;
    marqueeTilesRef.current = measureTiles(container);
    return true;
  };

  const hitTest = (rect: Rect) =>
    marqueeTilesRef.current
      .filter((tile) => intersects(rect, tile.rect))
      .map((tile) => tile.key);

  const {
    selectedKeys: selected,
    selectOnly,
    clearSelection,
    selectForPointer,
    selectAll,
    marqueeBoxRef,
    startMarquee,
  } = useTileSelection({
    ids: order,
    containerRef: contentRef,
    hitTest,
    onMarqueeStart: prepareMarquee,
  });

  // Переход в другую папку начинается с чистого листа: выделение осталось бы
  // висеть на объектах, которых в этой папке нет. Правка состояния прямо в
  // рендере — тот случай, ради которого React её и допускает: эффект показал
  // бы кадр с чужим выделением.
  const [selectionParent, setSelectionParent] = useState(parentId);
  if (selectionParent !== parentId) {
    setSelectionParent(parentId);
    clearSelection();
  }

  /** Файлы выделения. Ярлыки программ отсеиваются: их нельзя ни резать, ни удалять. */
  const selectedFiles = [...selected].filter((key) => nodes[key]);
  /** Единственный выделенный файл: под него открытие и правка имени. */
  const onlyFile = selected.size === 1 ? selectedFiles[0] : undefined;
  const single = onlyFile ? (nodes[onlyFile] ?? null) : null;

  const { create, openItem, openNode, removeNodes, targetsFor } = useFileActions({
    parentId,
    nodes,
    selected,
    selectedFiles,
    onNavigate,
    onSelectOnly: selectOnly,
    onClearSelection: clearSelection,
    onRenameStart: setRenamingId,
  });

  /** Состояние и обработчики, общие для всех режимов отображения. */
  const view: ItemView = {
    items,
    groups,
    selected,
    cutIds,
    dropTargetId,
    renamingId,
    dragIdsFor: (key) => (selected.has(key) ? selectedFiles : [key]),
    // Результат выделения нужен только рабочему столу — там им начинают жест.
    onSelect: (key, modifiers) => void selectForPointer(key, modifiers),
    onSelectOnly: selectOnly,
    onOpen: openItem,
    onMenu: (item, event) => {
      event.preventDefault();
      if (!selected.has(item.key)) selectOnly(item.key);
      setMenu(
        menuAt(
          event,
          item.kind === 'file'
            ? fileItemMenu(
                item.node,
                targetsFor(item.key),
                {
                  onOpen: openNode,
                  onRename: (node) => setRenamingId(node.id),
                  onDelete: removeNodes,
                },
                { pasteInto: true },
              )
            : appMenu(item.app, () => openItem(item)),
        ),
      );
    },
    onDropTarget: setDropTargetId,
    onRenameEnd: () => setRenamingId(null),
  };

  const handleKeyDown = useFileShortcuts({
    parentId,
    renaming: renamingId !== null,
    selectedFiles,
    selectedCount: selected.size,
    single,
    navigation: {
      canBack,
      canForward,
      canUp: canGoUp,
      onBack: () => onBack?.(),
      onForward: () => onForward?.(),
      onUp: () => onNavigate(upId),
    },
    onSelectAll: selectAll,
    onClearSelection: clearSelection,
    onDelete: removeNodes,
    onRename: (node) => setRenamingId(node.id),
    onOpen: openNode,
  });

  return (
    <div
      className="flex h-full min-h-0 flex-col outline-none"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <FileBrowserToolbar
        parentId={parentId}
        path={path}
        showPath={showPath}
        navigation={{
          canBack,
          canForward,
          canUp: canGoUp,
          onBack: () => onBack?.(),
          onForward: () => onForward?.(),
          onUp: () => onNavigate(upId),
          onNavigate,
        }}
        counts={{ total: items.length, selected: selected.size }}
        mode={mode}
        grouping={grouping}
        onCreate={create}
      />

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
          setMenu(menuAt(event, backgroundMenu({ parentId, onCreate: create })));
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
          ref={marqueeBoxRef}
          aria-hidden
          className="border-accent-dim bg-accent-wash pointer-events-none absolute top-0 left-0 hidden rounded-xs border data-[active]:block"
        />

        {isEmpty && mode !== 'columns' ? (
          <p className="text-ink-faint pointer-events-none px-1 py-6 text-sm">
            Папка пуста. Правый клик — создать папку или текстовый документ.
          </p>
        ) : (
          <FileLayout
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
