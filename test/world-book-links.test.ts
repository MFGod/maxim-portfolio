import { describe, expect, it } from 'vitest';

import type { LinkHotspot } from '@/lib/world/book/draw';
import { hotspotAt, openLink } from '@/lib/world/book/links';

const SIZE = { width: 1024, height: 1448 };

const spot = (over: Partial<LinkHotspot> = {}): LinkHotspot => ({
  kind: 'link',
  x: 100,
  y: 200,
  width: 300,
  height: 60,
  href: 'https://example.test/',
  label: 'ссылка',
  ...over,
});

/** Адрес найденной мишени: у закрытия его нет, и тест на это и смотрит. */
const hrefOf = (hotspot: ReturnType<typeof hotspotAt>) =>
  hotspot?.kind === 'link' ? hotspot.href : null;

/** Координаты текстуры для пикселя холста: `v` идёт снизу вверх. */
const at = (x: number, y: number) => ({
  u: x / SIZE.width,
  v: 1 - y / SIZE.height,
});

describe('попадание в ссылку страницы', () => {
  it('находит ссылку под указателем', () => {
    expect(hrefOf(hotspotAt([spot()], at(250, 230), SIZE))).toBe(
      'https://example.test/',
    );
  });

  it('промах мимо мишени ничего не даёт', () => {
    expect(hotspotAt([spot()], at(250, 500), SIZE)).toBeNull();
    expect(hotspotAt([spot()], at(700, 230), SIZE)).toBeNull();
  });

  it('края мишени считаются попаданием', () => {
    expect(hotspotAt([spot()], at(101, 201), SIZE)).not.toBeNull();
    expect(hotspotAt([spot()], at(399, 259), SIZE)).not.toBeNull();
  });

  it('ось высоты перевёрнута относительно текстуры', () => {
    const low = spot({ y: 1300 });

    expect(
      hotspotAt([low], { u: 0.2, v: 1 - 1320 / SIZE.height }, SIZE),
    ).not.toBeNull();
    expect(hotspotAt([low], { u: 0.2, v: 1320 / SIZE.height }, SIZE)).toBeNull();
  });

  it('из нескольких мишеней берётся та, в которую попали', () => {
    const first = spot({ y: 200, href: 'https://first.test/' });
    const second = spot({ y: 300, href: 'https://second.test/' });

    expect(hrefOf(hotspotAt([first, second], at(150, 330), SIZE))).toBe(
      'https://second.test/',
    );
  });

  it('пустой список мишеней не ловит ничего', () => {
    expect(hotspotAt([], at(150, 230), SIZE)).toBeNull();
  });

  it('открытие ссылки без окна не падает', () => {
    expect(() => openLink('https://example.test/')).not.toThrow();
  });
});
