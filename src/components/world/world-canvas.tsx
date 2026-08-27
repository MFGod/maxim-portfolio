'use client';

import { useEffect, useRef, useState } from 'react';

import { experience } from '@/data/resume';
import type { FigureClip, WorldFigure } from '@/data/world-figures';
import { useTranslate } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { useSetting } from '@/lib/settings/hooks';
import { figureToolsEnabled, shotToolsEnabled } from '@/lib/world/dev-tools';
import { stations } from '@/lib/world/shots';
import type { BookProbe, BookProbePart } from '@/lib/world/book/debug';
import type { TabPose } from '@/lib/world/book/tab';
import type { ControlMode, World } from '@/lib/world/scene';

import { FigureTuner } from './figure-tuner';
import { TabTuner } from './tab-tuner';
import { WorldFps } from './world-fps';
import { WorldSkills } from './world-skills';
import { WorldMenu } from './world-menu';

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

/** Подписи и цвета отладочного оверлея книги. */
const PROBE_PARTS: Record<BookProbePart['name'], { label: string; color: string }> = {
  sheet: { label: 'лист', color: '#ff4d4d' },
  right: { label: 'правая', color: '#4dff88' },
  left: { label: 'левая', color: '#4db8ff' },
  seam: { label: 'шов', color: '#ffd24d' },
  tab: { label: 'закладка', color: '#ff9f4d' },
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
  const [mode, setMode] = useState<ControlMode>('orbit');
  /** Идёт ли кинематографический вход: пока идёт, показываем «пропустить». */
  const [flying, setFlying] = useState(false);
  /** На какой станции стоим. Первая — благодать под Древом, начало пути. */
  const [station, setStation] = useState(0);
  /** Пройденная глава по счёту мира: её же копит панель навыков. */
  const [passed, setPassed] = useState<string | null>(null);
  /** Подсказка про осмотр: гаснет, как только мышь тронула сцену. */
  const [hinted, setHinted] = useState(false);
  /** Раскрыта ли книга-резюме. Само состояние живёт в сцене, здесь — отражение. */
  const [bookOpen, setBookOpen] = useState(false);
  /** Замеры книги для отладочного оверлея. Только в разработке. */
  const [probe, setProbe] = useState<BookProbe | null>(null);
  /** Сколько ракурсов снято. Только для панели подбора, в прод не попадает. */
  const [shots, setShots] = useState(0);
  /** Подобранное положение закладки. Только в разработке. */
  const [tabPose, setTabPose] = useState<TabPose | null>(null);
  const [copied, setCopied] = useState(false);
  /** Расстановка фигур. Только в разработке, за флагом `FIGURE_TOOLS`. */
  const [figures, setFigures] = useState<WorldFigure[]>([]);
  const [selectedFigure, setSelectedFigure] = useState<string | null>(null);
  /** Режим постановки: щелчок по земле ставит новую фигуру. */
  const [placing, setPlacing] = useState(false);
  /**
   * Режим правки расстановки. Выключен по умолчанию: пока он не включён, мир
   * смотрят, а не редактируют — щелчок по фигуре её не хватает, а клавиши
   * поворота остаются за книгой и камерой.
   */
  const [editing, setEditing] = useState(false);
  const [figuresCopied, setFiguresCopied] = useState(false);
  /** Идущие группы для панели: список берётся у сцены при входе в правку. */
  const [patrols, setPatrols] = useState<{ id: string; height: number }[]>([]);
  /** Стычки для панели. Берутся там же и тогда же, что и дозоры. */
  const [battles, setBattles] = useState<{ id: string }[]>([]);
  /** Что с сохранением расстановки в файл данных. */
  const [figuresSaving, setFiguresSaving] = useState<
    'ждём' | 'идёт' | 'готово' | 'ошибка'
  >('ждём');
  /** Тянем ли фигуру прямо сейчас. Не состояние: меняется внутри одного жеста. */
  const draggingFigure = useRef(false);

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
        /*
         * Счётчик станций идёт за миром. До главы доходят и пешком, минуя
         * «Назад» и «Дальше», — без этого полоса показывала бы вход, пока
         * посетитель стоит у Flexy.
         */
        onChapter: (positionId) => {
          if (!positionId) return;

          setPassed(positionId);

          const index = stations().findIndex((stop) => stop.positionId === positionId);
          if (index >= 0) setStation(index);
        },
        onLoaded: () => {
          setReady(true);
          setShots(world.shots.list().length);
          // Весь мир, а не черновик: править и обходить надо все сто с лишним.
          setFigures([...world.figures.placed()]);

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

      // Дев-хендл: без него отладка сцены идёт вслепую.
      if (process.env.NODE_ENV === 'development') {
        (window as unknown as { __world?: unknown }).__world = world;
      }
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

  /*
   * Отладочный оверлей: проекции частей книги на экран. Нужен, потому что
   * переворот идёт секунду с четвертью и глазами в нём не разобрать, чей край
   * где. В сборку не попадает — условие статическое.
   */
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    let frame = 0;
    let tick = 0;

    const poll = () => {
      // Каждый четвёртый кадр: замер нужен глазу, а не рендереру, и обновление
      // состояния шестьдесят раз в секунду само портило бы то, что меряем.
      if (tick++ % 4 === 0) setProbe(worldRef.current?.book.debug?.probe() ?? null);
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);

    return () => cancelAnimationFrame(frame);
  }, []);

  const toggleBook = () => {
    const world = worldRef.current;
    if (!world) return;

    world.book.toggle();
    setBookOpen(world.book.opened);
  };

  /** Раскрывает книгу сразу на подсказках — то же, что и её закладка. */
  const openGuide = () => {
    const world = worldRef.current;
    if (!world) return;

    world.book.guide();
    setBookOpen(world.book.opened);
  };

  /** Шаг подбора закладки. Значение показывается панелью рядом с ней. */
  const nudgeTab = (delta: Partial<TabPose>) => {
    const tuning = worldRef.current?.book.debug?.tab;
    if (!tuning) return;

    setTabPose(tuning.nudge(delta));
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

  /**
   * Панель подбора ракурсов. Выключена флагом `SHOT_TOOLS` — точки уже перенесены
   * в `world-shots.ts`, а инструмент остаётся рабочим на случай новых.
   */
  const tuning = shotToolsEnabled();

  const takeShot = () => {
    const world = worldRef.current;
    if (!world) return;

    const shot = world.shots.save();
    setShots(world.shots.list().length);
    setCopied(false);
    console.info(`снимок «${shot.name}»`, shot.at, '→', shot.look);
  };

  const copyShots = () => {
    const world = worldRef.current;
    if (!world || shots === 0) return;

    const text = world.shots.export();
    console.info(`\n${text}`);
    void navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  const dropShots = () => {
    const world = worldRef.current;
    if (!world) return;

    world.shots.clear();
    setShots(0);
    setCopied(false);
  };

  /**
   * Инструмент расстановки фигур. Включается флагом `FIGURE_TOOLS`: пока
   * `world-figures.ts` пуст, он и есть единственный способ населить мир.
   */
  const figureTuning = figureToolsEnabled();

  /** Доля канваса под курсором: сцена сама переведёт её в луч. */
  const canvasFraction = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const readFigures = (world: World) => {
    // В списке панели — весь мир, а не только черновик: править можно любую.
    setFigures([...world.figures.placed()]);
    setFiguresCopied(false);
  };

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const world = worldRef.current;
    if (!world || !figureTuning || !editing || event.button !== 0) return;

    const { x, y } = canvasFraction(event);

    if (placing) {
      const at = world.figures.groundAt(x, y);
      if (!at) return;

      const figure = world.figures.place({ at });
      setSelectedFigure(figure.id);
      readFigures(world);
      return;
    }

    const hit = world.figures.pickAt(x, y);
    if (!hit) return;

    /*
     * Фигуру из утверждённой расстановки сначала берём в черновик: сами данные
     * заморожены, а править надо ту, что уже стоит в мире.
     */
    world.figures.adopt(hit);
    setSelectedFigure(hit);
    // Орбита слушает тот же канвас: без этого фигура едет вместе с камерой.
    world.controls.enabled = false;
    dragFigure(hit, event.currentTarget);
  };

  /**
   * Ведёт фигуру до отпускания.
   *
   * Движение и отпускание слушаются у окна, а не у канваса: размашистая
   * протяжка уходит за край кадра, и там события канвасу уже не достаются.
   * Тот же приём, что у кручения книги в `book/spin.ts`.
   */
  const dragFigure = (id: string, canvas: HTMLCanvasElement) => {
    draggingFigure.current = true;

    const move = (event: PointerEvent) => {
      const world = worldRef.current;
      if (!world) return;

      const rect = canvas.getBoundingClientRect();
      const at = world.figures.groundAt(
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      );
      if (!at) return;

      world.figures.tweak(id, { at });
      readFigures(world);
    };

    const stop = () => {
      draggingFigure.current = false;
      if (worldRef.current) worldRef.current.controls.enabled = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      // Отменённый жест — тоже конец: без этого орбита осталась бы выключенной.
      window.removeEventListener('pointercancel', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  const tweakFigure = (patch: {
    clip?: FigureClip;
    height?: number;
    turn?: number;
  }) => {
    const world = worldRef.current;
    if (!world || !selectedFigure) return;

    world.figures.tweak(selectedFigure, patch);
    readFigures(world);
  };

  const removeFigure = () => {
    const world = worldRef.current;
    if (!world || !selectedFigure) return;

    world.figures.remove(selectedFigure);
    setSelectedFigure(null);
    readFigures(world);
  };

  const copyFigures = () => {
    const world = worldRef.current;
    if (!world || figures.length === 0) return;

    const text = world.figures.export();
    console.info(`\n${text}`);
    void navigator.clipboard.writeText(text).then(
      () => setFiguresCopied(true),
      () => setFiguresCopied(false),
    );
  };

  /**
   * Пишет расстановку в `src/data/world-figures.ts` через дев-ручку.
   *
   * После записи страница перезагружается: мир должен подняться из файла, а не
   * из черновика — иначе непонятно, что сохранилось, а что просто лежит в
   * `localStorage`. Черновик перед этим забывается, он уже не нужен.
   */
  const saveFigures = () => {
    const world = worldRef.current;
    if (!world) return;

    setFiguresSaving('идёт');
    void fetch('/api/dev/figures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(world.figures.placed()),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        setFiguresSaving('готово');
        world.figures.clear();
        // Даём кнопке показать «Сохранено», прежде чем страница уедет.
        setTimeout(() => window.location.reload(), 400);
      })
      .catch((error: unknown) => {
        console.error('расстановка не сохранилась', error);
        setFiguresSaving('ошибка');
      });
  };

  /**
   * Включает и выключает правку.
   *
   * На входе камера забирается у рига: он держит взгляд на станции, а править
   * расстановку, глядя в одну точку, нельзя. На выходе камеру не трогаем —
   * человек сам решит, куда лететь дальше.
   */
  const toggleEditing = (next: boolean) => {
    setEditing(next);
    setPlacing(false);
    setSelectedFigure(null);

    const world = worldRef.current;
    if (!world || !next) return;

    world.rig.cancel();
    world.rig.setStationLook(false);
    world.setControlMode('orbit');
    setFigures([...world.figures.placed()]);
    setPatrols(world.figures.patrols().map(({ id, height }) => ({ id, height })));
    setBattles(world.figures.battles().map(({ id }) => ({ id })));
  };

  /** Подводит камеру к выбранной фигуре. */
  const goToFigure = (id: string | null = selectedFigure) => {
    const world = worldRef.current;
    if (world && id) world.figures.goTo(id);
  };

  /**
   * Шаг по списку фигур с переездом камеры.
   *
   * Список идёт в том же порядке, что и расстановка в данных: башни, входы,
   * лагеря, постройки. Обход по кругу — чтобы после последней снова была первая.
   */
  const stepFigure = (delta: number) => {
    const world = worldRef.current;
    if (!world || figures.length === 0) return;

    const at = figures.findIndex((figure) => figure.id === selectedFigure);
    const next = figures[(at + delta + figures.length) % figures.length]!;

    setSelectedFigure(next.id);
    world.figures.adopt(next.id);
    world.figures.goTo(next.id);
  };

  const dropFigures = () => {
    const world = worldRef.current;
    if (!world) return;

    world.figures.clear();
    setSelectedFigure(null);
    readFigures(world);
  };

  /*
   * Горячие клавиши подбора. `[` и `]` заняты разбором книги, поэтому рост
   * сидит на запятой с точкой — соседних клавишах под теми же пальцами.
   */
  useEffect(() => {
    if (!figureTuning || !editing || !selectedFigure) return;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      const world = worldRef.current;
      const figure = world?.figures.list().find((item) => item.id === selectedFigure);
      if (!world || !figure) return;

      const turn = (delta: number) =>
        world.figures.tweak(figure.id, { turn: figure.turn + delta });
      const size = (factor: number) =>
        world.figures.tweak(figure.id, { height: figure.height * factor });

      switch (event.key.toLowerCase()) {
        case 'q':
          turn(-Math.PI / 16);
          break;
        case 'e':
          turn(Math.PI / 16);
          break;
        case ',':
          size(1 / 1.25);
          break;
        case '.':
          size(1.25);
          break;
        case 'delete':
        case 'backspace':
          world.figures.remove(figure.id);
          setSelectedFigure(null);
          break;
        default:
          return;
      }

      setFigures([...world.figures.placed()]);
      setFiguresCopied(false);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [figureTuning, editing, selectedFigure]);

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
        onPointerDown={(event) => {
          setHinted(true);
          onCanvasPointerDown(event);
        }}
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

      {chrome && !ready ? (
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

      {chrome && ready ? <WorldSkills passed={passed} /> : null}

      {chrome && ready ? (
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

      {chrome && ready && !hinted && !flying ? (
        <p className="text-2xs text-book-paper pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
          {t('world.steps.hint')}
        </p>
      ) : null}

      {probe && chrome && ready ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/*
            Закладка в замерах есть, а рамки у неё нет: её проекция нужна
            панели подбора, чтобы висеть рядом, — но сама закладка мелкая, и
            рамка с подписью закрывала бы ровно то, что подбирают.
          */}
          {probe.parts
            .filter((part) => part.name !== 'tab')
            .map((part) => (
              <div
                key={part.name}
                className="absolute border"
                style={{
                  left: `${part.left * 100}%`,
                  top: `${part.top * 100}%`,
                  width: `${(part.right - part.left) * 100}%`,
                  height: `${(part.bottom - part.top) * 100}%`,
                  borderColor: PROBE_PARTS[part.name].color,
                }}
              >
                <span
                  className="text-2xs absolute top-0 left-0 px-1 font-mono"
                  style={{ color: PROBE_PARTS[part.name].color }}
                >
                  {PROBE_PARTS[part.name].label} {(part.left * 100).toFixed(1)}–
                  {(part.right * 100).toFixed(1)}
                </span>
              </div>
            ))}

          <p className="text-2xs absolute top-11 left-3 rounded-sm bg-black/70 px-2 py-1 font-mono text-white">
            доля {probe.progress === null ? '—' : probe.progress.toFixed(2)} · [ ] шаг ·
            \\ отпустить
          </p>

          {/*
            Подбор закладки — рядом с ней самой, а не в углу кадра: смотреть на
            язычок и тянуться глазами в другой конец экрана значит подбирать
            вслепую. Панель висит на проекции закладки и едет вместе с книгой.
          */}
          <TabTuner
            probe={probe}
            pose={tabPose}
            onNudge={nudgeTab}
            onRead={() => setTabPose(worldRef.current?.book.debug?.tab.pose() ?? null)}
          />
        </div>
      ) : null}

      {/*
        Камера, книга и выход собраны в одно меню: три отдельные плашки по
        углам кадра спорили и между собой, и с книгой, которая теперь лежит в
        левом нижнем углу — ровно там, где стояла кнопка «Открыть резюме».
      */}
      {/* Счётчик кадров — только в разработке: в мире он часть отладки, а не кадра. */}
      {process.env.NODE_ENV === 'development' && chrome && ready ? <WorldFps /> : null}

      {chrome && ready ? (
        <WorldMenu
          mode={mode}
          onMode={switchMode}
          bookOpen={bookOpen}
          onToggleBook={toggleBook}
          onGuide={openGuide}
          homeHref={homeHref}
        />
      ) : null}

      {figureTuning && chrome && ready && !editing ? (
        <button
          type="button"
          onClick={() => toggleEditing(true)}
          className="border-line-subtle bg-surface-1/85 text-2xs text-ink-muted hover:text-ink absolute right-3 bottom-3 rounded-sm border px-2 py-1 backdrop-blur-sm"
        >
          Редактировать расстановку
        </button>
      ) : null}

      {figureTuning && chrome && ready && editing ? (
        <FigureTuner
          figures={figures}
          selected={selectedFigure}
          placing={placing}
          copied={figuresCopied}
          onPlacing={setPlacing}
          onSelect={(id) => {
            setSelectedFigure(id);
            const world = worldRef.current;
            if (!world || !id) return;
            // Выбор из списка правит ту же фигуру, что и щелчок в кадре.
            world.figures.adopt(id);
            world.figures.goTo(id);
          }}
          onTweak={tweakFigure}
          onRemove={removeFigure}
          onGoTo={() => goToFigure()}
          patrols={patrols}
          onGoToPatrol={(id) => worldRef.current?.figures.goToPatrol(id)}
          battles={battles}
          onGoToBattle={(id) => worldRef.current?.figures.goToBattle(id)}
          onStep={stepFigure}
          onCopy={copyFigures}
          onSave={saveFigures}
          saving={figuresSaving}
          onExit={() => toggleEditing(false)}
          onClear={dropFigures}
        />
      ) : null}

      {/*
        Панель подбора ракурсов. Текст без словаря намеренно: она не часть
        продукта и уедет вместе с `dev-shots.ts`, когда точки лягут в данные.
      */}
      {tuning && chrome && ready ? (
        <div className="border-line-subtle bg-surface-1/85 absolute right-3 bottom-3 flex items-center gap-1 rounded-sm border p-1 backdrop-blur-sm">
          <button
            type="button"
            onClick={takeShot}
            className="bg-accent-wash text-accent text-2xs rounded-xs px-2 py-1"
          >
            Запомнить ракурс
          </button>
          <button
            type="button"
            onClick={copyShots}
            disabled={shots === 0}
            className="text-ink-muted hover:text-ink text-2xs rounded-xs px-2 py-1 disabled:opacity-40"
          >
            {copied ? 'Скопировано' : `Скопировать (${shots})`}
          </button>
          <button
            type="button"
            onClick={dropShots}
            disabled={shots === 0}
            className="text-ink-faint hover:text-ink text-2xs rounded-xs px-2 py-1 disabled:opacity-40"
          >
            Очистить
          </button>
        </div>
      ) : null}
    </div>
  );
}
