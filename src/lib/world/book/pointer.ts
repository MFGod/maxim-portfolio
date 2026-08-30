/** Указатель книги: клик по половине, кручение и перестановка закрытого тома. */

import * as THREE from 'three';

/** С какого сдвига нажатие считается протяжкой, в пикселях. */
const DRAG_THRESHOLD = 4;

export type PointerOptions = {
  /** Канвас мира: по его прямоугольнику считаются нормированные координаты. */
  canvas: HTMLCanvasElement;
  /** Камера последнего кадра. `null`, пока кадра не было. */
  camera: () => THREE.Camera | null;
  /** Части, по которым бьёт луч. */
  targets: THREE.Object3D[];
  /** Принимает ли книга указатель вообще. */
  ready: () => boolean;
  /** Можно ли сейчас двигать книгу — крутить или переставлять. */
  draggable: () => boolean;
  /** Протяжка с прошлого события, в пикселях. */
  drag: (dx: number, dy: number, moving: boolean) => void;
  /** Куда попали. Зовётся только на клик без протяжки. */
  pick: (object: THREE.Object3D, uv: THREE.Vector2 | null) => void;
};

export type BookPointer = {
  dispose: () => void;
};

export function createBookPointer({
  canvas,
  camera,
  targets,
  ready,
  draggable,
  drag,
  pick,
}: PointerOptions): BookPointer {
  const surface: HTMLElement = canvas.parentElement ?? canvas;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  /** Что держим: куда попали лучом, где указатель был в прошлый раз. */
  let held: { object: THREE.Object3D; uv: THREE.Vector2 | null } | null = null;
  let last = { x: 0, y: 0 };
  let travelled = 0;

  const hit = (
    event: PointerEvent,
  ): { object: THREE.Object3D; uv: THREE.Vector2 | null } | null => {
    const aim = camera();
    if (!aim) return null;

    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;

    pointer.x = ((event.clientX - box.left) / box.width) * 2 - 1;
    pointer.y = -((event.clientY - box.top) / box.height) * 2 + 1;

    raycaster.setFromCamera(pointer, aim);

    const found = raycaster.intersectObjects(targets, false)[0];
    if (!found) return null;

    return { object: found.object, uv: found.uv ?? null };
  };

  const release = () => {
    held = null;
    travelled = 0;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  };

  function onPointerMove(event: PointerEvent) {
    if (!held) return;

    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last = { x: event.clientX, y: event.clientY };

    travelled += Math.hypot(dx, dy);
    if (travelled < DRAG_THRESHOLD || !draggable()) return;

    drag(dx, dy, event.shiftKey);
  }

  function onPointerUp() {
    if (held && travelled < DRAG_THRESHOLD) pick(held.object, held.uv);
    release();
  }

  function onPointerCancel() {
    release();
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!ready()) return;

    const target = hit(event);
    if (!target) return;

    event.stopPropagation();

    held = target;
    last = { x: event.clientX, y: event.clientY };
    travelled = 0;

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  };

  surface.addEventListener('pointerdown', onPointerDown, { capture: true });

  return {
    dispose: () => {
      release();
      surface.removeEventListener('pointerdown', onPointerDown, { capture: true });
    },
  };
}
