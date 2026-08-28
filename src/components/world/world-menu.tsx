'use client';

import { ArrowLeft, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { useTranslate } from '@/lib/i18n';
import type { ControlMode } from '@/lib/world/scene';

/**
 * Меню мира: всё управление, кроме перехода между местами работы.
 *
 * Кнопки стояли по трём углам кадра — камера справа сверху, книга слева снизу,
 * выход из мира слева сверху, — и каждая была отдельной панелью тёмного
 * стекла. Мир на весь экран, в нём один предмет, и три разные плашки поверх
 * пейзажа читались обломками рабочего стола, а не частью места.
 *
 * Одеты в бумагу той же книги: у страницы и у панели один цвет и одна
 * гарнитура, поэтому панель читается вложенной в книгу закладкой, а не окном
 * поверх. Значения берутся из токенов `--color-book-*`.
 *
 * Переход между станциями в меню не уехал намеренно: это главный орган
 * управления миром, им пользуются постоянно, и прятать его за раскрытием
 * значило бы удваивать каждое движение по маршруту.
 */
type Props = {
  mode: ControlMode;
  onMode: (mode: ControlMode) => void;
  bookOpen: boolean;
  onToggleBook: () => void;
  /** Открыть книгу на развороте подсказок. */
  onGuide: () => void;
  /** Экранное затенение: мягкая тень в углах. Самая дорогая часть кадра. */
  occlusion: boolean;
  onOcclusion: (enabled: boolean) => void;
  /** Куда ведёт выход из мира. Пусто — пункта нет: на столе выходить некуда. */
  homeHref?: string;
};

/** Пункт меню. Кнопка и ссылка отличаются только тегом, вид у них один. */
const ITEM =
  'flex w-full items-center gap-2 rounded-xs px-2.5 py-1.5 text-left text-xs transition-colors duration-(--duration-fast)';

export function WorldMenu({
  mode,
  onMode,
  bookOpen,
  onToggleBook,
  onGuide,
  occlusion,
  onOcclusion,
  homeHref,
}: Props) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  /*
   * Закрытие по щелчку вне и по Escape.
   *
   * Слушатели вешаются только на раскрытое меню: мир под ними живёт своим
   * циклом кадров, и держать на документе два обработчика ради свёрнутой
   * панели незачем.
   */
  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && root.current?.contains(target)) return;
      setOpen(false);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    // Захват, а не всплытие: канвас мира глушит указатель на себе, и до
    // документа событие в фазе всплытия не доходит.
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="absolute top-3 right-3">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((was) => !was)}
        className={cn(
          'bg-glass-book text-book-ink flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs',
          'border-book-rule border shadow-sm backdrop-blur-sm',
          'transition-colors duration-(--duration-fast)',
          'hover:bg-book-paper',
        )}
      >
        {t('world.menu.label')}
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 transition-transform duration-(--duration-fast)',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t('world.menu.label')}
          className="bg-glass-book border-book-rule absolute top-full right-0 mt-1.5 w-60 rounded-sm border p-1 shadow-md backdrop-blur-sm"
        >
          <p className="text-book-ink-muted px-2.5 pt-1 pb-1 font-mono text-[0.6875rem] tracking-wide uppercase">
            {t('world.controls.label')}
          </p>

          <div className="border-book-rule/60 mb-1 flex gap-0.5 rounded-xs border p-0.5">
            {(['orbit', 'fps'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => onMode(option)}
                className={cn(
                  'flex-1 rounded-xs px-2 py-1 text-[0.6875rem] whitespace-nowrap transition-colors duration-(--duration-fast)',
                  mode === option
                    ? 'bg-book-accent text-book-paper'
                    : 'text-book-ink-muted hover:text-book-ink',
                )}
              >
                {t(option === 'orbit' ? 'world.controls.orbit' : 'world.controls.fps')}
              </button>
            ))}
          </div>

          <p className="text-book-ink-muted px-2.5 pt-1 pb-1 font-mono text-[0.6875rem] tracking-wide uppercase">
            {t('world.quality.label')}
          </p>

          {/*
            Тем же сегментом, что и камера: выбор из двух, где видно оба
            положения сразу. Флажок пришлось бы читать, а этот переключатель
            узнаётся по соседству с выбором камеры.
          */}
          <div className="border-book-rule/60 mb-1 flex gap-0.5 rounded-xs border p-0.5">
            {([true, false] as const).map((option) => (
              <button
                key={String(option)}
                type="button"
                aria-pressed={occlusion === option}
                onClick={() => onOcclusion(option)}
                className={cn(
                  'flex-1 rounded-xs px-2 py-1 text-[0.6875rem] whitespace-nowrap transition-colors duration-(--duration-fast)',
                  occlusion === option
                    ? 'bg-book-accent text-book-paper'
                    : 'text-book-ink-muted hover:text-book-ink',
                )}
              >
                {t(option ? 'world.quality.occlusionOn' : 'world.quality.occlusionOff')}
              </button>
            ))}
          </div>

          <p className="text-book-ink-muted px-2.5 pb-1.5 text-[0.6875rem] leading-snug">
            {t('world.quality.hint')}
          </p>

          <p className="text-book-ink-muted px-2.5 pt-1 pb-1 font-mono text-[0.6875rem] tracking-wide uppercase">
            {t('world.book.label')}
          </p>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleBook();
              setOpen(false);
            }}
            className={cn(ITEM, 'text-book-ink hover:bg-book-paper')}
          >
            {t(bookOpen ? 'world.book.close' : 'world.book.open')}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onGuide();
              setOpen(false);
            }}
            className={cn(ITEM, 'text-book-ink hover:bg-book-paper')}
          >
            {t('world.menu.guide')}
          </button>

          {homeHref ? (
            <>
              <div aria-hidden className="bg-book-rule/60 my-1 h-px" />
              <Link
                href={homeHref}
                role="menuitem"
                className={cn(ITEM, 'text-book-ink-muted hover:bg-book-paper')}
              >
                <ArrowLeft aria-hidden className="size-3.5" />
                {t('world.screen.back')}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
