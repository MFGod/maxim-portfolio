import type { Vec3 } from './layout';

export type Camera = {
  yaw: number;
  pitch: number;
  /** Пользовательский масштаб. Базовый, зависящий от ширины, умножается на него. */
  zoom: number;
  panX: number;
  panY: number;
};

export type ProjectedPoint = {
  x: number;
  y: number;
  /** Глубина после поворота: больше — дальше от зрителя. */
  depth: number;
  /** Перспективное сжатие. Им же масштабируется карточка узла. */
  scale: number;
};

export type Viewport = { width: number; height: number };

/** Размер сцены до первого замера: на сервере ширины контейнера ещё нет. */
export const DEFAULT_VIEWPORT: Viewport = Object.freeze({ width: 1000, height: 700 });

const PERSPECTIVE = 950;
/** Половина глубины сцены: совпадает с радиусом оболочки графа. */
const DEPTH_RANGE = 330;

export const ZOOM_RANGE = Object.freeze({ min: 0.45, max: 2.4 });
export const PAN_LIMIT = 700;

export const initialCamera: Camera = Object.freeze({
  yaw: 0.5,
  pitch: -0.28,
  zoom: 1,
  panX: 0,
  panY: 0,
});

export function projectPoint(
  point: Vec3,
  camera: Camera,
  zoom: number,
  viewport: Viewport,
): ProjectedPoint {
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);

  const rx = point.x * cosYaw + point.z * sinYaw;
  const rz = point.z * cosYaw - point.x * sinYaw;
  const ry = point.y * cosPitch - rz * sinPitch;
  const depth = point.y * sinPitch + rz * cosPitch;

  const scale = PERSPECTIVE / (PERSPECTIVE + depth);

  return {
    x: viewport.width / 2 + rx * scale * zoom + camera.panX,
    y: viewport.height / 2 + ry * scale * zoom + camera.panY,
    depth,
    scale,
  };
}

/**
 * Размер карточек под размер сцены: подписи не могут ужиматься вместе с
 * расстояниями, иначе на телефоне их не прочитать.
 */
export function cardScale(baseZoom: number): number {
  return clamp(baseZoom * 1.15, 0.75, 1);
}

/** Глубина в диапазон 0…1: 0 — самый дальний узел, 1 — ближний. */
export function depthFactor(depth: number): number {
  const t = (DEPTH_RANGE - depth) / (DEPTH_RANGE * 2);
  return Math.min(1, Math.max(0, t));
}

/**
 * Смещение курсора в мировые координаты: узел едет в плоскости экрана, как бы
 * ни был повёрнут граф.
 */
export function unprojectDelta(
  dx: number,
  dy: number,
  scale: number,
  camera: Camera,
  zoom: number,
): Vec3 {
  const k = scale * zoom;
  const ax = dx / k;
  const ay = dy / k;

  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);

  return {
    x: ax * cosYaw + ay * sinPitch * sinYaw,
    y: ay * cosPitch,
    z: ax * sinYaw - ay * sinPitch * cosYaw,
  };
}

export function clampCamera(camera: Camera): Camera {
  return {
    yaw: camera.yaw,
    pitch: camera.pitch,
    zoom: clamp(camera.zoom, ZOOM_RANGE.min, ZOOM_RANGE.max),
    panX: clamp(camera.panX, -PAN_LIMIT, PAN_LIMIT),
    panY: clamp(camera.panY, -PAN_LIMIT, PAN_LIMIT),
  };
}

/**
 * Базовый масштаб под размер сцены: на узком экране расстояния между узлами
 * сжимаются, размер карточек при этом не меняется.
 */
export function fitZoom(viewport: Viewport): number {
  return clamp(Math.min(viewport.width / 1000, viewport.height / 820), 0.5, 1.15);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
