'use client';

import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/**
 * Вложенные кнопки не должны начинать перетаскивание: ручка захватит указатель,
 * `pointerup` уйдёт ей, и клик по кнопке не случится.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('button, a, input, select, textarea, [role="button"]') !== null
  );
}

type BeginOptions<T> = {
  event: ReactPointerEvent<HTMLElement>;
  /** Значение на момент нажатия: точка отсчёта жеста. */
  start: T;
  /** Как смещение курсора превращается в новое значение. */
  compute: (start: T, dx: number, dy: number) => T;
  /** Отсекать нажатия на вложенных интерактивных элементах. */
  guardInteractive?: boolean;
  /** Порог в пикселях: пока курсор не ушёл дальше, жест не начинается. */
  threshold?: number;
};

type Options<T> = {
  /** Узел, которому пишем геометрию. */
  nodeRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
  apply: (node: HTMLElement, value: T) => void;
  onStart?: (node: HTMLElement) => void;
  onCommit: (value: T) => void;
};

/**
 * Перетаскивание на Pointer Events. Во время жеста React не перерисовывается:
 * значение пишется прямо в узел внутри `requestAnimationFrame`, а в состояние
 * уходит один раз на `pointerup`. `preventDefault` вызывается только после
 * старта жеста: до порога это обычный клик.
 */
export function usePointerDrag<T>({
  nodeRef,
  disabled = false,
  apply,
  onStart,
  onCommit,
}: Options<T>) {
  const activeRef = useRef(false);
  /** Было ли перетаскивание. По нему гасится следующий клик. */
  const movedRef = useRef(false);

  const begin = ({
    event,
    start,
    compute,
    guardInteractive = false,
    threshold = 0,
  }: BeginOptions<T>) => {
    if (disabled || event.button !== 0 || activeRef.current) return;
    if (guardInteractive && isInteractiveTarget(event.target)) return;

    const node = nodeRef.current;
    if (!node) return;

    const handle = event.currentTarget;
    const { pointerId, clientX: originX, clientY: originY } = event;

    let started = false;
    let latest = start;
    let frame = 0;

    activeRef.current = true;
    movedRef.current = false;

    const flush = () => {
      frame = 0;
      apply(node, latest);
    };

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - originX;
      const dy = moveEvent.clientY - originY;

      if (!started) {
        if (Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) return;
        started = true;
        movedRef.current = true;
        document.body.classList.add('dragging-surface');
        onStart?.(node);
      }

      moveEvent.preventDefault();
      latest = compute(start, dx, dy);
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const finish = () => {
      // Флаг снимается первым и без условий: если уборка ниже сорвётся,
      // следующий жест всё равно должен начаться. Иначе одна осечка гасит
      // перетаскивание навсегда.
      activeRef.current = false;

      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      try {
        if (handle.hasPointerCapture(pointerId)) {
          handle.releasePointerCapture(pointerId);
        }
      } catch {
        // Указателя уже нет — освобождать нечего.
      }
      document.body.classList.remove('dragging-surface');

      if (!started) return;
      apply(node, latest);
      onCommit(latest);
    };

    // Захват указателя — оптимизация, а не условие работы: он держит события
    // на узле, если курсор ушёл за его границы. Браузер вправе отказать
    // (указателя уже нет, узел вне документа), и тогда жест продолжается по
    // событиям окна — на них он и подписан.
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Работаем без захвата.
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  return { begin, movedRef };
}
