/** Освещение мира под тему портфолио: день и сумерки. */

import type { ResolvedTheme } from '@/lib/settings/types';

import { worldFog } from './horizon';

/** Туман по кругу облаков. Он один на оба набора: сумерки только сгущают его. */
const FOG = worldFog();

/** Во сколько раз сумеречный туман берётся ближе и кончается раньше дневного. */
const DUSK_FOG = { near: 0.6, far: 0.87 };

/** Полный набор освещения одного времени суток. */
export type Daylight = {
  /** Небо и дальний план тумана — один цвет: иначе на горизонте видна граница. */
  sky: number;
  fog: { near: number; far: number };
  ambient: { color: number; intensity: number };
  hemisphere: { sky: number; ground: number; intensity: number };
  /** Луна: и светило в кадре, и ключевой свет сцены. */
  moon: {
    /** Цвет спрайта в небе. */
    disc: number;
    /** Цвет ключевого света. Холодный: тёплый лунный свет — это солнце. */
    color: number;
    /** Сила ключевого света. По нему же считается карта теней. */
    intensity: number;
  };
  /** Яркость звёздного поля, доля. */
  stars: number;
  /** Эмиссия светящихся частей мира. */
  emissive: { erdtree: number; fire: number; grace: number };
};

/** День: значения, подобранные вживую. */
export const DAY: Daylight = {
  sky: 0x50638e,
  fog: { ...FOG },
  ambient: { color: 0xffffff, intensity: 0.26 },
  hemisphere: { sky: 0x7c7a90, ground: 0x5f5b4f, intensity: 1.2 },
  moon: { disc: 0xc9d2e4, color: 0xdfe9ff, intensity: 2.8 },
  stars: 0.22,
  emissive: { erdtree: 0.8, fire: 4, grace: 2 },
};

/** Сумерки: то же место на исходе дня, а не ночь. */
export const DUSK: Daylight = {
  sky: 0x1b2340,
  fog: { near: FOG.near * DUSK_FOG.near, far: FOG.far * DUSK_FOG.far },
  ambient: { color: 0x9fb0d8, intensity: 0.14 },
  hemisphere: { sky: 0x2b3358, ground: 0x191b24, intensity: 0.6 },
  moon: { disc: 0xdfe7ff, color: 0xc7d8ff, intensity: 2.2 },
  stars: 1,
  emissive: { erdtree: 1.15, fire: 5.2, grace: 2.9 },
};

export function daylightFor(theme: ResolvedTheme): Daylight {
  return theme === 'dark' ? DUSK : DAY;
}

/** Линейная доля между числами. */
function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

/** Смешивает цвета покомпонентно по каналам. */
function mixColor(from: number, to: number, share: number): number {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(lerp(a, b, share)) << shift;
  };

  return channel(16) | channel(8) | channel(0);
}

/** Промежуточное состояние между двумя наборами. */
export function mixDaylight(from: Daylight, to: Daylight, share: number): Daylight {
  if (share <= 0) return from;
  if (share >= 1) return to;

  const t = share;

  return {
    sky: mixColor(from.sky, to.sky, t),
    fog: {
      near: lerp(from.fog.near, to.fog.near, t),
      far: lerp(from.fog.far, to.fog.far, t),
    },
    ambient: {
      color: mixColor(from.ambient.color, to.ambient.color, t),
      intensity: lerp(from.ambient.intensity, to.ambient.intensity, t),
    },
    hemisphere: {
      sky: mixColor(from.hemisphere.sky, to.hemisphere.sky, t),
      ground: mixColor(from.hemisphere.ground, to.hemisphere.ground, t),
      intensity: lerp(from.hemisphere.intensity, to.hemisphere.intensity, t),
    },
    moon: {
      disc: mixColor(from.moon.disc, to.moon.disc, t),
      color: mixColor(from.moon.color, to.moon.color, t),
      intensity: lerp(from.moon.intensity, to.moon.intensity, t),
    },
    stars: lerp(from.stars, to.stars, t),
    emissive: {
      erdtree: lerp(from.emissive.erdtree, to.emissive.erdtree, t),
      fire: lerp(from.emissive.fire, to.emissive.fire, t),
      grace: lerp(from.emissive.grace, to.emissive.grace, t),
    },
  };
}
