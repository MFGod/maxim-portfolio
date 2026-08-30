/**
 * Проигрыватель фона мира. Живёт вне React, по образцу `settingsStore`:
 * интерфейс только выбирает запись, а звук ведёт этот модуль.
 */

import {
  AMBIENCE_FADE,
  ambienceTrack,
  ambienceUrl,
  DEFAULT_AMBIENCE_VOLUME,
  readAmbienceChoice,
  readAmbienceVolume,
  SILENCE,
  writeAmbienceChoice,
  writeAmbienceVolume,
  type AmbienceChoice,
} from './ambience';

/** Шаг перехода громкости, миллисекунды. */
const STEP_MS = 50;

let choice: AmbienceChoice = SILENCE;
/** Рабочая громкость: цель всех затуханий и значение ползунка в меню. */
let volume = DEFAULT_AMBIENCE_VOLUME;
/** Прочитано ли хранилище. Читается один раз за сеанс, дальше — память. */
let restored = false;
let audio: HTMLAudioElement | null = null;
let fade: ReturnType<typeof setInterval> | null = null;
/** Запуск отклонён автозапуском и ждёт действия посетителя. */
let pending = false;

/** Что видит интерфейс: выбранная запись и громкость. */
export type AmbienceSnapshot = {
  choice: AmbienceChoice;
  volume: number;
};

/**
 * Снимок пересобирается только при изменении, а между вызовами отдаётся тот
 * же объект.
 */
let snapshot: AmbienceSnapshot = { choice, volume };

/** Снимок сервера — тоже один объект на модуль, по той же причине. */
const SERVER_SNAPSHOT: AmbienceSnapshot = {
  choice: SILENCE,
  volume: DEFAULT_AMBIENCE_VOLUME,
};

function publish(): void {
  snapshot = { choice, volume };
  notify();
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function stopFade(): void {
  if (fade === null) return;
  clearInterval(fade);
  fade = null;
}

/** Ведёт громкость к цели и вызывает `done`, когда дошла. */
function fadeTo(target: number, done?: () => void): void {
  const element = audio;
  if (!element) return;

  stopFade();
  const step = (STEP_MS / 1000 / AMBIENCE_FADE) * DEFAULT_AMBIENCE_VOLUME;

  fade = setInterval(() => {
    const current = element.volume;
    const next =
      current < target
        ? Math.min(target, current + step)
        : Math.max(target, current - step);

    element.volume = Math.min(1, Math.max(0, next));

    if (Math.abs(element.volume - target) < 1e-3) {
      element.volume = target;
      stopFade();
      done?.();
    }
  }, STEP_MS);
}

/** Слушатели первого действия посетителя — снимаются, как только сработали. */
function waitForGesture(): void {
  if (typeof document === 'undefined') return;

  const resume = () => {
    document.removeEventListener('pointerdown', resume);
    document.removeEventListener('keydown', resume);
    if (pending) start();
  };

  document.addEventListener('pointerdown', resume, { passive: true, once: true });
  document.addEventListener('keydown', resume, { passive: true, once: true });
}

/** Поднимает выбранную запись. Отказ автозапуска переводит в ожидание жеста. */
function start(): void {
  const track = ambienceTrack(choice);
  if (!track) return;

  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'none';
  }

  const url = ambienceUrl(track);
  if (!audio.src.endsWith(url)) audio.src = url;

  audio.volume = 0;
  const started = audio.play();

  if (started === undefined) {
    pending = false;
    fadeTo(volume);
    return;
  }

  started
    .then(() => {
      pending = false;
      fadeTo(volume);
    })
    .catch(() => {
      pending = true;
      waitForGesture();
    });
}

/** Уводит звук и останавливает элемент, когда затухание дошло до нуля. */
function stop(): void {
  pending = false;
  const element = audio;
  if (!element) return;

  fadeTo(0, () => element.pause());
}

function apply(): void {
  if (ambienceTrack(choice)) start();
  else stop();
}

export const ambienceStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot: () => snapshot,

  /** На сервере хранилища нет — первый рендер всегда молчит. */
  getServerSnapshot: (): AmbienceSnapshot => SERVER_SNAPSHOT,

  /** Поднимает сохранённый выбор и включает звук. */
  enter() {
    if (!restored) {
      restored = true;
      choice = readAmbienceChoice();
      volume = readAmbienceVolume();
      publish();
    }

    apply();
  },

  /** Уход из мира: звук замолкает сразу, без затухания. */
  leave() {
    stopFade();
    pending = false;
    if (!audio) return;

    audio.pause();
    audio.src = '';
    audio = null;
  },

  /** Выбор посетителя. Переживает перезагрузку. */
  set(next: AmbienceChoice) {
    if (choice === next) return;

    choice = next;
    writeAmbienceChoice(next);
    publish();
    apply();
  },

  /** Громкость. Переживает перезагрузку, как и выбор записи. */
  setVolume(next: number) {
    const value = Math.min(1, Math.max(0, next));
    if (!Number.isFinite(value) || value === volume) return;

    volume = value;
    writeAmbienceVolume(value);
    publish();

    if (!audio || pending || !ambienceTrack(choice)) return;

    stopFade();
    audio.volume = value;
  },
};
