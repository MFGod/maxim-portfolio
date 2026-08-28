'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { experience } from '@/data/resume';
import { useTranslate } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useResolvedTheme, useSetting } from '@/lib/settings/hooks';
import { DEV_TOOLS } from '@/lib/world/dev-tools';
import { stations } from '@/lib/world/shots';
import type { ControlMode, World } from '@/lib/world/scene';

import { WorldMenu } from './world-menu';

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

/**
 * Канвас мира. Единственное место, где сцена встречается с React.
 *
 * Мир создаётся только когда у канваса появился ненулевой размер: OrbitControls
 * делит угол поворота на высоту элемента, и при нуле в позицию камеры попадает
 * NaN, после которого состояние контрола не лечится ничем, кроме пересоздания.
 */
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  /**
   * Мир не собрался: геометрия не приехала.
   *
   * Отдельно от `ready`, потому что это не «ещё не готов», а «уже не будет».
   * Без этого состояния отказ загрузки оставлял полосу замершей на её проценте,
   * и сайт выглядел зависшим — а причина обычно поправимая: сеть.
   */
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<ControlMode>('orbit');
  /** Идёт ли кинематографический вход: пока идёт, показываем «пропустить». */
  const [flying, setFlying] = useState(false);
  /** На какой станции стоим. Первая — благодать под Древом, начало пути. */
  const [station, setStation] = useState(0);
  /** Пройденная глава по счёту мира: её же копит панель навыков. */
  /**
   * Мир в облёте — хранитель экрана.
   *
   * Панели на это время уходят: ролик с забытым интерфейсом поверх читается
   * не миром, а брошенной вкладкой. Возвращает их любое касание — за этим
   * следит сцена, она же и сообщает сюда.
   */
  const [resting, setResting] = useState(false);
  /**
   * Экранное затенение: мягкая тень в углах.
   *
   * Состояние держится здесь, а не читается у мира каждый кадр: меняют его
   * раз в сеанс, а перерисовывать меню шестьдесят раз в секунду незачем.
   */
  const [occlusion, setOcclusion] = useState(true);
  /** Подсказка про осмотр: гаснет, как только мышь тронула сцену. */
  const [hinted, setHinted] = useState(false);
  /** Раскрыта ли книга-резюме. Само состояние живёт в сцене, здесь — отражение. */
  const [bookOpen, setBookOpen] = useState(false);

  const animations = useSetting((settings) => settings.motion.animations);
  /*
   * Настройка движения читается через ссылку: положить её в зависимости эффекта
   * значит пересобирать мир на 27 МБ при каждом переключении «покоя», а он
   * влияет ровно на один момент — как отработает вход.
   */
  const animationsRef = useRef(animations);
  useEffect(() => {
    animationsRef.current = animations;
  }, [animations]);

  /*
   * Язык — той же дорогой, что и покой: через ссылку, чтобы смена языка не
   * пересобирала мир. Страницы книги перерисовываются отдельной командой:
   * ключ слота языком уже помечен, и в пуле лежат обе версии разворота.
   */
  const locale = useSetting((settings) => settings.language);
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
    worldRef.current?.book.relabel();
  }, [locale]);

  /*
   * Тема — той же дорогой. Мир идёт за ней светом: полдень, открытый из
   * тёмного интерфейса, читается чужой вкладкой, а не продолжением сайта.
   */
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
      // Сцена весит мегабайты — грузим её только когда мир действительно нужен.
      const { createWorld } = await import('@/lib/world/scene');
      if (disposed) return;

      const world = createWorld(canvas, {
        onProgress: setProgress,
        // Через ссылку, а не значением: пересобирать мир на 27 МБ ради смены
        // настройки движения нельзя, а книге нужен ответ на момент перехода.
        reducedMotion: () => animationsRef.current !== 'full',
        locale: () => localeRef.current,
        theme: () => themeRef.current,
        /*
         * Счётчик станций идёт за миром. До главы доходят и пешком, минуя
         * «Назад» и «Дальше», — без этого полоса показывала бы вход, пока
         * посетитель стоит у Flexy.
         */
        onRest: setResting,
        // Щелчок по тому идёт мимо оболочки — луч ловит сама книга. Без этого
        // дорожка глав оставалась бы на кадре под раскрытым разворотом.
        onBook: setBookOpen,
        onChapter: (positionId) => {
          if (!positionId) return;

          const index = stations().findIndex((stop) => stop.positionId === positionId);
          if (index >= 0) setStation(index);
        },
        onFailed: () => setFailed(true),
        onLoaded: () => {
          setReady(true);

          /*
           * Мир открывается на первой станции — у благодати под Древом. Дальше
           * посетитель идёт сам: путь по карьере проходят, а не смотрят, и
           * автоматический пролёт отнимал бы у него ровно это.
           */
          const first = stations()[0];
          if (!first) return;

          world.rig.fly([first.shot], { instant: true });
          // Осмотр с места сразу: посетитель стоит на станции и вертит головой.
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

  /*
   * Ссылка на живой мир для инструментов подбора. Функцией и через
   * `useCallback`: мир появляется после загрузки, а `worldRef.current` меняется
   * молча — эффекты оверлея должны спрашивать его сами, а не пересобираться.
   */
  const liveWorld = useCallback(() => worldRef.current, []);

  const switchMode = (next: ControlMode) => {
    setMode(next);
    worldRef.current?.setControlMode(next);
  };

  const skipFlight = () => {
    worldRef.current?.rig.cancel();
  };

  const stops = stations();

  /**
   * Первая станция главы или −1.
   *
   * По `positionId`, а не по совпадению ракурсов: прибытие первой главы лежит
   * в точках входа, и сравнение самих ракурсов там не сходится.
   */
  const stationOfChapter = (positionId: string) =>
    stops.findIndex((stop) => stop.positionId === positionId);

  /** Подпись станции: компания из резюме, а не служебный идентификатор. */
  const stationTitle = (index: number) => {
    const stop = stops[index];
    if (!stop) return '';

    const company = experience.find(
      (position) => position.id === stop.label.split(' ')[0],
    )?.company;

    return company ?? stop.label;
  };

  /** Переключает затенение. Выбор посетителя старше пробы качества. */
  const switchOcclusion = (enabled: boolean) => {
    const world = worldRef.current;
    if (!world) return;

    world.occlusion.set(enabled);
    setOcclusion(world.occlusion.enabled);
  };

  const toggleBook = () => {
    const world = worldRef.current;
    if (!world) return;

    world.book.toggle();
    setBookOpen(world.book.opened);
  };

  /** Раскрывает книгу сразу на подсказках. */
  const openGuide = () => {
    const world = worldRef.current;
    if (!world) return;

    world.book.guide();
    setBookOpen(world.book.opened);
  };

  /**
   * «На путь»: возвращает камеру к следующей главе.
   *
   * Отдельно от «Дальше»: та ведёт по станциям — их двадцать две, и половина
   * это виды зоны, — а эта возвращает на маршрут карьеры из любой точки, куда
   * посетитель забрёл сам. Куда именно, решает мир: прогресс считает он.
   */
  const followPath = () => {
    const world = worldRef.current;
    const target = world?.route.target();
    if (!world || !target) return;

    const index = stationOfChapter(target.positionId);
    if (index >= 0) setStation(index);

    setFlying(true);
    void world.rig
      .flyTo(target.shot, { freeLook: true })
      .finally(() => setFlying(false));
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
          // Проявляется, когда геометрия догрузилась: пустой чёрный канвас на
          // полсекунды заметнее, чем плавное появление.
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

      {/*
        Отказ загрузки. Причина обычно поправимая — сеть, — поэтому здесь не
        только сообщение, но и способ попробовать снова: перезагрузка страницы
        поднимает мир с нуля, а частично собранную сцену чинить нечем.
      */}
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

      {/*
        Дорожка глав уходит с кадра, пока книга раскрыта: разворот встаёт
        посреди экрана и накрывает её собой, а полупрозрачная плашка поверх
        страницы читается грязью на бумаге. Меню в правом верхнем углу
        остаётся — им книгу и закрывают.
      */}
      {chrome && ready && !resting && !bookOpen ? (
        <nav
          aria-label={t('world.steps.label')}
          className="border-book-rule bg-glass-book absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-sm border p-1 shadow-sm backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => goToStation(station - 1)}
            disabled={station <= 0}
            className="text-book-ink-muted hover:text-book-ink rounded-xs px-2.5 py-1.5 text-xs disabled:opacity-35"
          >
            {t('world.steps.back')}
          </button>

          <p className="text-2xs text-book-ink-muted min-w-36 px-1 text-center font-mono">
            {station + 1}/{stops.length} · {stationTitle(station)}
          </p>

          <button
            type="button"
            onClick={() => goToStation(station + 1)}
            disabled={station >= stops.length - 1}
            className="text-book-ink-muted hover:text-book-ink rounded-xs px-2.5 py-1.5 text-xs disabled:opacity-35"
          >
            {t('world.steps.next')}
          </button>

          <button
            type="button"
            onClick={followPath}
            className="border-book-rule text-book-ink-muted hover:text-book-ink ml-1 rounded-xs border-l px-2.5 py-1.5 text-xs"
          >
            {t('world.steps.toPath')}
          </button>

          {flying ? (
            <button
              type="button"
              onClick={skipFlight}
              className="border-book-rule text-book-ink-muted hover:text-book-ink ml-1 rounded-xs border-l px-2.5 py-1.5 text-xs"
            >
              {t('world.controls.skip')}
            </button>
          ) : null}
        </nav>
      ) : null}

      {chrome && ready && !resting && !hinted && !flying && !bookOpen ? (
        <p className="text-2xs text-book-paper pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
          {t('world.steps.hint')}
        </p>
      ) : null}

      {/*
        Камера, книга и выход собраны в одно меню: три отдельные плашки по
        углам кадра спорили и между собой, и с книгой, которая лежит в правом
        нижнем углу — ровно там, где стояла кнопка «Открыть резюме».
      */}
      {chrome && ready && !resting ? (
        <WorldMenu
          mode={mode}
          onMode={switchMode}
          bookOpen={bookOpen}
          onToggleBook={toggleBook}
          onGuide={openGuide}
          occlusion={occlusion}
          onOcclusion={switchOcclusion}
          homeHref={homeHref}
        />
      ) : null}

      {WorldDevOverlay && chrome ? (
        <WorldDevOverlay world={liveWorld} canvas={canvasRef} ready={ready} />
      ) : null}
    </div>
  );
}
