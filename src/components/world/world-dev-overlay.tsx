'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import type { FigureClip, WorldFigure } from '@/data/world-figures';
import type { BookProbe, BookProbePart } from '@/lib/world/book/debug';
import { createDevConsole, type WorldDevTools } from '@/lib/world/dev-console';
import { figureTools, shotTools } from '@/lib/world/dev-tools';
import type { World } from '@/lib/world/scene';

import { FigureTuner } from './figure-tuner';
import { WorldFps } from './world-fps';

/**
 * Инструменты подбора поверх кадра: расстановка фигур, снимки ракурсов, замеры
 * книги, счётчик кадров.
 *
 * Отдельный модуль ради сборки, а не ради порядка. `world-canvas` подключает
 * его через `next/dynamic` под статическим `DEV_TOOLS`, поэтому в прод-сборке
 * ни этот файл, ни `dev-console`, ни шесть модулей `dev-*` за ним в бандл
 * страницы не входят. Пока всё это лежало прямо в канвасе, панели и их код
 * уезжали к посетителю — невидимые, но полностью собранные.
 *
 * Отсюда правило: дев-состояние и дев-обработчики живут здесь целиком. Ни одна
 * их часть не возвращается в `world-canvas`, даже если так короче.
 */
type Props = {
  /**
   * Живой мир. Функцией, а не значением: ссылка появляется после загрузки и
   * меняется, когда мир пересоздают, — оверлей же монтируется раньше.
   */
  world: () => World | null;
  /**
   * Канвас мира. Постановку и перетаскивание фигур оверлей вешает на него сам:
   * иначе дев-обработчик пришлось бы держать в продуктовом компоненте.
   */
  canvas: RefObject<HTMLCanvasElement | null>;
  /** Мир загрузился. До этого показывать нечего, а спрашивать некого. */
  ready: boolean;
};

/** Подписи и цвета отладочного оверлея книги. */
const PROBE_PARTS: Record<BookProbePart['name'], { label: string; color: string }> = {
  sheet: { label: 'лист', color: '#ff4d4d' },
  right: { label: 'правая', color: '#4dff88' },
  left: { label: 'левая', color: '#4db8ff' },
  seam: { label: 'шов', color: '#ffd24d' },
};

export function WorldDevOverlay({ world, canvas, ready }: Props) {
  /** Инструменты подбора. Появляются, когда мир поднялся и их подключили. */
  const [tools, setTools] = useState<WorldDevTools | null>(null);
  /** Замеры книги для отладочного оверлея. */
  const [probe, setProbe] = useState<BookProbe | null>(null);
  /** Сколько ракурсов снято. */
  const [shots, setShots] = useState(0);
  const [copied, setCopied] = useState(false);
  /** Расстановка фигур: весь мир, а не только черновик. */
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

  /*
   * Подключение инструментов к живому миру. Здесь же — дев-хендл в окне: без
   * него отладка сцены идёт вслепую.
   *
   * Инструменты кладутся на прототип мира, а не копируются в него: привычные
   * `__world.marks`, `__world.crowd`, `__world.step` остаются на своих местах,
   * а ленивые замеры не просыпаются от самой сборки хендла — дескрипторы
   * переносятся, не вызываясь.
   */
  useEffect(() => {
    const live = world();
    if (!ready || !live) return;

    const attached = live.attachDevTools(createDevConsole);
    /*
     * Правило `set-state-in-effect` здесь снято сознательно. Оно бережёт от
     * каскада перерисовок, а тут каскад ровно один и на весь сеанс: мир
     * поднимается однажды, инструменты подключаются однажды, и снять с них
     * первый снимок раньше этого момента нельзя — до загрузки списки пусты.
     * Внешняя система, с которой синхронизируется состояние, — сама сцена.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTools(attached);
    setShots(attached.shots.list().length);
    setFigures([...attached.figures.placed()]);

    const handle = Object.create(live) as object;
    Object.defineProperties(handle, Object.getOwnPropertyDescriptors(attached));
    (window as unknown as { __world?: unknown }).__world = handle;

    return () => {
      delete (window as unknown as { __world?: unknown }).__world;
    };
  }, [world, ready]);

  /*
   * Отладочный оверлей книги: проекции её частей на экран. Нужен, потому что
   * переворот идёт секунду с четвертью и глазами в нём не разобрать, чей край
   * где.
   */
  useEffect(() => {
    let frame = 0;
    let tick = 0;

    const poll = () => {
      // Каждый четвёртый кадр: замер нужен глазу, а не рендереру, и обновление
      // состояния шестьдесят раз в секунду само портило бы то, что меряем.
      if (tick++ % 4 === 0) setProbe(world()?.book.debug?.probe() ?? null);
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);

    return () => cancelAnimationFrame(frame);
  }, [world]);

  const takeShot = () => {
    if (!tools) return;

    const shot = tools.shots.save();
    setShots(tools.shots.list().length);
    setCopied(false);
    console.info(`снимок «${shot.name}»`, shot.at, '→', shot.look);
  };

  const copyShots = () => {
    if (!tools || shots === 0) return;

    const text = tools.shots.export();
    console.info(`\n${text}`);
    void navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  const dropShots = () => {
    if (!tools) return;

    tools.shots.clear();
    setShots(0);
    setCopied(false);
  };

  const readFigures = (live: WorldDevTools) => {
    // В списке панели — весь мир, а не только черновик: править можно любую.
    setFigures([...live.figures.placed()]);
    setFiguresCopied(false);
  };

  /**
   * Ведёт фигуру до отпускания.
   *
   * Движение и отпускание слушаются у окна, а не у канваса: размашистая
   * протяжка уходит за край кадра, и там события канвасу уже не достаются.
   * Тот же приём, что у кручения книги в `book/spin.ts`.
   */
  const dragFigure = (id: string, element: HTMLCanvasElement, live: WorldDevTools) => {
    draggingFigure.current = true;

    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const at = live.figures.groundAt(
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
      );
      if (!at) return;

      live.figures.tweak(id, { at });
      readFigures(live);
    };

    const stop = () => {
      draggingFigure.current = false;
      const current = world();
      if (current) current.controls.enabled = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      // Отменённый жест — тоже конец: без этого орбита осталась бы выключенной.
      window.removeEventListener('pointercancel', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  /*
   * Постановка и захват фигур висят на канвасе. Слушатель свой, а не проброшен
   * из `world-canvas`: продуктовый компонент о правке расстановки не знает.
   */
  useEffect(() => {
    const element = canvas.current;
    if (!element || !tools || !figureTools || !editing) return;

    const onPointerDown = (event: PointerEvent) => {
      const live = world();
      if (!live || event.button !== 0) return;

      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      if (placing) {
        const at = tools.figures.groundAt(x, y);
        if (!at) return;

        const figure = tools.figures.place({ at });
        setSelectedFigure(figure.id);
        readFigures(tools);
        return;
      }

      const hit = tools.figures.pickAt(x, y);
      if (!hit) return;

      /*
       * Фигуру из утверждённой расстановки сначала берём в черновик: сами
       * данные заморожены, а править надо ту, что уже стоит в мире.
       */
      tools.figures.adopt(hit);
      setSelectedFigure(hit);
      // Орбита слушает тот же канвас: без этого фигура едет вместе с камерой.
      live.controls.enabled = false;
      dragFigure(hit, element, tools);
    };

    element.addEventListener('pointerdown', onPointerDown);
    return () => element.removeEventListener('pointerdown', onPointerDown);
    // `dragFigure` и `readFigures` замкнуты на те же значения, что и эффект.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, tools, editing, placing, world]);

  const tweakFigure = (patch: {
    clip?: FigureClip;
    height?: number;
    turn?: number;
  }) => {
    if (!tools || !selectedFigure) return;

    tools.figures.tweak(selectedFigure, patch);
    readFigures(tools);
  };

  const removeFigure = () => {
    if (!tools || !selectedFigure) return;

    tools.figures.remove(selectedFigure);
    setSelectedFigure(null);
    readFigures(tools);
  };

  const copyFigures = () => {
    if (!tools || figures.length === 0) return;

    const text = tools.figures.export();
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
    if (!tools) return;

    setFiguresSaving('идёт');
    void fetch('/api/dev/figures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(tools.figures.placed()),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        setFiguresSaving('готово');
        tools.figures.clear();
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

    const live = world();
    if (!live || !tools || !next) return;

    live.rig.cancel();
    live.rig.setStationLook(false);
    live.setControlMode('orbit');
    setFigures([...tools.figures.placed()]);
    setPatrols(tools.figures.patrols().map(({ id, height }) => ({ id, height })));
    setBattles(tools.figures.battles().map(({ id }) => ({ id })));
  };

  /** Подводит камеру к выбранной фигуре. */
  const goToFigure = (id: string | null = selectedFigure) => {
    if (tools && id) tools.figures.goTo(id);
  };

  /**
   * Шаг по списку фигур с переездом камеры.
   *
   * Список идёт в том же порядке, что и расстановка в данных: башни, входы,
   * лагеря, постройки. Обход по кругу — чтобы после последней снова была первая.
   */
  const stepFigure = (delta: number) => {
    if (!tools || figures.length === 0) return;

    const at = figures.findIndex((figure) => figure.id === selectedFigure);
    const next = figures[(at + delta + figures.length) % figures.length]!;

    setSelectedFigure(next.id);
    tools.figures.adopt(next.id);
    tools.figures.goTo(next.id);
  };

  const dropFigures = () => {
    if (!tools) return;

    tools.figures.clear();
    setSelectedFigure(null);
    readFigures(tools);
  };

  /*
   * Горячие клавиши подбора. `[` и `]` заняты разбором книги, поэтому рост
   * сидит на запятой с точкой — соседних клавишах под теми же пальцами.
   */
  useEffect(() => {
    if (!tools || !figureTools || !editing || !selectedFigure) return;

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

      const figure = tools.figures.list().find((item) => item.id === selectedFigure);
      if (!figure) return;

      const turn = (delta: number) =>
        tools.figures.tweak(figure.id, { turn: figure.turn + delta });
      const size = (factor: number) =>
        tools.figures.tweak(figure.id, { height: figure.height * factor });

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
          tools.figures.remove(figure.id);
          setSelectedFigure(null);
          break;
        default:
          return;
      }

      setFigures([...tools.figures.placed()]);
      setFiguresCopied(false);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tools, editing, selectedFigure]);

  return (
    <>
      {probe && ready ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {probe.parts.map((part) => (
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
        </div>
      ) : null}

      {/* Счётчик кадров: в мире он часть отладки, а не кадра. */}
      {ready ? <WorldFps /> : null}

      {figureTools && ready && !editing ? (
        <button
          type="button"
          onClick={() => toggleEditing(true)}
          className="border-line-subtle bg-surface-1/85 text-2xs text-ink-muted hover:text-ink absolute right-3 bottom-3 rounded-sm border px-2 py-1 backdrop-blur-sm"
        >
          Редактировать расстановку
        </button>
      ) : null}

      {figureTools && ready && editing ? (
        <FigureTuner
          figures={figures}
          selected={selectedFigure}
          placing={placing}
          copied={figuresCopied}
          onPlacing={setPlacing}
          onSelect={(id) => {
            setSelectedFigure(id);
            if (!tools || !id) return;
            // Выбор из списка правит ту же фигуру, что и щелчок в кадре.
            tools.figures.adopt(id);
            tools.figures.goTo(id);
          }}
          onTweak={tweakFigure}
          onRemove={removeFigure}
          onGoTo={() => goToFigure()}
          patrols={patrols}
          onGoToPatrol={(id) => tools?.figures.goToPatrol(id)}
          battles={battles}
          onGoToBattle={(id) => tools?.figures.goToBattle(id)}
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
      {shotTools && ready ? (
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
    </>
  );
}
