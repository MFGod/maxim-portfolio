export type WorldBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** Границы мира после обрезки. */

export const MAP_BOUNDS: WorldBounds = {
  minX: -48.019,
  maxX: 71.72,
  minZ: -76.584,
  maxZ: 38.156,
};

/** Поверхность океана в мировых координатах. */
export const SEA_LEVEL = 0.09;

/**
 * Абсолютный минимум высоты камеры — над водой, где под ногами нет рельефа.
 * Запас маленький: над сушей камеру держит карта высот (`collision.js`), а
 * прежние +1.2 были выше рельефа зелёных низин и не давали спуститься к земле.
 */
export const CAMERA_FLOOR = SEA_LEVEL + 0.2;

/** Отступ камеры от границы карты, в юнитах. */
export const CAMERA_MARGIN = 4;

/** Прямоугольник, за который камера не выходит. */
export const CAMERA_BOUNDS: WorldBounds = {
  minX: MAP_BOUNDS.minX + CAMERA_MARGIN,
  maxX: MAP_BOUNDS.maxX - CAMERA_MARGIN,
  minZ: MAP_BOUNDS.minZ + CAMERA_MARGIN,
  maxZ: MAP_BOUNDS.maxZ - CAMERA_MARGIN,
};
