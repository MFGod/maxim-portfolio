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

import type { MenuItem } from '@/components/ui/context-menu';
import { applications, type AppId } from '@/data/applications';
import { fileStore } from '@/lib/files/store';
import type { FileNode } from '@/lib/files/types';

/**
 * Пункты контекстных меню для файловых объектов. Рабочий стол и проводник
 * показывают одни и те же команды над одними и теми же узлами — различия
 * (вставка внутрь папки, упорядочивание ярлыков) отмечены параметрами.
 */

type ItemActions = {
  onOpen: (node: FileNode) => void;
  onRename: (node: FileNode) => void;
  onDelete: (targets: string[]) => void;
};

type ItemOptions = {
  /** Показывать «Вставить в папку». На столе буфер вставляется на сам стол. */
  pasteInto?: boolean;
};

/** Меню объекта. Действия применяются ко всей группе, правка имени — к одному. */
export function fileItemMenu(
  node: FileNode,
  targets: string[],
  { onOpen, onRename, onDelete }: ItemActions,
  { pasteInto = false }: ItemOptions = {},
): MenuItem[] {
  const count = targets.length;
  const suffix = count > 1 ? ` (${count})` : '';

  return [
    {
      id: 'open',
      label: node.kind === 'folder' ? 'Открыть' : 'Открыть в редакторе',
      icon: node.kind === 'folder' ? Folder : NotepadText,
      disabled: count > 1,
      onSelect: () => onOpen(node),
    },
    {
      id: 'rename',
      label: 'Переименовать',
      icon: Pencil,
      separated: true,
      disabled: count > 1,
      onSelect: () => onRename(node),
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
    ...(pasteInto
      ? [
          {
            id: 'paste-into',
            label: 'Вставить в папку',
            icon: ClipboardPaste,
            disabled:
              count > 1 || node.kind !== 'folder' || !fileStore.canPaste(node.id),
            onSelect: () => fileStore.paste(node.id),
          },
        ]
      : []),
    {
      id: 'delete',
      label: `Удалить${suffix}`,
      icon: Trash2,
      danger: true,
      separated: true,
      onSelect: () => onDelete(targets),
    },
  ];
}

type BackgroundOptions = {
  /** Папка, в которую создаём и вставляем. `null` — рабочий стол. */
  parentId: string | null;
  onCreate: (kind: FileNode['kind']) => void;
  /** Раскладка ярлыков по сетке. Есть только у рабочего стола. */
  onArrange?: () => void;
};

/** Меню пустого места: создание объектов и вставка из буфера. */
export function backgroundMenu({
  parentId,
  onCreate,
  onArrange,
}: BackgroundOptions): MenuItem[] {
  return [
    {
      id: 'new-folder',
      label: 'Создать папку',
      icon: FolderPlus,
      onSelect: () => onCreate('folder'),
    },
    {
      id: 'new-text',
      label: 'Создать текстовый документ',
      icon: FilePlus,
      onSelect: () => onCreate('text'),
    },
    {
      id: 'paste',
      label: 'Вставить',
      icon: ClipboardPaste,
      separated: true,
      disabled: !fileStore.canPaste(parentId),
      onSelect: () => fileStore.paste(parentId),
    },
    ...(onArrange
      ? [
          {
            id: 'arrange',
            label: 'Упорядочить ярлыки',
            icon: LayoutGrid,
            separated: true,
            onSelect: onArrange,
          },
        ]
      : []),
  ];
}

/** Меню ярлыка программы: открыть — единственное, что с ним можно сделать. */
export function appMenu(app: AppId, onOpen: () => void): MenuItem[] {
  return [
    {
      id: 'open',
      label: 'Открыть',
      icon: applications[app].icon,
      onSelect: onOpen,
    },
  ];
}
