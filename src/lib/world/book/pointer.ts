/**
 * Указатель книги: клик по половине, кручение и перестановка закрытого тома.
 *
 * Отдельным узлом, потому что это единственная часть книги, которая работает с
 * DOM и с лучом, и обе её ловушки — про них, а не про листание. Сборке остаётся
 * сказать, куда попали и насколько потянули.
 *
 * Режима чтения нет и переключать нечего: попали в книгу — она забирает
 * событие, промахнулись — мир вертит камеру.
 */

import * as THREE from 'three';

/**
 * С какого сдвига нажатие считается протяжкой, в пикселях.
 *
 * Клик неподвижным не бывает: рука дёргает указатель на пиксель-другой между
 * нажатием и отпусканием, и без порога каждое открытие книги начиналось бы с
 * рывка обложки. Четыре пикселя дрожь перекрывают, а осознанное движение — нет.
 */
const DRAG_THRESHOLD = 4;

export type PointerOptions = {
  /** Канвас мира: по его прямоугольнику считаются нормированные координаты. */
  canvas: HTMLCanvasElement;
  /** Камера последнего кадра. `null`, пока кадра не было. */
  camera: () => THREE.Camera | null;
  /**
   * Части, по которым бьёт луч.
   *
   * Листающегося листа среди них быть не должно: `Raycaster` проверяет только
   * `layers` и не смотрит `visible`, а лист после переворота остаётся лежать
   * скрытым на левой стопке — клик по левой половине попадал в него.
   */
  targets: THREE.Object3D[];
  /** Принимает ли книга указатель вообще. */
  ready: () => boolean;
  /** Можно ли сейчас двигать книгу — крутить или переставлять. */
  draggable: () => boolean;
  /**
   * Протяжка с прошлого события, в пикселях.
   *
   * Модификатор читается на каждом событии, а не запоминается при нажатии:
   * зажал `Shift` посреди протяжки — книга поехала, отпустил — снова крутится.
   */
  drag: (dx: number, dy: number, moving: boolean) => void;
  /**
   * Куда попали. Зовётся только на клик без протяжки.
   *
   * Вторым доводом — координаты текстуры в точке попадания: по ним книга
   * решает, попал ли щелчок в ссылку. `null` у частей без развёртки — у
   * кромок крышки и у закладки.
   */
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
  /*
   * Слушатель висит на родителе канваса, а не на самом канвасе. OrbitControls
   * подписан на `pointerdown` канваса в фазе всплытия (без `capture`), и на
   * предке фаза захвата проходит раньше по спецификации — на самом же элементе
   * порядок зависел бы от порядка регистрации.
   */
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
    // Протянули — значит крутили, а не открывали. Иначе это клик.
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

    // Попали — мир этого события уже не увидит.
    event.stopPropagation();

    held = target;
    last = { x: event.clientX, y: event.clientY };
    travelled = 0;

    /*
     * Движение и отпускание слушаем у окна, а не у канваса: книгу крутят
     * размашисто, указатель уходит за края кадра, и на канвасе протяжка
     * обрывалась бы посреди оборота.
     */
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
