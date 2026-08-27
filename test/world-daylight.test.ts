import { describe, expect, it } from 'vitest';

import {
  DAY,
  DUSK,
  daylightFor,
  mixDaylight,
  type Daylight,
} from '@/lib/world/daylight';

/** Яркость цвета по каналам: грубая, но сравнимая между наборами. */
function luma(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;

  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

describe('наборы освещения', () => {
  it('тема выбирает набор', () => {
    expect(daylightFor('light')).toBe(DAY);
    expect(daylightFor('dark')).toBe(DUSK);
  });

  it('сумерки темнее дня по свету и по небу', () => {
    expect(luma(DUSK.sky)).toBeLessThan(luma(DAY.sky));
    expect(DUSK.ambient.intensity).toBeLessThan(DAY.ambient.intensity);
    expect(DUSK.hemisphere.intensity).toBeLessThan(DAY.hemisphere.intensity);
    expect(DUSK.sun.intensity).toBeLessThan(DAY.sun.intensity);
  });

  it('в сумерках светящееся светит сильнее', () => {
    // Своих точечных источников в сцене нет: `numPointLights` входит в ключ
    // кэша программ, и один добавленный пересобрал бы все 148 материалов.
    // Значит в сумерках свет дают ровно эти три материала.
    expect(DUSK.emissive.erdtree).toBeGreaterThan(DAY.emissive.erdtree);
    expect(DUSK.emissive.fire).toBeGreaterThan(DAY.emissive.fire);
    expect(DUSK.emissive.grace).toBeGreaterThan(DAY.emissive.grace);
  });

  it('эмиссия остаётся в берегах постобработки', () => {
    /*
     * `UnrealBloomPass` ловит всё ярче единицы, `OutputPass` множит кадр на
     * 1.16. Кроны задуманы светящимися, но выше двух ореол съедает половину
     * кадра — это ловилось вживую при переносе сцены.
     */
    for (const set of [DAY, DUSK]) {
      expect(set.emissive.erdtree * 1.16).toBeLessThan(2);
    }
  });

  it('в сумерках туман ближе: даль гаснет раньше', () => {
    expect(DUSK.fog.near).toBeLessThan(DAY.fog.near);
    expect(DUSK.fog.far).toBeLessThan(DAY.fog.far);
  });

  it('туман не вывернут наизнанку', () => {
    for (const set of [DAY, DUSK]) {
      expect(set.fog.near).toBeLessThan(set.fog.far);
      expect(set.fog.near).toBeGreaterThan(0);
    }
  });

  it('солнце сумерек теплее дневного', () => {
    // Холодный ключевой свет сделал бы из сумерек ночь.
    const warmth = (color: number) => ((color >> 16) & 0xff) - (color & 0xff);

    expect(warmth(DUSK.sun.color)).toBeGreaterThan(warmth(DAY.sun.color));
  });
});

describe('переход между наборами', () => {
  it('на концах отдаёт сами наборы', () => {
    expect(mixDaylight(DAY, DUSK, 0)).toEqual(DAY);
    expect(mixDaylight(DAY, DUSK, 1)).toEqual(DUSK);
  });

  it('доля за пределами прижимается к концам', () => {
    expect(mixDaylight(DAY, DUSK, -3)).toEqual(DAY);
    expect(mixDaylight(DAY, DUSK, 7)).toEqual(DUSK);
  });

  it('на середине всё лежит между концами', () => {
    const half = mixDaylight(DAY, DUSK, 0.5);

    expect(half.ambient.intensity).toBeCloseTo(
      (DAY.ambient.intensity + DUSK.ambient.intensity) / 2,
      6,
    );
    expect(luma(half.sky)).toBeLessThan(luma(DAY.sky));
    expect(luma(half.sky)).toBeGreaterThan(luma(DUSK.sky));
  });

  it('цвет смешивается по каналам, а не числом целиком', () => {
    /*
     * Между `0x50638e` и `0x1b2340` лежат значения, у которых старший байт уже
     * уехал, а младший ещё нет: смесь числом ушла бы мимо обоих цветов.
     */
    const half = mixDaylight(DAY, DUSK, 0.5).sky;
    const channel = (color: number, shift: number) => (color >> shift) & 0xff;

    for (const shift of [16, 8, 0]) {
      const a = channel(DAY.sky, shift);
      const b = channel(DUSK.sky, shift);

      expect(channel(half, shift)).toBe(Math.round((a + b) / 2));
    }
  });

  it('промежуточный набор пригоден как начало следующего перехода', () => {
    // Тему успевают переключить дважды, пока идёт первая секунда.
    const half = mixDaylight(DAY, DUSK, 0.5);
    const back: Daylight = mixDaylight(half, DAY, 1);

    expect(back).toEqual(DAY);
  });
});
