/**
 * Перестановка книги в кадре: из пикселей протяжки в юниты мира.
 *
 * Закрытый том лежит в углу, и место это не всегда удачное: мир вокруг живой,
 * и близкое дерево или скала оказываются к камере ближе книги. Поэтому книгу
 * можно переставить — протяжкой с зажатым `Shift`.
 *
 * Файл не знает про `three`: здесь только арифметика перспективы, и это
 * единственная часть перестановки, которую можно проверить тестом.
 */

/** Половина видимого прямоугольника на заданной глубине, в юнитах. */
export type FrameHalf = { width: number; height: number };

/**
 * Сколько юнитов мира приходится на пиксель кадра на глубине `distance`.
 *
 * Видимая высота на расстоянии d равна 2·d·tan(fov/2) — та же формула, по
 * которой считаны позы в `metrics.ts`. Делённая на высоту кадра в пикселях,
 * она даёт цену пикселя: книга идёт ровно за указателем, а не «примерно рядом».
 *
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
 *
 * Утащить том за край нельзя: вернуть его оттуда было бы нечем — кнопка
 * открывает книгу, а не ищет её. Книга упирается в границу кадра, отступив на
 * свой радиус, так что видна целиком при любом повороте.
 *
 * Отступ именно радиусом, а не половиной габарита: начало координат книги — у
 * корешка, половины стоят по одну сторону от него, и повёрнутый том уходит от
 * своего начала дальше, чем на половину ширины. На этом книга уже уезжала за
 * верхний край кадра.
 *
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
