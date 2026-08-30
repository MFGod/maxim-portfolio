/** Ход по маршруту: где стоит идущий и куда смотрит. */

export type Waypoint = readonly [number, number, number];

/** Куда попал идущий: точка и курс в радианах вокруг вертикали. */
export type Step = {
  x: number;
  y: number;
  z: number;
  /** Курс: `Math.atan2(dx, dz)` направления хода. */
  heading: number;
};

/** Длина ломаной по горизонтали. Высота в длину не идёт: шаг мерят по земле. */
export function routeLength(route: readonly Waypoint[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]!;
    const to = route[i]!;
    total += Math.hypot(to[0] - from[0], to[2] - from[2]);
  }
  return total;
}

/**
 * Складывает пройденное расстояние «гармошкой»: туда и обратно.
 * @returns расстояние от начала маршрута и признак хода вперёд
 */
export function foldDistance(
  travelled: number,
  length: number,
): { at: number; forward: boolean } {
  if (length <= 0) return { at: 0, forward: true };

  const cycle = length * 2;
  const phase = ((travelled % cycle) + cycle) % cycle;

  return phase <= length
    ? { at: phase, forward: true }
    : { at: cycle - phase, forward: false };
}

/** Точка на ломаной и курс в ней. */
export function stepAt(
  route: readonly Waypoint[],
  distance: number,
  forward = true,
): Step {
  const first = route[0]!;
  if (route.length < 2) return { x: first[0], y: first[1], z: first[2], heading: 0 };

  let left = Math.max(distance, 0);

  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1]!;
    const to = route[i]!;
    const span = Math.hypot(to[0] - from[0], to[2] - from[2]);

    if (left > span && i < route.length - 1) {
      left -= span;
      continue;
    }

    const part = span > 0 ? Math.min(left / span, 1) : 0;
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];

    return {
      x: from[0] + dx * part,
      y: from[1] + (to[1] - from[1]) * part,
      z: from[2] + dz * part,
      heading: forward ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz),
    };
  }

  const last = route[route.length - 1]!;
  return { x: last[0], y: last[1], z: last[2], heading: 0 };
}

/**
 * Где идущий под номером `index` в момент `seconds`.
 * @param spacing промежуток между идущими в юнитах
 */
export function walkerStep(
  route: readonly Waypoint[],
  seconds: number,
  index: number,
  speed: number,
  spacing: number,
  walkers = 1,
): Step {
  const length = routeLength(route);

  const span = Math.max(walkers - 1, 0) * spacing;
  const march = Math.max(length - span, 0);
  const { at, forward } = foldDistance(seconds * speed, march);

  return stepAt(route, at + index * spacing, forward);
}
