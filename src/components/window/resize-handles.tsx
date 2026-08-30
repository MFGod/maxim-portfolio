'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';

import { RESIZE_EDGES, type ResizeEdge } from '@/hooks/use-window-gesture';

/** Геометрия зон захвата. Углы перекрывают стороны, поэтому идут позже. */
const edgeClass: Record<ResizeEdge, string> = {
  n: 'left-2 right-2 top-0 h-1.5 pointer-coarse:h-4 cursor-ns-resize',
  s: 'left-2 right-2 bottom-0 h-1.5 pointer-coarse:h-4 cursor-ns-resize',
  e: 'top-2 bottom-2 right-0 w-1.5 pointer-coarse:w-4 cursor-ew-resize',
  w: 'top-2 bottom-2 left-0 w-1.5 pointer-coarse:w-4 cursor-ew-resize',
  ne: 'top-0 right-0 size-3 pointer-coarse:size-7 cursor-nesw-resize',
  nw: 'top-0 left-0 size-3 pointer-coarse:size-7 cursor-nwse-resize',
  se: 'bottom-0 right-0 size-3 pointer-coarse:size-7 cursor-nwse-resize',
  sw: 'bottom-0 left-0 size-3 pointer-coarse:size-7 cursor-nesw-resize',
};

type Props = {
  onStart: (event: ReactPointerEvent<HTMLElement>, edge: ResizeEdge) => void;
};

export function ResizeHandles({ onStart }: Props) {
  return (
    <>
      {RESIZE_EDGES.map((edge) => (
        <div
          key={edge}
          aria-hidden
          data-resize-edge={edge}
          onPointerDown={(event) => onStart(event, edge)}
          className={`absolute z-10 touch-none ${edgeClass[edge]}`}
        />
      ))}
    </>
  );
}
