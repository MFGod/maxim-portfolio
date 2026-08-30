'use client';

import { useEffect } from 'react';

/**
 * Отмечает на `<html>`, что человек ведёт навигацию с клавиатуры. Кольцо фокуса
 * рисуется только в этом режиме: при щелчке мышью оно ничего не сообщает, а в
 * текстовых полях браузер показывает его всегда — даже когда в поле просто
 * кликнули.
 */
export function useFocusModality(): void {
  useEffect(() => {
    const root = document.documentElement;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      root.setAttribute('data-nav', 'keyboard');
    };

    const handlePointerDown = () => root.removeAttribute('data-nav');

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('pointerdown', handlePointerDown, true);
      root.removeAttribute('data-nav');
    };
  }, []);
}
