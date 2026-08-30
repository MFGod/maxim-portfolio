'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAmbience } from '@/hooks/use-ambience';
import { useContainerWide } from '@/hooks/use-container-width';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useTranslate } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useResolvedTheme, useSetting } from '@/lib/settings/hooks';
import { detectWorldQuality } from '@/lib/world/use-world-support';
import { DEV_TOOLS } from '@/lib/world/dev-tools';
import { stations } from '@/lib/world/shots';
import type { ControlMode, World } from '@/lib/world/scene';

import { WorldMenu } from './world-menu';
import { WorldStick } from './world-stick';

/**
 * Инструменты подбора. Отдельным чанком и только в разработке: `DEV_TOOLS` —
 * литерал, который сборщик сворачивает в `false`, и вся ветка вместе с
 * оверлеем, `dev-console` и модулями `dev-*` в прод-бандл не попадает.
 */
const WorldDevOverlay = DEV_TOOLS
  ? dynamic(() => import('./world-dev-overlay').then((m) => m.WorldDevOverlay), {
      ssr: false,
    })
  : null;

/** Положение камеры, с которым мир открывается. */
const INITIAL_MODE: ControlMode = 'fps';

/** Канвас мира. Единственное место, где сцена встречается с React. */
type Props = {
  /**
   * Обстановка вокруг канваса: полоса загрузки и переключатель камеры. На
   * рабочем столе не нужна — там мир только фон, а органы управления у окон.
   */
  chrome?: boolean;
  /**
   * Принимает ли мышь. На столе выключено: сверху живут ярлыки, рамка выделения
   * и окна, и перехват указателя ломает их все.
   */
  interactive?: boolean;
  /** Занять весь родительский блок вместо фиксированной высоты в окне. */
  fill?: boolean;
  /**
   * Куда ведёт выход из мира. Пункт появляется в меню только с этим адресом:
   * на рабочем столе мир — фон, и уходить из него некуда.
   */
  homeHref?: string;
  className?: string;
};

export function WorldCanvas({
  chrome = true,
  interactive = true,
  fill = false,
  homeHref,
  className,
}: Props = {}) {
  const t = useTranslate();
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  /** Мир не собрался: геометрия не приехала. */
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<ControlMode>(INITIAL_MODE);
  /** Идёт ли кинематографический вход: пока идёт, показываем «пропустить». */
  const [flying, setFlying] = useState(false);
  /** На какой станции стоим. Первая — благодать под Древом, начало пути. */
  const [station, setStation] = useState(0);
  /** Пройденная глава по счёту мира: её же копит панель навыков. */
  /** Мир в облёте — хранитель экрана. */
  const [resting, setResting] = useState(false);
  /**
   * Фоновая музыка. Только там, где есть обстановка: на рабочем столе мир —
   * фон без меню, и звук оттуда было бы нечем выключить.
   */
  const ambience = useAmbience(chrome);
  /** Подсказка про осмотр: гаснет, как только указатель тронул сцену. */
  const [hinted, setHinted] = useState(false);
  /** Раскрыта ли книга-резюме. Само состояние живёт в сцене, здесь — отражение. */
  const [bookOpen, setBookOpen] = useState(false);
  /**
   * Номер разворота на виду. Тоже отражение: книгу листают и щелчком по самой
   * странице, поэтому число приходит из сцены, а не считается здесь.
   */
  const [spread, setSpread] = useState(0);
  /** Сколько всего разворотов. Ноль до загрузки книги — полоса тогда и не видна. */
  const [spreads, setSpreads] = useState(0);

  const roomy = useContainerWide(frameRef, 560);
  /**
   * Грубый указатель — палец. Клавиатуры при нём обычно нет, и ход по миру в
   * виде от первого лица приходится отдавать экранному стику.
   */
  const coarsePointer = useMediaQuery('(pointer: coarse)');

  const animations = useSetting((settings) => settings.motion.animations);
  const animationsRef = useRef(animations);
  useEffect(() => {
    animationsRef.current = animations;
  }, [animations]);

  const locale = useSetting((settings) => settings.language);
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
    worldRef.current?.book.relabel();
  }, [locale]);

  const theme = useResolvedTheme();
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
    worldRef.current?.relight();
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let observer: ResizeObserver | null = null;

    const boot = async () => {
      const { createWorld } = await import('@/lib/world/scene');
      if (disposed) return;

      const world = createWorld(canvas, {
        onProgress: setProgress,
        quality: detectWorldQuality(),
        reducedMotion: () => animationsRef.current !== 'full',
        locale: () => localeRef.current,
        theme: () => themeRef.current,
        onRest: setResting,
        onBook: setBookOpen,
        onSpread: setSpread,
        onFailed: () => setFailed(true),
        onLoaded: () => {
          setReady(true);
          setSpreads(world.book.spreadCount);
          setSpread(world.book.spread);

          world.setControlMode(INITIAL_MODE);

          const first = stations()[0];
          if (!first) return;

          world.rig.fly([first.shot], { instant: true });
          world.rig.setStationLook(true);
        },
      });
      worldRef.current = world;
    };

    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      void boot();
    } else {
      observer = new ResizeObserver(() => {
        if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
        observer?.disconnect();
        observer = null;
        void boot();
      });
      observer.observe(canvas);
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, []);

  const liveWorld = useCallback(() => worldRef.current, []);

  const switchMode = (next: ControlMode) => {
    setMode(next);
    worldRef.current?.setControlMode(next);
  };

  const skipFlight = () => {
    worldRef.current?.rig.cancel();
  };

  const stops = stations();

  const toggleBook = () => {
    const world = worldRef.current;
    if (!world) return;

    world.book.toggle();
    setBookOpen(world.book.opened);
  };

  /** Убирает раскрытую книгу. */
  const closeBook = () => {
    const world = worldRef.current;
    if (!world) return;

    world.book.close();
    setBookOpen(world.book.opened);
  };

  /** Листает разворот кнопкой полосы. */
  const turnBook = (step: 1 | -1) => () => {
    const world = worldRef.current;
    if (!world) return;

    if (step === 1) void world.book.next();
    else void world.book.previous();
  };

  useEffect(() => {
    if (!bookOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      const world = worldRef.current;
      if (!world?.book.opened) return;

      world.book.close();
      setBookOpen(false);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bookOpen]);

  /** Раскрывает книгу сразу на подсказках. */
  const openGuide = () => {
    const world = worldRef.current;
    if (!world) return;

    world.book.guide();
    setBookOpen(world.book.opened);
  };

  const goToStation = (index: number) => {
    const world = worldRef.current;
    const stop = stops[index];
    if (!world || !stop) return;

    setStation(index);
    setFlying(true);
    void world.rig.flyTo(stop.shot, { freeLook: true }).finally(() => setFlying(false));
  };

  return (
    <div
      ref={frameRef}
      className={cn(
        'relative overflow-hidden',
        chrome && !fill && 'border-line-subtle bg-surface-2 rounded-sm border',
        fill && 'h-full w-full',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={() => setHinted(true)}
        className={cn(
          'block w-full',
          chrome && !fill ? 'h-[min(60vh,480px)]' : 'h-full',
          'transition-opacity duration-(--duration-slow)',
          ready ? 'opacity-100' : 'opacity-0',
          !interactive && 'pointer-events-none',
        )}
      />

      {chrome && !ready && !failed ? (
        <div className="bg-surface-1/80 absolute inset-0 grid place-items-center backdrop-blur-sm">
          <div className="w-48">
            <p className="text-2xs text-ink-muted text-center font-mono">
              {t('world.loading')} {Math.round(progress * 100)}%
            </p>
            <div className="bg-line mt-2 h-0.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-accent h-full transition-[width] duration-(--duration-fast)"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {chrome && failed ? (
        <div className="bg-surface-1/80 absolute inset-0 grid place-items-center backdrop-blur-sm">
          <div className="max-w-72 text-center">
            <p className="text-ink text-sm">{t('world.failed.title')}</p>
            <p className="text-2xs text-ink-muted mt-1.5">{t('world.failed.hint')}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="border-line-subtle text-ink-muted hover:text-ink mt-3 rounded-sm border px-2.5 py-1.5 text-xs"
            >
              {t('world.failed.retry')}
            </button>
          </div>
        </div>
      ) : null}

      {chrome && ready && !resting && !bookOpen ? (
        <nav
          aria-label={t('world.steps.label')}
          className={cn(
            'border-book-rule bg-glass-book absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-sm border p-1 shadow-sm backdrop-blur-sm',
            coarsePointer && mode === 'fps' && 'right-5 left-auto translate-x-0',
          )}
        >
          <button
            type="button"
            onClick={() => goToStation(station - 1)}
            disabled={station <= 0}
            className={cn(
              'text-book-ink-muted hover:text-book-ink rounded-xs py-1.5 text-xs whitespace-nowrap disabled:opacity-35',
              roomy ? 'px-2.5' : 'px-2',
            )}
          >
            {t('world.steps.back')}
          </button>

          <p className="text-2xs text-book-ink-muted min-w-0 px-1 text-center font-mono whitespace-nowrap">
            {station + 1}/{stops.length}
          </p>

          <button
            type="button"
            onClick={() => goToStation(station + 1)}
            disabled={station >= stops.length - 1}
            className={cn(
              'text-book-ink-muted hover:text-book-ink rounded-xs py-1.5 text-xs whitespace-nowrap disabled:opacity-35',
              roomy ? 'px-2.5' : 'px-2',
            )}
          >
            {t('world.steps.next')}
          </button>

          {flying ? (
            <button
              type="button"
              onClick={skipFlight}
              className={cn(
                'border-book-rule text-book-ink-muted hover:text-book-ink ml-1 rounded-xs border-l py-1.5 text-xs whitespace-nowrap',
                roomy ? 'px-2.5' : 'px-2',
              )}
            >
              {t('world.controls.skip')}
            </button>
          ) : null}
        </nav>
      ) : null}

      {chrome && ready && !resting && bookOpen && spreads > 0 ? (
        <nav
          aria-label={t('world.book.label')}
          className="border-book-rule bg-glass-book absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-sm border p-1 shadow-sm backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={turnBook(-1)}
            disabled={spread <= 0}
            aria-label={t('world.book.previous')}
            className={cn(
              'text-book-ink-muted hover:text-book-ink rounded-xs py-1.5 text-xs disabled:opacity-35',
              roomy ? 'px-2.5' : 'px-2',
            )}
          >
            ‹
          </button>

          <p className="text-2xs text-book-ink-muted min-w-0 px-1 text-center font-mono whitespace-nowrap">
            {spread + 1}/{spreads}
          </p>

          <button
            type="button"
            onClick={turnBook(1)}
            disabled={spread >= spreads - 1}
            aria-label={t('world.book.next')}
            className={cn(
              'text-book-ink-muted hover:text-book-ink rounded-xs py-1.5 text-xs disabled:opacity-35',
              roomy ? 'px-2.5' : 'px-2',
            )}
          >
            ›
          </button>

          <button
            type="button"
            onClick={closeBook}
            className={cn(
              'border-book-rule text-book-ink-muted hover:text-book-ink ml-1 rounded-xs border-l py-1.5 text-xs whitespace-nowrap',
              roomy ? 'px-2.5' : 'px-2',
            )}
          >
            {t('world.book.closeShort')}
          </button>
        </nav>
      ) : null}

      {chrome && ready && !resting && !hinted && !flying && !bookOpen ? (
        <p className="text-2xs text-book-paper pointer-events-none absolute bottom-18 left-1/2 max-w-[min(90%,22rem)] -translate-x-1/2 text-center font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
          {t('world.steps.hint')}
        </p>
      ) : null}

      {chrome && ready && !resting ? (
        <WorldMenu
          mode={mode}
          onMode={switchMode}
          bookOpen={bookOpen}
          onToggleBook={toggleBook}
          onGuide={openGuide}
          ambience={ambience.choice}
          onAmbience={ambience.select}
          volume={ambience.volume}
          onVolume={ambience.setVolume}
          homeHref={homeHref}
        />
      ) : null}

      {chrome && ready && !resting && !bookOpen && coarsePointer && mode === 'fps' ? (
        <WorldStick onMove={(x, z) => worldRef.current?.rig.setMove(x, z)} />
      ) : null}

      {WorldDevOverlay && chrome ? (
        <WorldDevOverlay world={liveWorld} canvas={canvasRef} ready={ready} />
      ) : null}
    </div>
  );
}
