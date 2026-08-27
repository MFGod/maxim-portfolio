'use client';

import type { BrowserItem } from '@/lib/files/browser-items';
import { fileStore } from '@/lib/files/store';
import type { FileNode, FileTree } from '@/lib/files/types';
import { useWindowManager } from '@/lib/window-manager';

type Options = {
  /** Открытая папка: в ней создаются новые объекты. */
  parentId: string | null;
  nodes: FileTree;
  selected: ReadonlySet<string>;
  /** Файлы выделения: ярлыки программ сюда не попадают. */
  selectedFiles: string[];
  onNavigate: (parentId: string | null) => void;
  onSelectOnly: (key: string) => void;
  onClearSelection: () => void;
  onRenameStart: (id: string) => void;
};

/**
 * Действия проводника над объектами: создание, открытие и удаление. Меню,
 * клавиатура и двойной клик зовут одно и то же — поэтому в одном месте.
 */
export function useFileActions({
  parentId,
  nodes,
  selected,
  selectedFiles,
  onNavigate,
  onSelectOnly,
  onClearSelection,
  onRenameStart,
}: Options) {
  const { open } = useWindowManager();

  /** Папка открывается в этом же окне, документ — в редакторе. */
  const openNode = (node: FileNode) => {
    if (node.kind === 'folder') onNavigate(node.id);
    else open('editor', { fileId: node.id });
  };

  return {
    openNode,

    create: (kind: FileNode['kind']) => {
      const created = fileStore.create(kind, parentId);
      if (!created) return;
      onSelectOnly(created.id);
      onRenameStart(created.id);
    },

    openItem: (item: BrowserItem) => {
      if (item.kind === 'app') open(item.app);
      else openNode(item.node);
    },

    removeNodes: (targets: string[]) => {
      fileStore.removeMany(targets);
      onClearSelection();
    },

    /** Что затронет действие меню: всё выделение или один объект под курсором. */
    targetsFor: (key: string): string[] =>
      selected.has(key) ? selectedFiles : nodes[key] ? [key] : [],
  };
}
