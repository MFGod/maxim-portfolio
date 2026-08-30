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
    expect(DUSK.moon.intensity).toBeLessThan(DAY.moon.intensity);
  });

  it('в сумерках светящееся светит сильнее', () => {
    expect(DUSK.emissive.erdtree).toBeGreaterThan(DAY.emissive.erdtree);
    expect(DUSK.emissive.fire).toBeGreaterThan(DAY.emissive.fire);
    expect(DUSK.emissive.grace).toBeGreaterThan(DAY.emissive.grace);
  });

  it('эмиссия остаётся в берегах постобработки', () => {
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

  it('в сумерках звёзды ярче, а днём не гаснут совсем', () => {
    expect(DAY.stars).toBeGreaterThan(0);
    expect(DAY.stars).toBeLessThan(DUSK.stars);
  });

  it('и диск, и свет луны холодные в обоих наборах', () => {
    const warmth = (color: number) => ((color >> 16) & 0xff) - (color & 0xff);

    for (const set of [DAY, DUSK]) {
      expect(warmth(set.moon.disc)).toBeLessThanOrEqual(0);
      expect(warmth(set.moon.color)).toBeLessThanOrEqual(0);
    }
  });

  it('дневной диск бледнее сумеречного: днём небо ведёт, а не светило', () => {
    expect(luma(DAY.moon.disc)).toBeLessThan(luma(DUSK.moon.disc));
  });

  it('луна светит сильнее заполнения — иначе тени не видно', () => {
    for (const set of [DAY, DUSK]) {
      expect(set.moon.intensity).toBeGreaterThan(set.hemisphere.intensity);
      expect(set.moon.intensity).toBeGreaterThan(set.ambient.intensity);
    }
  });

  it('лунный свет остаётся ключевым: тень не тонет в заполнении', () => {
    expect(DUSK.moon.intensity).toBeGreaterThanOrEqual(0.9);
    expect(DAY.moon.intensity).toBeGreaterThan(DAY.ambient.intensity);
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
    const half = mixDaylight(DAY, DUSK, 0.5).sky;
    const channel = (color: number, shift: number) => (color >> shift) & 0xff;

    for (const shift of [16, 8, 0]) {
      const a = channel(DAY.sky, shift);
      const b = channel(DUSK.sky, shift);

      expect(channel(half, shift)).toBe(Math.round((a + b) / 2));
    }
  });

  it('промежуточный набор пригоден как начало следующего перехода', () => {
    const half = mixDaylight(DAY, DUSK, 0.5);
    const back: Daylight = mixDaylight(half, DAY, 1);

    expect(back).toEqual(DAY);
  });
});
