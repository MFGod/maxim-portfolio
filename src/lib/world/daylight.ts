/**
 * Освещение мира под тему портфолио: день и сумерки.
 *
 * Мир — не отдельный экспонат, а страница того же сайта. Открытый из тёмного
 * интерфейса полдень бьёт по глазам и читается чужой вкладкой, а не
 * продолжением. Поэтому тема ведёт не только подписи, но и свет.
 *
 * Два набора данными, а не ветвями в сцене: так видно оба разом — где холоднее
 * небо, где ближе туман, — и подбор идёт правкой чисел, а не логики. Переход
 * между ними смешивается покомпонентно, поэтому смена темы не мигает.
 *
 * Пределы держит постобработка, и они не абстрактные: `OutputPass` применяет
 * экспозицию 1.16, а `UnrealBloomPass` ловит всё ярче единицы. Поэтому эмиссия
 * в сумерках поднимается, но остаётся в берегах — иначе кроны, задуманные
 * светящимися, полыхают ореолом в половину кадра.
 */

import type { ResolvedTheme } from '@/lib/settings/types';

/** Полный набор освещения одного времени суток. */
export type Daylight = {
  /** Небо и дальний план тумана — один цвет: иначе на горизонте видна граница. */
  sky: number;
  fog: { near: number; far: number };
  ambient: { color: number; intensity: number };
  hemisphere: { sky: number; ground: number; intensity: number };
  sun: { color: number; intensity: number };
  /**
   * Эмиссия светящихся частей мира.
   *
   * В сумерках они и есть источники света: своих точечных в сцене нет вовсе —
   * `numPointLights` входит в ключ кэша шейдерных программ, и один добавленный
   * источник пересобрал бы все 148 материалов карты.
   */
  emissive: { erdtree: number; fire: number; grace: number };
};

/** День: значения, подобранные вживую при переносе сцены из форка. */
export const DAY: Daylight = {
  sky: 0x50638e,
  // Подобрано под обрезанный мир 119.7 × 114.7 на рабочей дистанции орбиты.
  fog: { near: 70, far: 170 },
  ambient: { color: 0xffffff, intensity: 1 },
  hemisphere: { sky: 0x7c7a90, ground: 0x5f5b4f, intensity: 7 },
  sun: { color: 0xffffff, intensity: 1 },
  emissive: { erdtree: 0.8, fire: 4, grace: 2 },
};

/**
 * Сумерки: то же место на исходе дня, а не ночь.
 *
 * Ночь пришлось бы отменять — карта читается силуэтами, а маршрут по ней
 * проходят глазами. Сумерки дают тёмной теме её тон и при этом оставляют
 * ландшафт различимым.
 *
 * Туман ближе, чем днём: в сумерках даль гаснет раньше, и это же прячет край
 * обрезанной карты, который при холодном небе виден отчётливее.
 */
export const DUSK: Daylight = {
  sky: 0x1b2340,
  fog: { near: 42, far: 148 },
  ambient: { color: 0x9fb0d8, intensity: 0.42 },
  hemisphere: { sky: 0x2b3358, ground: 0x191b24, intensity: 3.1 },
  // Низкое тёплое солнце: холодный ключевой свет сделал бы из сумерек ночь.
  sun: { color: 0xffc79a, intensity: 0.52 },
  emissive: { erdtree: 1.15, fire: 5.2, grace: 2.9 },
};

export function daylightFor(theme: ResolvedTheme): Daylight {
  return theme === 'dark' ? DUSK : DAY;
}

/** Линейная доля между числами. */
function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

/**
 * Смешивает цвета покомпонентно по каналам.
 *
 * По каналам, а не по числу целиком: между `0x50638e` и `0x1b2340` лежат
 * значения, у которых старший байт уже уехал, а младший ещё нет — смесь ушла
 * бы в зелёный на полпути.
 */
function mixColor(from: number, to: number, share: number): number {
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(lerp(a, b, share)) << shift;
  };

  return channel(16) | channel(8) | channel(0);
}

/**
 * Промежуточное состояние между двумя наборами.
 *
 * Нужно переходу: смена темы посреди прогулки должна занимать секунду, а не
 * случаться кадром — резкая подмена неба читается сбоем отрисовки.
 */
export function mixDaylight(from: Daylight, to: Daylight, share: number): Daylight {
  /*
   * Концы отдаются сами собой, а не считаются.
   *
   * `from + (to - from) * 1` во `float` промахивается мимо `to` на последний
   * бит: 3.0999999999999996 вместо 3.1. Само по себе это невидимо, но переход
   * заканчивается «почти целевым» набором, и следующий начинается с него —
   * ошибка копится от переключения к переключению.
   */
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
    sun: {
      color: mixColor(from.sun.color, to.sun.color, t),
      intensity: lerp(from.sun.intensity, to.sun.intensity, t),
    },
    emissive: {
      erdtree: lerp(from.emissive.erdtree, to.emissive.erdtree, t),
      fire: lerp(from.emissive.fire, to.emissive.fire, t),
      grace: lerp(from.emissive.grace, to.emissive.grace, t),
    },
  };
}
