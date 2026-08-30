/**
 * Горизонт мира: где садится туман и где обрывается прорисовка.
 *
 * Оба числа считаются от круга облаков, а не подбираются на глаз: туман должен
 * взяться чуть раньше кольца и добрать полную силу внутри облачной полосы, а
 * дальняя плоскость — стоять там, где в кадре уже одно небо.
 */

import { cloudCircle, cloudReach } from './clouds';

/** Насколько раньше кольца облаков берётся туман, юнитов. */
export const FOG_LEAD = 20;

/** На какой доле облачной полосы туман набирает полную силу. */
export const FOG_DEPTH = 0.75;

/** Запас за туманом до дальней плоскости, юнитов. */
export const DRAW_MARGIN = 12;

/** Дальность тумана: от первой дымки до сплошного неба. */
export function worldFog(): { near: number; far: number } {
  const { radius } = cloudCircle();
  const band = cloudReach() - radius;

  return {
    near: radius - FOG_LEAD,
    far: radius + band * FOG_DEPTH,
  };
}

/**
 * Предел прорисовки. Всё, что дальше, туман уже свёл к цвету неба, — срезать
 * это дальней плоскостью бесплатно, а глубине буфера только легче.
 */
export const DRAW_DISTANCE = worldFog().far + DRAW_MARGIN;
