/** Фоновая музыка мира: опись записей и выбор посетителя. */

import { readStorage, writeStorage } from '@/lib/storage';

import { WORLD_ASSETS } from './assets';

/** Тишина — тоже положение переключателя, а не отсутствие выбора. */
export const SILENCE = 'silence';

export type AmbienceTrack = {
  /** Идентификатор в хранилище и в разметке меню. */
  id: string;
  /** Настоящее название записи. Часть обязательной подписи. */
  title: string;
  /** Имя автора. Часть обязательной подписи. */
  author: string;
  /** Короткое имя лицензии для подписи под списком. */
  license: string;
  /** Адрес лицензии: CC BY требует ссылку, а не только название. */
  licenseUrl: string;
  /** Откуда запись взята — чтобы происхождение можно было проверить. */
  source: string;
  /** Имя файла в `ambience/` рядом с остальными ассетами мира. */
  file: string;
};

/** Опись записей. */
export const AMBIENCE_TRACKS: readonly AmbienceTrack[] = [
  {
    id: 'lost-frontier',
    title: 'Lost Frontier',
    author: 'Kevin MacLeod (incompetech.com)',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://incompetech.com/music/royalty-free/',
    file: 'lost-frontier.mp3',
  },
  {
    id: 'heavy-heart',
    title: 'Heavy Heart',
    author: 'Kevin MacLeod (incompetech.com)',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    source: 'https://incompetech.com/music/royalty-free/',
    file: 'heavy-heart.mp3',
  },
] as const;

/** Что играет: запись из описи или тишина. */
export type AmbienceChoice = string;

/** Адрес файла записи. */
export function ambienceUrl(track: AmbienceTrack): string {
  return `${WORLD_ASSETS}/ambience/${track.file}`;
}

/** Запись по идентификатору. `null` — тишина или неизвестное имя. */
export function ambienceTrack(choice: AmbienceChoice): AmbienceTrack | null {
  return AMBIENCE_TRACKS.find((track) => track.id === choice) ?? null;
}

/** Громкость фона по умолчанию. */
export const DEFAULT_AMBIENCE_VOLUME = 0.2;

/** Сколько длится переход между записями и до тишины, секунды. */
export const AMBIENCE_FADE = 1.2;

export const AMBIENCE_STORAGE_KEY = 'world:ambience';
export const AMBIENCE_VOLUME_STORAGE_KEY = 'world:ambience-volume';

/** Что играет, пока посетитель не выбрал сам. */
export const DEFAULT_AMBIENCE_CHOICE: AmbienceChoice = 'lost-frontier';

/** Разбор сохранённого выбора. */
export function parseAmbienceChoice(raw: string | null): AmbienceChoice {
  if (raw === null || raw === '') return DEFAULT_AMBIENCE_CHOICE;

  return ambienceTrack(raw) ? raw : SILENCE;
}

export function readAmbienceChoice(): AmbienceChoice {
  return parseAmbienceChoice(readStorage(AMBIENCE_STORAGE_KEY));
}

export function writeAmbienceChoice(choice: AmbienceChoice): void {
  writeStorage(AMBIENCE_STORAGE_KEY, choice);
}

/** Разбор сохранённой громкости. */
export function parseAmbienceVolume(raw: string | null): number {
  if (raw === null || raw.trim() === '') return DEFAULT_AMBIENCE_VOLUME;

  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_AMBIENCE_VOLUME;
  if (value < 0 || value > 1) return DEFAULT_AMBIENCE_VOLUME;

  return value;
}

export function readAmbienceVolume(): number {
  return parseAmbienceVolume(readStorage(AMBIENCE_VOLUME_STORAGE_KEY));
}

export function writeAmbienceVolume(volume: number): void {
  writeStorage(AMBIENCE_VOLUME_STORAGE_KEY, String(volume));
}
