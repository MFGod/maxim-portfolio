'use client';

import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { SELECT_KEY_ATTRIBUTE } from '@/hooks/use-marquee';
import { usePointerDrag } from '@/hooks/use-pointer-drag';
import {
  fileIdOf,
  fileIdsOf,
  fileKey,
  findIconAt,
  shiftPositions,
  type IconMetrics,
  type IconPosition,
  type IconPositions,
} from '@/lib/desktop-icons';
import { desktopIconStore } from '@/lib/desktop-icons-store';
import { fileStore } from '@/lib/files/store';
import type { Workspace } from '@/lib/window-manager/types';

/** Порог в пикселях: ниже него жест считается кликом. */
const DRAG_THRESHOLD = 4;

/** Смещение курсора: одно на всю перетаскиваемую группу. */
type DragOffset = { dx: number; dy: number };

type Options = {
  /** Узел плитки, за которую тянут. Остальные ярлыки группы ищутся рядом. */
  nodeRef: React.RefObject<HTMLElement | null>;
  /** Ключ этой плитки. */
  iconKey: string;
  /** Файл можно бросить в папку, ярлык программы — нет. */
  isFile: boolean;
  /** Где сейчас все ярлыки: по ним ищется папка-приёмник. */
  positions: IconPositions;
  folderKeys: string[];
  workspace: Workspace;
  metrics: IconMetrics;
};

function applyPosition(node: HTMLElement, position: IconPosition): void {
  node.style.setProperty('--icon-x', `${position.x}px`);
  node.style.setProperty('--icon-y', `${position.y}px`);
}

/**
 * Перетаскивание ярлыка вместе с выделенной группой. Во время жеста позиции
 * пишутся прямо в DOM, а в хранилище уходят один раз на `pointerup`. Группа,
 * отпущенная над папкой, переезжает внутрь неё.
 */
export function useIconDrag({
  nodeRef,
  iconKey,
  isFile,
  positions,
  folderKeys,
  workspace,
  metrics,
}: Options) {
  /** Что едет в этом жесте и откуда. Заполняется на нажатии. */
  const groupRef = useRef<IconPositions>({});
  const dropTargetRef = useRef<string | null>(null);

  /** Ярлык группы по ключу. Свой узел известен, остальные ищем рядом в списке. */
  const nodeFor = (key: string, self: HTMLElement): HTMLElement | null => {
    if (key === iconKey) return self;
    return (
      self.parentElement?.querySelector<HTMLElement>(
        `[${SELECT_KEY_ATTRIBUTE}="${key}"]`,
      ) ?? null
    );
  };

  /** Папка под центром перетаскиваемого ярлыка. Файл можно бросить внутрь. */
  const folderUnder = (next: IconPosition): string | null => {
    if (!isFile) return null;
    const center = {
      x: next.x + metrics.width / 2,
      y: next.y + metrics.height / 2,
    };
    const targets = folderKeys.filter((key) => !(key in groupRef.current));
    return findIconAt(positions, targets, center, metrics);
  };

  /** На каждом кадре двигаем всю группу и подсвечиваем папку под курсором. */
  const apply = (node: HTMLElement, offset: DragOffset) => {
    const next = shiftPositions(groupRef.current, offset, workspace, metrics);
    for (const [key, position] of Object.entries(next)) {
      const target = nodeFor(key, node);
      if (target) applyPosition(target, position);
    }

    const self = next[iconKey];
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
  };

  const commit = (offset: DragOffset) => {
    const next = shiftPositions(groupRef.current, offset, workspace, metrics);
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

    const folderId = target ? fileIdOf(target) : null;
    if (folderId) {
      const movedIds = fileStore.moveMany(fileIdsOf(Object.keys(next)), folderId);
      for (const id of movedIds) delete next[fileKey(id)];
    }

    desktopIconStore.moveMany(next);
  };

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

  /**
   * Начинает жест: запоминает исходные позиции группы. Своя позиция приходит
   * отдельно — до гидратации хранилища её в общей раскладке ещё нет.
   */
  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    group: Iterable<string>,
    position: IconPosition,
  ) => {
    const starts: IconPositions = { [iconKey]: position };
    for (const key of group) {
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
  };

  return { beginDrag, movedRef };
}
