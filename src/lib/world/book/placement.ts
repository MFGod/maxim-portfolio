/** Перестановка книги в кадре: из пикселей протяжки в юниты мира. */

/** Половина видимого прямоугольника на заданной глубине, в юнитах. */
export type FrameHalf = { width: number; height: number };

/**
 * Сколько юнитов мира приходится на пиксель кадра на глубине `distance`.
 * @param distance расстояние от камеры до книги, в юнитах
 * @param fov вертикальный угол обзора камеры, в градусах
 * @param framePixels высота кадра в пикселях
 */
export function worldPerPixel(
  distance: number,
  fov: number,
  framePixels: number,
): number {
  if (framePixels <= 0) return 0;
  return (2 * distance * Math.tan((fov * Math.PI) / 180 / 2)) / framePixels;
}

/** Половина видимого прямоугольника на глубине `distance`. */
export function frameHalf(distance: number, fov: number, aspect: number): FrameHalf {
  const height = distance * Math.tan((fov * Math.PI) / 180 / 2);
  return { width: height * aspect, height };
}

/**
 * Держит книгу в кадре.
 * @param margin радиус книги вокруг её начала координат, в юнитах
 */
export function keptInFrame(
  center: { x: number; y: number },
  frame: FrameHalf,
  margin: number,
): { x: number; y: number } {
  const limitX = Math.max(frame.width - margin, 0);
  const limitY = Math.max(frame.height - margin, 0);

  return {
    x: Math.min(Math.max(center.x, -limitX), limitX),
    y: Math.min(Math.max(center.y, -limitY), limitY),
  };
}

/** Кромки силуэта убранного тома, в юнитах на его глубине. */
export type StowedEdges = {
  /** Самая правая точка силуэта: правые углы тома. */
  right: number;
  /** Самая нижняя точка силуэта: нижние углы тома. */
  bottom: number;
};

/**
 * Куда сдвинуть убранную книгу, чтобы её силуэт встал в угол кадра.
 * @param placed где книга стоит сейчас, в осях камеры
 * @param edges кромки её силуэта, замеренные по этому месту
 * @param frame половина видимого прямоугольника на глубине книги
 * @param margin просветы от кромок кадра до силуэта, в юнитах
 */
export function stowedCorner(
  placed: { x: number; y: number },
  edges: StowedEdges,
  frame: FrameHalf,
  margin: { side: number; bottom: number },
): { x: number; y: number } {
  const right = frame.width - margin.side;
  const bottom = -(frame.height - margin.bottom);

  return {
    x: Math.max(placed.x + (right - edges.right), 0),
    y: Math.min(placed.y + (bottom - edges.bottom), 0),
  };
}
