import { describe, expect, it } from 'vitest';

import {
  AMBIENCE_TRACKS,
  ambienceTrack,
  ambienceUrl,
  DEFAULT_AMBIENCE_CHOICE,
  DEFAULT_AMBIENCE_VOLUME,
  parseAmbienceChoice,
  parseAmbienceVolume,
  SILENCE,
} from '@/lib/world/ambience';

describe('опись фоновых записей', () => {
  it('у каждой записи есть автор, лицензия и ссылка на неё', () => {
    for (const track of AMBIENCE_TRACKS) {
      expect(track.author.length).toBeGreaterThan(0);
      expect(track.license.length).toBeGreaterThan(0);
      expect(track.licenseUrl).toMatch(/^https:\/\//);
      expect(track.source).toMatch(/^https:\/\//);
    }
  });

  it('идентификаторы и файлы не повторяются', () => {
    const ids = AMBIENCE_TRACKS.map((track) => track.id);
    const files = AMBIENCE_TRACKS.map((track) => track.file);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(files).size).toBe(files.length);
  });

  it('тишина не занята записью: иначе её нельзя было бы выбрать', () => {
    expect(ambienceTrack(SILENCE)).toBeNull();
  });

  it('громкость лежит в пределах, которые принимает элемент', () => {
    expect(DEFAULT_AMBIENCE_VOLUME).toBeGreaterThan(0);
    expect(DEFAULT_AMBIENCE_VOLUME).toBeLessThanOrEqual(1);
  });
});

describe('адрес записи', () => {
  it('собирается от базы ассетов мира, а не от корня сайта', () => {
    const track = AMBIENCE_TRACKS[0]!;

    expect(ambienceUrl(track)).toBe(`/world/ambience/${track.file}`);
  });
});

describe('разбор сохранённого выбора', () => {
  it('известное имя проходит как есть', () => {
    const id = AMBIENCE_TRACKS[0]!.id;

    expect(parseAmbienceChoice(id)).toBe(id);
  });

  it('пустое хранилище — запись по умолчанию: выбора ещё не было', () => {
    expect(parseAmbienceChoice(null)).toBe(DEFAULT_AMBIENCE_CHOICE);
    expect(parseAmbienceChoice('')).toBe(DEFAULT_AMBIENCE_CHOICE);
  });

  it('запись по умолчанию есть в описи', () => {
    expect(ambienceTrack(DEFAULT_AMBIENCE_CHOICE)).not.toBeNull();
  });

  it('неизвестное имя сводится к тишине, а не к записи по умолчанию', () => {
    expect(parseAmbienceChoice('darkroot-basin')).toBe(SILENCE);
    expect(parseAmbienceChoice('{"id":1}')).toBe(SILENCE);
    expect(parseAmbienceChoice('../../etc/passwd')).toBe(SILENCE);
  });
});

describe('разбор сохранённой громкости', () => {
  it('число из отрезка проходит как есть', () => {
    expect(parseAmbienceVolume('0')).toBe(0);
    expect(parseAmbienceVolume('0.35')).toBe(0.35);
    expect(parseAmbienceVolume('1')).toBe(1);
  });

  it('пустое хранилище — значение по умолчанию', () => {
    expect(parseAmbienceVolume(null)).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(parseAmbienceVolume('')).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(parseAmbienceVolume('   ')).toBe(DEFAULT_AMBIENCE_VOLUME);
  });

  it('мусор и выход за отрезок сводятся к значению по умолчанию', () => {
    expect(parseAmbienceVolume('громко')).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(parseAmbienceVolume('NaN')).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(parseAmbienceVolume('Infinity')).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(parseAmbienceVolume('-0.2')).toBe(DEFAULT_AMBIENCE_VOLUME);
    expect(parseAmbienceVolume('2')).toBe(DEFAULT_AMBIENCE_VOLUME);
  });
});
