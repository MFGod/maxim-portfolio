import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AMBIENCE_FADE,
  AMBIENCE_STORAGE_KEY,
  AMBIENCE_VOLUME_STORAGE_KEY,
  DEFAULT_AMBIENCE_CHOICE,
  DEFAULT_AMBIENCE_VOLUME,
  SILENCE,
} from '@/lib/world/ambience';

/**
 * Проигрыватель ведёт `HTMLAudioElement` — внешнюю систему, которой в среде
 * тестов нет. Подменяется только она: переходы громкости, порядок вызовов и
 * ответ на отказ автозапуска считает сам стор, и подменять их значило бы
 * проверять заглушку.
 */
class FakeAudio {
  static last: FakeAudio | null = null;
  /**
   * Чем ответит браузер на `play()`. Полем класса, а не подменой прототипа:
   * `play` объявлен полем экземпляра и прототип перекрывает, из-за чего
   * подмена там тихо не действовала бы, а тест — проходил бы впустую.
   */
  static answer: () => Promise<void> = () => Promise.resolve();

  loop = false;
  preload = '';
  src = '';
  volume = 1;
  paused = true;
  play = vi.fn(() => {
    this.paused = false;
    return FakeAudio.answer();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });

  constructor() {
    FakeAudio.last = this;
  }
}

/** Хранилище страницы. В среде тестов `window` нет — подменяется целиком. */
let stored: Map<string, string>;

function stubStorage(values: Record<string, string>): void {
  stored = new Map(Object.entries(values));

  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
  });
}

/** Свежий модуль на каждый тест: состояние стора живёт в модульных переменных. */
async function freshStore(
  values: Record<string, string> = { [AMBIENCE_STORAGE_KEY]: SILENCE },
) {
  vi.resetModules();
  FakeAudio.last = null;
  FakeAudio.answer = () => Promise.resolve();
  vi.stubGlobal('Audio', FakeAudio);
  stubStorage(values);

  const { ambienceStore } = await import('@/lib/world/ambience-store');
  return ambienceStore;
}

/** Прокручивает затухание целиком. */
async function runFade() {
  await vi.advanceTimersByTimeAsync(AMBIENCE_FADE * 1000 * 6 + 200);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('вход в мир', () => {
  it('сохранённая тишина молчит и не создаёт элемент', async () => {
    const store = await freshStore();

    store.enter();

    expect(store.getSnapshot().choice).toBe(SILENCE);
    expect(FakeAudio.last).toBeNull();
  });

  it('пустое хранилище поднимает запись по умолчанию', async () => {
    const store = await freshStore({});

    store.enter();
    await runFade();

    expect(store.getSnapshot().choice).toBe(DEFAULT_AMBIENCE_CHOICE);
    expect(store.getSnapshot().volume).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(FakeAudio.last!.src).toContain('lost-frontier.mp3');
    expect(FakeAudio.last!.volume).toBeCloseTo(DEFAULT_AMBIENCE_VOLUME, 2);
  });

  it('поднимает сохранённую громкость, а не значение по умолчанию', async () => {
    const store = await freshStore({ [AMBIENCE_VOLUME_STORAGE_KEY]: '0.75' });

    store.enter();
    await runFade();

    expect(FakeAudio.last!.volume).toBeCloseTo(0.75, 2);
  });
});

describe('выбор записи', () => {
  it('поднимает элемент и выводит громкость до рабочей', async () => {
    const store = await freshStore();
    store.enter();

    store.set('lost-frontier');
    await vi.advanceTimersByTimeAsync(0);

    const audio = FakeAudio.last!;
    expect(audio.loop).toBe(true);
    expect(audio.src).toContain('lost-frontier.mp3');
    expect(audio.play).toHaveBeenCalledTimes(1);

    expect(audio.volume).toBeLessThan(DEFAULT_AMBIENCE_VOLUME);

    await runFade();
    expect(audio.volume).toBeCloseTo(DEFAULT_AMBIENCE_VOLUME, 2);
  });

  it('повторный выбор той же записи не перезапускает её', async () => {
    const store = await freshStore();
    store.enter();

    store.set('heavy-heart');
    await runFade();
    store.set('heavy-heart');
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeAudio.last!.play).toHaveBeenCalledTimes(1);
  });

  it('смена записи переставляет источник, а не заводит второй элемент', async () => {
    const store = await freshStore();
    store.enter();

    store.set('heavy-heart');
    await runFade();
    const first = FakeAudio.last;

    store.set('lost-frontier');
    await runFade();

    expect(FakeAudio.last).toBe(first);
    expect(FakeAudio.last!.src).toContain('lost-frontier.mp3');
  });
});

describe('тишина', () => {
  it('ставит на паузу только после затухания, а не сразу', async () => {
    const store = await freshStore();
    store.enter();
    store.set('lost-frontier');
    await runFade();

    const audio = FakeAudio.last!;
    store.set(SILENCE);

    await vi.advanceTimersByTimeAsync((AMBIENCE_FADE * 1000) / 2);
    expect(audio.pause).not.toHaveBeenCalled();

    await runFade();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(0);
  });
});

describe('уход из мира', () => {
  it('обрывает звук сразу и отпускает элемент', async () => {
    const store = await freshStore();
    store.enter();
    store.set('lost-frontier');
    await runFade();

    const audio = FakeAudio.last!;
    store.leave();

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.src).toBe('');

    store.enter();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.last).not.toBe(audio);
    expect(store.getSnapshot().choice).toBe('lost-frontier');
  });
});

describe('отказ автозапуска', () => {
  it('не роняет стор и оставляет выбор за посетителем', async () => {
    const store = await freshStore();
    store.enter();

    FakeAudio.answer = () => Promise.reject(new Error('blocked'));
    store.set('heavy-heart');
    await runFade();

    const audio = FakeAudio.last!;
    expect(store.getSnapshot().choice).toBe('heavy-heart');
    expect(audio.volume).toBe(0);
    expect(audio.pause).not.toHaveBeenCalled();
  });
});

describe('подписка', () => {
  it('сообщает о смене выбора и отписывается', async () => {
    const store = await freshStore();
    const seen = vi.fn();

    const unsubscribe = store.subscribe(seen);
    store.set('heavy-heart');
    expect(seen).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.set(SILENCE);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('громкость', () => {
  it('меняет уровень играющей записи сразу, без прокрутки таймеров', async () => {
    const store = await freshStore();
    store.enter();
    store.set('lost-frontier');
    await runFade();

    const audio = FakeAudio.last!;
    store.setVolume(0.35);

    expect(audio.volume).toBe(0.35);
    expect(store.getSnapshot().volume).toBe(0.35);
    expect(stored.get(AMBIENCE_VOLUME_STORAGE_KEY)).toBe('0.35');
  });

  it('до включения звука не создаёт элемент и не роняет стор', async () => {
    const store = await freshStore();
    store.enter();

    store.setVolume(0.8);

    expect(FakeAudio.last).toBeNull();
    expect(store.getSnapshot().volume).toBe(0.8);
  });

  it('запись, поднятая после смены, выходит на новое значение', async () => {
    const store = await freshStore();
    store.enter();

    store.setVolume(0.25);
    store.set('heavy-heart');
    await runFade();

    expect(FakeAudio.last!.volume).toBeCloseTo(0.25, 2);
  });

  it('значение за отрезком обрезается, а не бросает на элементе', async () => {
    const store = await freshStore();
    store.enter();
    store.set('lost-frontier');
    await runFade();

    store.setVolume(4);
    expect(FakeAudio.last!.volume).toBe(1);

    store.setVolume(-1);
    expect(FakeAudio.last!.volume).toBe(0);
  });
});

describe('снимок', () => {
  it('стабилен по ссылке, пока ничего не менялось', async () => {
    const store = await freshStore();
    store.enter();

    expect(store.getSnapshot()).toBe(store.getSnapshot());

    store.set('lost-frontier');
    const afterChoice = store.getSnapshot();
    expect(store.getSnapshot()).toBe(afterChoice);

    store.setVolume(0.3);
    expect(store.getSnapshot()).not.toBe(afterChoice);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('повторная установка того же значения снимок не пересобирает', async () => {
    const store = await freshStore();
    store.enter();

    const before = store.getSnapshot();
    store.setVolume(before.volume);
    store.set(before.choice);

    expect(store.getSnapshot()).toBe(before);
  });
});
