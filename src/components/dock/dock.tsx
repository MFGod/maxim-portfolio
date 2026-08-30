'use client';

import { Fragment, useCallback, useEffect, useRef } from 'react';

import { appHint, appTitle, labelOf } from '@/components/applications/app-registry';
import type { IconComponent } from '@/components/ui/icons';
import { applications, dockGroups, dockOrder } from '@/data/applications';
import { cn } from '@/lib/cn';
import { useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';
import type { WindowInstance } from '@/lib/window-manager/types';

/** Насколько близко к нижнему краю должен подойти курсор, чтобы док выехал. */
const PEEK_ZONE = 72;
/** Прирост масштаба под курсором и радиус, на котором эффект гаснет. */
const MAGNIFY_GAIN = 0.45;
const MAGNIFY_RADIUS = 130;

export function Dock() {
  const { open, focus, state } = useWindowManager();
  const locale = useSetting((settings) => settings.language);
  const autoHide = useSetting((settings) => settings.desktop.autoHideDock);
  const magnify = useSetting((settings) => settings.desktop.dockMagnification);

  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useDockPeek(navRef, autoHide);
  const { onPointerMove, onPointerLeave } = useDockMagnify(listRef, magnify);

  /**
   * Свёрнутые окна живут отдельной группой справа — но только те, у которых нет
   * своей иконки в доке. У программы из дока эта иконка и есть её место: второй
   * плитки для того же окна быть не должно, состояние показывает метка под ней.
   */
  const minimized = state.order
    .map((id) => state.windows[id])
    .filter(
      (instance) =>
        instance?.status === 'minimized' && !dockOrder.includes(instance.app),
    );

  return (
    <nav
      ref={navRef}
      aria-label="Приложения"
      data-shell="dock"
      className="fixed inset-x-0 bottom-4 z-(--z-dock) flex justify-center px-4"
    >
      <ul
        ref={listRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className="border-line-subtle bg-glass-dock relative flex items-end gap-(--dock-gap) rounded-2xl border p-(--dock-padding) shadow-(--shadow-dock) backdrop-blur-(--glass-blur-strong)"
      >
        <span
          aria-hidden
          className="absolute inset-x-6 top-0 h-px opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(to right, transparent, var(--color-accent-dim), transparent)',
          }}
        />

        {dockGroups.map((group, index) => (
          <Fragment key={group.join()}>
            {index > 0 ? (
              <li
                role="separator"
                aria-orientation="vertical"
                className="bg-line-subtle mx-1.5 h-8 w-px self-center"
              />
            ) : null}

            {group.map((id) => {
              const app = applications[id];
              return (
                <DockButton
                  key={id}
                  icon={app.icon}
                  label={appTitle(id, locale)}
                  hint={appHint(id, locale)}
                  indicator={indicatorFor(state.windows[id]?.status)}
                  onActivate={() => open(id)}
                />
              );
            })}
          </Fragment>
        ))}

        {minimized.length > 0 ? (
          <>
            <li
              role="separator"
              aria-orientation="vertical"
              className="bg-line-subtle mx-1.5 h-8 w-px self-center"
            />

            {minimized.map((instance) => {
              if (!instance) return null;
              const label = labelOf(instance, locale).title;
              return (
                <DockButton
                  key={instance.id}
                  icon={applications[instance.app].icon}
                  label={label}
                  hint="свёрнуто, нажмите чтобы развернуть"
                  indicator="minimized"
                  onActivate={() => focus(instance.id)}
                />
              );
            })}
          </>
        ) : null}
      </ul>
    </nav>
  );
}

/**
 * Автоскрытие. Док уезжает вниз через CSS, сюда приходит только факт «курсор у
 * нижнего края». Атрибут пишется мимо React, поэтому движение мыши не
 * перерисовывает ни одного компонента.
 */
function useDockPeek(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!enabled) {
      node.removeAttribute('data-dock-peek');
      return;
    }

    let frame = 0;
    const handler = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      const y = event.clientY;
      frame = requestAnimationFrame(() => {
        const near = y >= window.innerHeight - PEEK_ZONE;
        if (near) node.setAttribute('data-dock-peek', '');
        else node.removeAttribute('data-dock-peek');
      });
    };

    window.addEventListener('pointermove', handler, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', handler);
      node.removeAttribute('data-dock-peek');
    };
  }, [ref, enabled]);
}

/**
 * Увеличение иконок по близости курсора. Масштаб пишется в CSS-переменную
 * каждой кнопки внутри `requestAnimationFrame`, состояние React не участвует.
 */
function useDockMagnify(
  ref: React.RefObject<HTMLUListElement | null>,
  enabled: boolean,
) {
  const frameRef = useRef(0);

  const reset = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    const items = ref.current?.querySelectorAll<HTMLElement>('[data-hover-lift]');
    items?.forEach((item) => item.style.removeProperty('--magnify'));
  }, [ref]);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  useEffect(() => reset, [reset]);

  const onPointerMove = (event: React.PointerEvent<HTMLUListElement>) => {
    if (!enabled) return;
    const list = ref.current;
    if (!list) return;

    const pointerX = event.clientX;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const items = list.querySelectorAll<HTMLElement>('[data-hover-lift]');
      items.forEach((item) => {
        const box = item.getBoundingClientRect();
        const distance = Math.abs(pointerX - (box.left + box.width / 2));
        const falloff = Math.max(0, 1 - distance / MAGNIFY_RADIUS);
        item.style.setProperty('--magnify', String(1 + MAGNIFY_GAIN * falloff));
      });
    });
  };

  return { onPointerMove, onPointerLeave: reset };
}

/** Метка под иконкой дока: свёрнутое окно важнее просто открытого. */
function indicatorFor(status: WindowInstance['status'] | undefined): Indicator {
  if (!status) return 'none';
  return status === 'minimized' ? 'minimized' : 'running';
}

type Indicator = 'none' | 'running' | 'minimized';

type DockButtonProps = {
  icon: IconComponent;
  label: string;
  hint: string;
  /**
   * Метка под иконкой: ромб — приложение открыто, кружок — окно свёрнуто и его
   * можно вернуть. Пусто — приложение не запущено.
   */
  indicator: Indicator;
  onActivate: () => void;
};

function DockButton({
  icon: Icon,
  label,
  hint,
  indicator,
  onActivate,
}: DockButtonProps) {
  const inner = (
    <>
      <span className="group-kbd-focus:scale-100 group-kbd-focus:opacity-100 pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 scale-95 opacity-0 transition-[opacity,transform] duration-(--duration-fast) group-hover:scale-100 group-hover:opacity-100">
        <span className="border-line-subtle bg-surface-2 text-2xs text-ink block rounded-md border px-2.5 py-1.5 whitespace-nowrap shadow-(--shadow-raised)">
          {label}
        </span>
      </span>

      <span
        data-hover-lift
        className={cn(
          'border-line-subtle bg-surface-2 grid size-(--dock-icon-size) origin-bottom scale-(--magnify,1) place-items-center rounded-xl border',
          'text-ink-muted transition-[transform,scale,color,border-color,box-shadow] duration-(--duration-fast)',
          'group-hover:border-accent-dim group-hover:text-accent group-hover:-translate-y-1 group-hover:shadow-(--glow-soft)',
          'group-kbd-focus:border-accent-dim group-kbd-focus:text-accent',
          'group-kbd-focus:outline-1 group-kbd-focus:outline-offset-2 group-kbd-focus:outline-(--color-focus)',
        )}
      >
        <Icon aria-hidden className="size-5" strokeWidth={1.5} />
      </span>

      <span
        aria-hidden
        className={cn(
          'mt-1 size-1.5 transition-[background-color,box-shadow] duration-(--duration-fast)',
          indicator === 'minimized' ? 'rounded-full' : 'rotate-45',
          indicator === 'none' ? 'bg-transparent' : 'bg-accent shadow-(--glow-soft)',
        )}
      />
    </>
  );

  return (
    <li>
      <button
        type="button"
        onClick={onActivate}
        aria-label={`${label} — ${hint}`}
        className="group kbd-focus:outline-none relative flex flex-col items-center rounded-xl outline-none"
      >
        {inner}
      </button>
    </li>
  );
}
