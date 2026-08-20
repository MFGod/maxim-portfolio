/**
 * Множественное выделение: правила над множеством идентификаторов и геометрия
 * рамки. Без DOM — на столе попадания считаются по сохранённым координатам, в
 * окне папки по замерам плиток, а правила у них общие.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** Добавляет объект к выделению или убирает из него: Ctrl/Cmd + клик. */
export function toggle(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * Диапазон от якоря до объекта в порядке сетки: Shift + клик. Якоря нет или он
 * выпал из сетки (объект удалили) — выделяется один объект, как при обычном
 * клике.
 */
export function extendTo(
  order: readonly string[],
  anchor: string | null,
  id: string,
): Set<string> {
  const to = order.indexOf(id);
  if (to === -1) return new Set();

  const from = anchor === null ? -1 : order.indexOf(anchor);
  if (from === -1) return new Set([id]);

  return new Set(order.slice(Math.min(from, to), Math.max(from, to) + 1));
}

/**
 * Пересекаются ли прямоугольники. Касание краями считается пересечением: рамка
 * захватывает всё, чего коснулась, — так ведут себя и Finder, и проводник.
 */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}

/**
 * Одинаковы ли множества. Рамка пересчитывает попадания на каждом кадре, и без
 * этой проверки состояние обновлялось бы 60 раз в секунду впустую.
 */
export function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

/** Прямоугольник по двум углам. Тянуть рамку можно в любую сторону. */
export function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
