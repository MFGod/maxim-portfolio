'use client';

import { Folder, NotepadText } from 'lucide-react';
import type { IconComponent } from '@/components/ui/icons';
import { applications } from '@/data/applications';
import type { Modifiers } from '@/hooks/use-tile-selection';
import type { BrowserItem, ItemGroup } from '@/lib/files/browser-items';
import { fileStore } from '@/lib/files/store';

/** Формат MIME для переноса внутри окна. Своё имя — чтобы не ловить чужие данные. */
export const DRAG_TYPE = 'application/x-desktop-file';

export type { BrowserItem, ItemGroup, Modifiers };

/**
 * Всё, что режиму отображения нужно знать о состоянии и уметь сообщить наружу.
 * Логика выделения, буфера и меню живёт в `FileBrowser`: режимы отвечают только
 * за раскладку.
 */
export type ItemView = {
  /** Плоский список в порядке чтения: лента галереи и панели колонок. */
  items: BrowserItem[];
  /** Тот же список, разложенный по группам: режимы значков и списка. */
  groups: ItemGroup[];
  selected: ReadonlySet<string>;
  /** Идентификаторы вырезанных файлов: рисуются приглушённо. */
  cutIds: readonly string[];
  dropTargetId: string | null;
  renamingId: string | null;
  /** Что поедет за курсором, если тянуть этот объект. */
  dragIdsFor: (key: string) => string[];
  onSelect: (key: string, modifiers: Modifiers) => void;
  onSelectOnly: (key: string) => void;
  onOpen: (item: BrowserItem) => void;
  onMenu: (item: BrowserItem, event: React.MouseEvent) => void;
  onDropTarget: (id: string | null) => void;
  onRenameEnd: () => void;
};

export function iconFor(item: BrowserItem): IconComponent {
  if (item.kind === 'app') return applications[item.app].icon;
  return item.node.kind === 'folder' ? Folder : NotepadText;
}

/** Папка — единственный приёмник для переноса. */
function folderIdOf(item: BrowserItem): string | null {
  return item.kind === 'file' && item.node.kind === 'folder' ? item.node.id : null;
}

/**
 * Список идентификаторов из `dataTransfer`. Данные кладёт то же приложение, но
 * приходят они через браузер — разбираем как внешние.
 */
export function readDragIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

/**
 * Обработчики переноса мышью. Одни и те же в плитке и в строке: тянуть и
 * принимать умеют оба режима.
 */
export function dragProps(item: BrowserItem, view: ItemView) {
  const folderId = folderIdOf(item);

  return {
    draggable: item.kind === 'file',
    onDragStart: (event: React.DragEvent) => {
      if (!view.selected.has(item.key)) view.onSelectOnly(item.key);
      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(view.dragIdsFor(item.key)));
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (event: React.DragEvent) => {
      if (!folderId) return;
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      view.onDropTarget(folderId);
    },
    onDragLeave: () => view.onDropTarget(null),
    onDrop: (event: React.DragEvent) => {
      if (!folderId) return;
      event.preventDefault();
      event.stopPropagation();
      const ids = readDragIds(event.dataTransfer.getData(DRAG_TYPE));
      if (ids.length > 0) fileStore.moveMany(ids, folderId);
      view.onDropTarget(null);
    },
  };
}

/** Состояния оформления, общие для плитки и строки. */
export function stateClasses(item: BrowserItem, view: ItemView) {
  const selected = view.selected.has(item.key);
  const folderId = folderIdOf(item);
  const dropTarget = folderId !== null && folderId === view.dropTargetId;
  const cut = item.kind === 'file' && view.cutIds.includes(item.node.id);
  return { selected, dropTarget, cut };
}
