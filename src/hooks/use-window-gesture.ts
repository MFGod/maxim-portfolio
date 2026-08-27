'use client';

import { type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

import type { AppId } from '@/data/applications';
import { usePointerDrag } from '@/hooks/use-pointer-drag';
import { constrainPosition, constrainSize } from '@/lib/window-manager/reducer';
import type { Rect, Workspace } from '@/lib/window-manager/types';
import { deepFreeze } from '@/lib/freeze';

export const RESIZE_EDGES = deepFreeze([
  'n',
  's',
  'e',
  'w',
  'ne',
  'nw',
  'se',
  'sw',
] as const);
export type ResizeEdge = (typeof RESIZE_EDGES)[number];

/** Геометрия окна живёт в CSS-переменных: жест переписывает их. */
export function applyRect(node: HTMLElement, rect: Rect): void {
  node.style.setProperty('--win-x', `${rect.x}px`);
  node.style.setProperty('--win-y', `${rect.y}px`);
  node.style.setProperty('--win-w', `${rect.width}px`);
  node.style.setProperty('--win-h', `${rect.height}px`);
}

function moveRect(start: Rect, dx: number, dy: number, workspace: Workspace): Rect {
  return constrainPosition({ ...start, x: start.x + dx, y: start.y + dy }, workspace);
}

/**
 * Новый прямоугольник при изменении размера. Западный и северный края компенсируют
 * зажатый до минимума размер, иначе окно смещается при упоре в минимум.
 */
function resizeRect(
  start: Rect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  app: AppId,
  workspace: Workspace,
): Rect {
  let { x, y, width, height } = start;

  if (edge.includes('e')) width = start.width + dx;
  if (edge.includes('s')) height = start.height + dy;
  if (edge.includes('w')) {
    width = start.width - dx;
    x = start.x + dx;
  }
  if (edge.includes('n')) {
    height = start.height - dy;
    y = start.y + dy;
  }

  const sized = constrainSize(app, { x, y, width, height }, workspace);

  if (edge.includes('w')) sized.x = start.x + start.width - sized.width;
  if (edge.includes('n')) sized.y = start.y + start.height - sized.height;

  return sized;
}

type Options = {
  nodeRef: RefObject<HTMLElement | null>;
  app: AppId;
  /** Прямоугольник из состояния: стартовая точка жеста. */
  rect: Rect;
  workspace: Workspace;
  disabled: boolean;
  onGestureStart: () => void;
  onCommit: (rect: Rect) => void;
};

/** Перемещение и изменение размера окна: указатель и клавиатура. */
export function useWindowGesture({
  nodeRef,
  app,
  rect,
  workspace,
  disabled,
  onGestureStart,
  onCommit,
}: Options) {
  const { begin } = usePointerDrag<Rect>({
    nodeRef,
    disabled,
    apply: applyRect,
    onStart: onGestureStart,
    onCommit,
  });

  const startMove = (event: ReactPointerEvent<HTMLElement>) =>
    begin({
      event,
      start: rect,
      compute: (start, dx, dy) => moveRect(start, dx, dy, workspace),
      guardInteractive: true,
    });

  const startResize = (event: ReactPointerEvent<HTMLElement>, edge: ResizeEdge) =>
    begin({
      event,
      start: rect,
      compute: (start, dx, dy) => resizeRect(start, edge, dx, dy, app, workspace),
    });

  const nudge = (dx: number, dy: number) => {
    if (disabled) return;
    onCommit(moveRect(rect, dx, dy, workspace));
  };

  return { startMove, startResize, nudge };
}
