'use client';

import { motion, useReducedMotion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

import { applications } from '@/data/applications';
import { applyRect, useWindowGesture } from '@/hooks/use-window-gesture';
import { cn } from '@/lib/cn';
import { useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';
import type { Rect, WindowInstance } from '@/lib/window-manager/types';

import { ResizeHandles } from './resize-handles';
import { WindowControls } from './window-controls';

/** Шаг перемещения окна стрелками. С Shift — точная подгонка. */
const NUDGE_STEP = 24;
const NUDGE_STEP_FINE = 4;

type Props = {
  instance: WindowInstance;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/**
 * Окно на рабочем столе. Внешний узел отвечает только за геометрию, анимация
 * живёт во вложенном: motion переписывает `transform`, и смешивать их нельзя.
 */
export function WindowFrame({ instance, title, subtitle, children }: Props) {
  const {
    workspace,
    focus,
    requestClose,
    minimize,
    toggleMaximize,
    state,
    commitRect,
  } = useWindowManager();
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const systemReduceMotion = useReducedMotion();
  const animationLevel = useSetting((settings) => settings.motion.animations);
  const windowAnimations = useSetting((settings) => settings.motion.windowAnimations);

  const animate = windowAnimations && animationLevel !== 'off' && !systemReduceMotion;
  const duration = animationLevel === 'reduced' ? 0.12 : 0.2;

  const isGlass = applications[instance.app].chrome === 'glass';
  const isFocused = state.focusedId === instance.id;
  const isMaximized = instance.status === 'maximized';
  const isMinimized = instance.status === 'minimized';
  const zIndex = state.order.indexOf(instance.id);

  const handleFocus = useCallback(() => focus(instance.id), [focus, instance.id]);
  const handleCommit = useCallback(
    (rect: Rect) => commitRect(instance.id, rect),
    [commitRect, instance.id],
  );

  const { startMove, startResize, nudge } = useWindowGesture({
    nodeRef,
    app: instance.app,
    rect: instance.rect,
    workspace,
    disabled: isMaximized,
    onGestureStart: handleFocus,
    onCommit: handleCommit,
  });

  useEffect(() => {
    if (nodeRef.current) applyRect(nodeRef.current, instance.rect);
  }, [instance.rect]);

  // Открытое окно забирает фокус себе. Иначе фокус остаётся на ярлыке или
  // кнопке дока, которыми окно открыли, и первое нажатие клавиши — тот же
  // `Esc` — подсвечивает их кольцом фокуса уже на пустом столе.
  const takesFocusOnMount = useRef(
    instance.status !== 'minimized' && state.focusedId === instance.id,
  );
  useEffect(() => {
    if (takesFocusOnMount.current) sectionRef.current?.focus({ preventScroll: true });
  }, []);

  const handleTitleBarDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    toggleMaximize(instance.id);
  };

  const handleTitleBarKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? NUDGE_STEP_FINE : NUDGE_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    nudge(move[0], move[1]);
  };

  return (
    <div
      ref={nodeRef}
      data-window={instance.id}
      data-focused={isFocused || undefined}
      style={
        {
          '--win-x': `${instance.rect.x}px`,
          '--win-y': `${instance.rect.y}px`,
          '--win-w': `${instance.rect.width}px`,
          '--win-h': `${instance.rect.height}px`,
          transform: 'translate3d(var(--win-x), var(--win-y), 0)',
          width: 'var(--win-w)',
          height: 'var(--win-h)',
          zIndex,
        } as CSSProperties
      }
      className={cn(
        'pointer-events-auto fixed top-0 left-0 will-change-transform',
        isMinimized && 'hidden',
      )}
    >
      <motion.section
        ref={sectionRef}
        role="dialog"
        aria-label={title}
        tabIndex={-1}
        {...(isMinimized ? { inert: true } : {})}
        onPointerDownCapture={handleFocus}
        onFocusCapture={handleFocus}
        initial={animate ? { opacity: 0, scale: 0.97 } : false}
        animate={{ opacity: 1, scale: 1 }}
        exit={animate ? { opacity: 0, scale: 0.98 } : { opacity: 0 }}
        transition={{ duration: animate ? duration : 0, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'rounded-window flex size-full flex-col overflow-hidden outline-none',
          'transition-shadow duration-(--duration-base)',
          isGlass
            ? 'bg-glass-hud backdrop-blur-(--glass-blur-soft)'
            : 'bg-glass-window backdrop-blur-(--glass-blur)',
          isGlass && 'shadow-none',
          !isGlass &&
            (isFocused
              ? 'shadow-(--shadow-window-focused)'
              : 'shadow-(--shadow-window)'),
        )}
      >
        <header
          onPointerDown={startMove}
          onDoubleClick={handleTitleBarDoubleClick}
          onKeyDown={handleTitleBarKeyDown}
          tabIndex={0}
          role="toolbar"
          aria-label={`Управление окном «${title}». Стрелки перемещают окно`}
          aria-orientation="horizontal"
          className={cn(
            'flex h-(--titlebar-height) shrink-0 items-center gap-3 px-3.5',
            'touch-none select-none',
            isGlass
              ? 'bg-transparent'
              : cn(
                  'border-line-subtle border-b',
                  isFocused ? 'bg-surface-2' : 'bg-surface-1',
                ),
          )}
        >
          <WindowControls
            title={title}
            isMaximized={isMaximized}
            onClose={() => requestClose(instance.id)}
            onMinimize={() => minimize(instance.id)}
            onToggleMaximize={() => toggleMaximize(instance.id)}
          />
          <div className="flex min-w-0 flex-1 items-baseline justify-center gap-2">
            <span
              className={cn(
                'truncate text-xs font-medium tracking-wide',
                isFocused ? 'text-ink' : 'text-ink-faint',
              )}
            >
              {title}
            </span>
            {subtitle ? (
              <span className="text-2xs text-ink-faint truncate font-mono">
                {subtitle}
              </span>
            ) : null}
          </div>
          <div aria-hidden className="w-[52px] shrink-0" />
        </header>

        <div
          className={cn(
            'min-h-0 flex-1',
            isGlass
              ? 'overflow-hidden'
              : 'scrollbar-thin overflow-y-auto overscroll-contain',
          )}
        >
          {children}
        </div>

        {isMaximized ? null : <ResizeHandles onStart={startResize} />}
      </motion.section>
    </div>
  );
}
