'use client';

import { ArrowLeft, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { useTranslate } from '@/lib/i18n';
import { AMBIENCE_TRACKS, SILENCE, type AmbienceChoice } from '@/lib/world/ambience';
import type { ControlMode } from '@/lib/world/scene';

/** Меню мира: всё управление, кроме перехода между местами работы. */
type Props = {
  mode: ControlMode;
  onMode: (mode: ControlMode) => void;
  bookOpen: boolean;
  onToggleBook: () => void;
  /** Открыть книгу на развороте подсказок. */
  onGuide: () => void;
  /** Что играет фоном. `SILENCE` — ничего. */
  ambience: AmbienceChoice;
  onAmbience: (choice: AmbienceChoice) => void;
  /** Громкость фона, доля от нуля до единицы. */
  volume: number;
  onVolume: (volume: number) => void;
  /** Куда ведёт выход из мира. Без адреса пункта в меню нет. */
  homeHref?: string;
};

/** Вкладки панели. «Мир» — то, за чем приходят чаще, поэтому она и открыта. */
type Tab = 'world' | 'settings';

/** Пункт меню. Кнопка и ссылка отличаются только тегом, вид у них один. */
const ITEM =
  'flex w-full items-center gap-2 rounded-xs px-2.5 py-1.5 text-left text-xs transition-colors duration-(--duration-fast)';

/** Заголовок раздела внутри вкладки. */
const SECTION =
  'text-book-ink-muted px-2.5 pt-1 pb-1 font-mono text-[0.6875rem] tracking-wide uppercase';

/** Сегмент из двух положений: видно оба сразу, читать нечего. */
const SEGMENT = 'border-book-rule/60 mb-1 flex gap-0.5 rounded-xs border p-0.5';

const SEGMENT_ITEM =
  'flex-1 rounded-xs px-2 py-1 text-[0.6875rem] whitespace-nowrap transition-colors duration-(--duration-fast)';

/**
 * Подпись под списком записей — не вежливость, а условие лицензии: без имени
 * автора и ссылки на лицензию право использовать запись не действует. Считается
 * из самой описи, чтобы новая запись не могла приехать без подписи.
 */
const CREDITS = [
  ...new Map(
    AMBIENCE_TRACKS.map((track) => [`${track.author}|${track.license}`, track]),
  ).values(),
];

export function WorldMenu({
  mode,
  onMode,
  bookOpen,
  onToggleBook,
  onGuide,
  ambience,
  onAmbience,
  volume,
  onVolume,
  homeHref,
}: Props) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('world');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && root.current?.contains(target)) return;
      setOpen(false);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.stopPropagation();
      setOpen(false);
    };

    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={root} className="absolute top-5 right-5">
      <button
        type="button"
        aria-expanded={open}
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
          aria-label={t('world.menu.label')}
          className="bg-glass-book border-book-rule absolute top-full right-0 mt-1.5 w-60 rounded-sm border p-1 shadow-md backdrop-blur-sm"
        >
          <div role="tablist" aria-label={t('world.menu.label')} className={SEGMENT}>
            {(['world', 'settings'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                id={`world-menu-tab-${option}`}
                aria-selected={tab === option}
                aria-controls={`world-menu-panel-${option}`}
                onClick={() => setTab(option)}
                className={cn(
                  SEGMENT_ITEM,
                  tab === option
                    ? 'bg-book-accent text-book-paper'
                    : 'text-book-ink-muted hover:text-book-ink',
                )}
              >
                {t(
                  option === 'world' ? 'world.menu.tabWorld' : 'world.menu.tabSettings',
                )}
              </button>
            ))}
          </div>

          {tab === 'world' ? (
            <div
              role="tabpanel"
              id="world-menu-panel-world"
              aria-labelledby="world-menu-tab-world"
            >
              <p className={SECTION}>{t('world.book.label')}</p>

              <button
                type="button"
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
                    className={cn(ITEM, 'text-book-ink-muted hover:bg-book-paper')}
                  >
                    <ArrowLeft aria-hidden className="size-3.5" />
                    {t('world.screen.back')}
                  </Link>
                </>
              ) : null}
            </div>
          ) : (
            <div
              role="tabpanel"
              id="world-menu-panel-settings"
              aria-labelledby="world-menu-tab-settings"
            >
              <p className={SECTION}>{t('world.controls.label')}</p>

              <div className={SEGMENT}>
                {(['orbit', 'fps'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={mode === option}
                    onClick={() => onMode(option)}
                    className={cn(
                      SEGMENT_ITEM,
                      mode === option
                        ? 'bg-book-accent text-book-paper'
                        : 'text-book-ink-muted hover:text-book-ink',
                    )}
                  >
                    {t(
                      option === 'orbit'
                        ? 'world.controls.orbit'
                        : 'world.controls.fps',
                    )}
                  </button>
                ))}
              </div>

              <p className={SECTION}>{t('world.sound.label')}</p>

              <div role="radiogroup" aria-label={t('world.sound.label')}>
                {[SILENCE, ...AMBIENCE_TRACKS.map((track) => track.id)].map(
                  (option) => {
                    const track = AMBIENCE_TRACKS.find((item) => item.id === option);
                    const active = ambience === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onAmbience(option)}
                        className={cn(
                          ITEM,
                          active
                            ? 'bg-book-accent text-book-paper'
                            : 'text-book-ink hover:bg-book-paper',
                        )}
                      >
                        {track ? track.title : t('world.sound.silence')}
                      </button>
                    );
                  },
                )}
              </div>

              <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
                <input
                  type="range"
                  aria-label={t('world.sound.volume')}
                  value={volume}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(event) => onVolume(Number(event.target.value))}
                  className="accent-book-accent h-4 min-w-0 flex-1"
                />
                <span className="text-book-ink-muted w-9 shrink-0 text-right font-mono text-[0.6875rem] tabular-nums">
                  {Math.round(volume * 100)}%
                </span>
              </div>

              <p className="text-book-ink-muted px-2.5 pt-1.5 pb-1.5 text-[0.6875rem] leading-snug">
                {t('world.sound.credit')}{' '}
                {CREDITS.map((track, index) => (
                  <span key={track.id}>
                    {index > 0 ? '; ' : null}
                    {track.author},{' '}
                    <a
                      href={track.licenseUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hover:text-book-ink underline underline-offset-2"
                    >
                      {track.license}
                    </a>
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
