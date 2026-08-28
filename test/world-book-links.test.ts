import { describe, expect, it } from 'vitest';

import type { PageHotspot } from '@/lib/world/book/draw';
import { hotspotAt, openLink } from '@/lib/world/book/links';

const SIZE = { width: 1024, height: 1448 };

const spot = (over: Partial<PageHotspot> = {}): PageHotspot => ({
  x: 100,
  y: 200,
  width: 300,
  height: 60,
  href: 'https://example.test/',
  label: 'ссылка',
  ...over,
});

/** Координаты текстуры для пикселя холста: `v` идёт снизу вверх. */
const at = (x: number, y: number) => ({
  u: x / SIZE.width,
  v: 1 - y / SIZE.height,
});

describe('попадание в ссылку страницы', () => {
  it('находит ссылку под указателем', () => {
    expect(hotspotAt([spot()], at(250, 230), SIZE)?.href).toBe('https://example.test/');
  });

  it('промах мимо мишени ничего не даёт', () => {
    expect(hotspotAt([spot()], at(250, 500), SIZE)).toBeNull();
    expect(hotspotAt([spot()], at(700, 230), SIZE)).toBeNull();
  });

  it('края мишени считаются попаданием', () => {
    /*
     * Иначе строка ловится уже, чем нарисована, и щелчок по её краю листает
     * страницу вместо перехода.
     *
     * Проверяется пиксель внутри края, а не сам край: путь «пиксель → доля →
     * пиксель» проходит через деление, и точная граница возвращается из него
     * то на тысячную больше, то на тысячную меньше. Сравнивать края холста
     * числами с плавающей точкой бессмысленно, а мишень и без того выше
     * строки на запас в двенадцать пикселей.
     */
    expect(hotspotAt([spot()], at(101, 201), SIZE)).not.toBeNull();
    expect(hotspotAt([spot()], at(399, 259), SIZE)).not.toBeNull();
  });

  it('ось высоты перевёрнута относительно текстуры', () => {
    /*
     * Ловушка перевода координат: `v` у геометрии смотрит вверх, `y` у холста
     * — вниз. Без переворота мишень внизу страницы ловилась бы наверху, где
     * ничего нет, и ссылка молча не открывалась бы.
     */
    const low = spot({ y: 1300 });

    expect(
      hotspotAt([low], { u: 0.2, v: 1 - 1320 / SIZE.height }, SIZE),
    ).not.toBeNull();
    expect(hotspotAt([low], { u: 0.2, v: 1320 / SIZE.height }, SIZE)).toBeNull();
  });

  it('из нескольких мишеней берётся та, в которую попали', () => {
    const first = spot({ y: 200, href: 'https://first.test/' });
    const second = spot({ y: 300, href: 'https://second.test/' });

    expect(hotspotAt([first, second], at(150, 330), SIZE)?.href).toBe(
      'https://second.test/',
    );
  });

  it('пустой список мишеней не ловит ничего', () => {
    expect(hotspotAt([], at(150, 230), SIZE)).toBeNull();
  });

  it('открытие ссылки без окна не падает', () => {
    // Страницу рисует и сервер — при пререндере окна нет, а код один.
    expect(() => openLink('https://example.test/')).not.toThrow();
  });
});
