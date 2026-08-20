'use client';

import { useState, type RefObject } from 'react';

import { useIsomorphicLayoutEffect } from './use-isomorphic-layout-effect';

/**
 * Следит за шириной контейнера, а не вьюпорта: окно Settings сужается на
 * десктопе, и раскладка обязана меняться вместе с ним.
 */
export function useContainerWide(
  ref: RefObject<HTMLElement | null>,
  threshold: number,
): boolean {
  const [isWide, setIsWide] = useState(true);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setIsWide(entry.contentRect.width >= threshold);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return isWide;
}
