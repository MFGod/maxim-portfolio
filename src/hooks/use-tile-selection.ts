'use client';

import { useRef, useState, type RefObject } from 'react';

import { useMarquee } from '@/hooks/use-marquee';
import { extendTo, sameSet, toggle, type Rect } from '@/lib/selection';

/** Модификаторы, при которых клик и рамка добавляют к выделению, а не заменяют. */
export type Modifiers = Pick<React.MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>;

type Options = {
  /** Ключи плиток в порядке отображения: по нему считается диапазон Shift. */
  ids: string[];
  /** Контейнер, внутри которого тянется рамка. */
  containerRef: RefObject<HTMLElement | null>;
  /** Что попало в рамку. Вызывается на каждом кадре жеста. */
  hitTest: (rect: Rect) => string[];
  /**
   * Подготовка к рамке: замер плиток или отказ от жеста. `false` — рамку не
   * начинать, например когда список разбит на самостоятельные панели.
   */
  onMarqueeStart?: () => boolean | void;
};

/**
 * Выделение плиток: одиночное нажатие с модификаторами и рамка. Держит отсчёт
 * для Shift-диапазона и то, что было выделено до рамки — рамка дополняет
 * прежнее выделение с модификатором и начинает с чистого листа без него.
 */
export function useTileSelection<Box extends HTMLElement = HTMLDivElement>({
  ids,
  containerRef,
  hitTest,
  onMarqueeStart,
}: Options) {
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Отсчёт для Shift-диапазона: последний ярлык, выделенный обычным нажатием. */
  const [anchor, setAnchor] = useState<string | null>(null);

  const selectOnly = (key: string) => {
    setSelectedKeys(new Set([key]));
    setAnchor(key);
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
    setAnchor(null);
  };

  /**
   * Обновляет выделение по нажатию и сразу возвращает результат: перетаскивание
   * группы начинается в этом же событии и не может ждать следующего рендера.
   */
  const selectForPointer = (key: string, modifiers: Modifiers): ReadonlySet<string> => {
    if (modifiers.shiftKey) {
      const next = extendTo(ids, anchor, key);
      setSelectedKeys(next);
      return next;
    }
    if (modifiers.ctrlKey || modifiers.metaKey) {
      const next = toggle(selectedKeys, key);
      setSelectedKeys(next);
      setAnchor(key);
      return next;
    }
    if (selectedKeys.has(key)) return selectedKeys;

    const next = new Set([key]);
    setSelectedKeys(next);
    setAnchor(key);
    return next;
  };

  /**
   * Что было выделено до рамки: к этому добавляются попадания. С модификатором
   * рамка дополняет выделение, без него начинает с чистого листа.
   */
  const baseRef = useRef<ReadonlySet<string>>(new Set());
  /** Прошлые попадания: рамка пересчитывается каждый кадр, а меняется редко. */
  const hitsRef = useRef<ReadonlySet<string>>(new Set());

  const { boxRef, onPointerDown: beginMarquee } = useMarquee<Box>({
    containerRef,
    onSelect: (rect) => {
      const hits = new Set(hitTest(rect));
      if (sameSet(hits, hitsRef.current)) return;
      hitsRef.current = hits;
      setSelectedKeys(new Set([...baseRef.current, ...hits]));
      setAnchor(null);
    },
    onCancel: () => {
      hitsRef.current = new Set();
      setSelectedKeys(baseRef.current);
    },
  });

  /** Выделяет всё в текущем порядке: Ctrl+A. */
  const selectAll = () => {
    setSelectedKeys(new Set(ids));
    setAnchor(null);
  };

  /** Готовит рамку: запоминает исходное выделение и сбрасывает его без модификатора. */
  const startMarquee = (event: React.PointerEvent<HTMLElement>) => {
    if (onMarqueeStart?.() === false) return;

    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    baseRef.current = additive ? selectedKeys : new Set();
    hitsRef.current = new Set();
    if (!additive) clearSelection();
    beginMarquee(event);
  };

  return {
    selectedKeys,
    selectOnly,
    clearSelection,
    selectForPointer,
    selectAll,
    marqueeBoxRef: boxRef,
    startMarquee,
  };
}
