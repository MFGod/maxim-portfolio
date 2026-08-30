'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

import type { IconComponent } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export type MenuItem = {
  id: string;
  label: string;
  icon?: IconComponent;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Отделить чертой от предыдущего пункта. */
  separated?: boolean;
};

export type MenuState = { x: number; y: number; items: MenuItem[] };

/** Позиция меню из события. Правый клик открывает его под курсором. */
export function menuAt(
  event: ReactMouseEvent | { clientX: number; clientY: number },
  items: MenuItem[],
): MenuState {
  return { x: event.clientX, y: event.clientY, items };
}

/** Отступ от края экрана, чтобы меню не прилипало к нему вплотную. */
const VIEWPORT_MARGIN = 8;

/**
 * Контекстное меню. Рисуется порталом в `body`: внутри окна его обрезало бы
 * прокруткой. Клавиатура обязательна — меню открывается и клавишей меню, и
 * долгим нажатием на сенсорном экране.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: MenuState & { onClose: () => void }) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x, y });
  const [armed, setArmed] = useState(false);
  const enabled = items.filter((item) => !item.disabled);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    const maxX = window.innerWidth - box.width - VIEWPORT_MARGIN;
    const maxY = window.innerHeight - box.height - VIEWPORT_MARGIN;
    setPosition({
      x: Math.max(VIEWPORT_MARGIN, Math.min(x, maxX)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(y, maxY)),
    });
    node.focus({ preventScroll: true });
  }, [x, y]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-(--z-menu)"
      onPointerDown={() => {
        if (armed) onClose();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={nodeRef}
        role="menu"
        aria-label="Контекстное меню"
        tabIndex={-1}
        style={{ left: position.x, top: position.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const buttons = Array.from(
            nodeRef.current?.querySelectorAll<HTMLButtonElement>(
              'button:not(:disabled)',
            ) ?? [],
          );
          if (buttons.length === 0) return;
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const step = event.key === 'ArrowDown' ? 1 : -1;
          const next = (current + step + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }}
        className={cn(
          'border-line bg-glass-window absolute min-w-52 rounded-lg border p-1 shadow-(--shadow-window-focused)',
          'backdrop-blur-(--glass-blur) outline-none',
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id}>
              {item.separated ? (
                <div aria-hidden className="bg-line-subtle my-1 h-px" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  onClose();
                  item.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm',
                  'transition-colors duration-(--duration-fast)',
                  item.disabled
                    ? 'text-ink-faint cursor-default opacity-50'
                    : item.danger
                      ? 'text-ink-muted hover:bg-danger/15 hover:text-danger kbd-focus:bg-danger/15'
                      : 'text-ink-muted hover:bg-surface-3 hover:text-ink kbd-focus:bg-surface-3',
                )}
              >
                {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
                <span className="truncate">{item.label}</span>
              </button>
            </div>
          );
        })}
        {enabled.length === 0 ? (
          <p className="text-ink-faint px-2.5 py-1.5 text-sm">Действий нет</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
