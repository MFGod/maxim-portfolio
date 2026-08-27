'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { DesktopIcon, type DesktopEntry } from '@/components/desktop/desktop-icon';
import { ContextMenu, menuAt, type MenuState } from '@/components/ui/context-menu';
import { appMenu, backgroundMenu, fileItemMenu } from '@/components/ui/file-menu-items';
import { applications, type AppId } from '@/data/applications';
import { useTileSelection } from '@/hooks/use-tile-selection';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import {
  clampIconPosition,
  defaultPositions,
  fileIdsOf,
  fileKey,
  iconMetrics,
  iconsInRect,
  snapToGrid,
  type IconPosition,
  type IconPositions,
} from '@/lib/desktop-icons';
import { desktopIconStore } from '@/lib/desktop-icons-store';
import { fileStore, useFiles } from '@/lib/files/store';
import { childrenOf } from '@/lib/files/tree';
import type { FileNode } from '@/lib/files/types';
import type { Rect } from '@/lib/selection';
import { useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';

const desktopApps: AppId[] = Object.values(applications)
  .filter((app) => app.onDesktop)
  .map((app) => app.id);

export function DesktopIcons() {
  const { workspace, open } = useWindowManager();
  const { nodes, clipboard } = useFiles();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
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
  const folderKeys = entries
    .filter((entry) => entry.kind === 'file' && entry.node.kind === 'folder')
    .map((entry) => entry.key);

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
  // Мемоизация здесь по делу: рамка выделения меняет состояние на каждом кадре
  // жеста, а раскладка от неё не зависит.
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

  const hitTest = (rect: Rect) => iconsInRect(placed, ids, rect, metrics);

  const {
    selectedKeys,
    selectOnly,
    clearSelection,
    selectForPointer,
    marqueeBoxRef,
    startMarquee,
  } = useTileSelection({ ids, containerRef: listRef, hitTest });

  /** Создаёт узел и кладёт его туда, где вызвали меню. */
  const createAt = (kind: FileNode['kind'], point: IconPosition) => {
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
  };

  const openNode = (node: FileNode) =>
    open(node.kind === 'folder' ? 'folder' : 'editor', { fileId: node.id });

  const removeNodes = (targets: string[]) => {
    fileStore.removeMany(targets);
    clearSelection();
  };

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
        const point = { x: event.clientX, y: event.clientY };
        setMenu(
          menuAt(
            event,
            backgroundMenu({
              parentId: null,
              onCreate: (kind) => createAt(kind, point),
              onArrange: () => desktopIconStore.reset(ids, workspace, metrics),
            }),
          ),
        );
      }}
    >
      {/* Рамка выделения. Внутри списка её держит `li`: `div` здесь был бы
          недопустимым потомком `ul`. */}
      <li aria-hidden>
        <div
          ref={marqueeBoxRef}
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
                  ? fileItemMenu(entry.node, targets, {
                      onOpen: openNode,
                      onRename: (node) => setRenamingKey(fileKey(node.id)),
                      onDelete: removeNodes,
                    })
                  : appMenu(entry.app, () => open(entry.app)),
              ),
            );
          }}
        />
      ))}

      {menu ? <ContextMenu {...menu} onClose={() => setMenu(null)} /> : null}
    </ul>
  );
}
