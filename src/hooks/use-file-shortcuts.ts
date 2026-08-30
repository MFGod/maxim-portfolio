'use client';

import type { KeyboardEvent } from 'react';

import { fileStore } from '@/lib/files/store';
import type { FileNode } from '@/lib/files/types';

type Options = {
  /** Открытая папка: буфер вставляется в неё. */
  parentId: string | null;
  /** Пока идёт правка имени, поле ввода забирает клавиши себе. */
  renaming: boolean;
  /** Файлы выделения: ярлыки программ сюда не попадают. */
  selectedFiles: string[];
  selectedCount: number;
  /** Единственный выделенный файл: под него открытие и правка имени. */
  single: FileNode | null;
  navigation: {
    canBack: boolean;
    canForward: boolean;
    canUp: boolean;
    onBack: () => void;
    onForward: () => void;
    onUp: () => void;
  };
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDelete: (targets: string[]) => void;
  onRename: (node: FileNode) => void;
  onOpen: (node: FileNode) => void;
};

/**
 * Клавиатура проводника: те же сочетания, что и в системном. Alt со стрелками
 * ходит по истории и поднимает на уровень выше, Ctrl — работает с буфером.
 */
export function useFileShortcuts({
  parentId,
  renaming,
  selectedFiles,
  selectedCount,
  single,
  navigation,
  onSelectAll,
  onClearSelection,
  onDelete,
  onRename,
  onOpen,
}: Options) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;

    if (event.altKey) {
      if (event.key === 'ArrowLeft' && navigation.canBack) navigation.onBack();
      else if (event.key === 'ArrowRight' && navigation.canForward) {
        navigation.onForward();
      } else if (event.key === 'ArrowUp' && navigation.canUp) navigation.onUp();
      else return;
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape' && selectedCount > 0) {
      event.preventDefault();
      onClearSelection();
      return;
    }
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      selectedFiles.length > 0
    ) {
      event.preventDefault();
      onDelete(selectedFiles);
      return;
    }
    if (event.key === 'F2' && single) {
      event.preventDefault();
      onRename(single);
      return;
    }
    if (event.key === 'Enter' && single) {
      event.preventDefault();
      onOpen(single);
      return;
    }
    if (!event.ctrlKey && !event.metaKey) return;

    const key = event.key.toLowerCase();
    if (key === 'a') onSelectAll();
    else if (key === 'x' && selectedFiles.length > 0) {
      fileStore.setClipboard({ ids: selectedFiles, mode: 'cut' });
    } else if (key === 'c' && selectedFiles.length > 0) {
      fileStore.setClipboard({ ids: selectedFiles, mode: 'copy' });
    } else if (key === 'v') fileStore.paste(parentId);
    else return;
    event.preventDefault();
  };
}
