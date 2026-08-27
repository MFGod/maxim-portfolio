/**
 * Траектория камеры: как из списка ракурсов получается движение.
 *
 * Модуль чистый — ни three, ни браузера. Пролёт можно проверить тестом, а не
 * глазами: где камера окажется на середине, не ныряет ли она под воду, идёт ли
 * плавно. Это единственный способ поймать ошибку до того, как её увидит
 * посетитель, — глазами ловится только грубое.
 *
 * Кривая — Catmull-Rom по опорным точкам: она проходит **через** каждую из них,
 * а не мимо, и это здесь главное. Ракурсы подобраны вживую, камера обязана
 * оказаться ровно в них, а не рядом.
 *
 * Две вещи отличают её от учебной:
 *
 * 1. Узлы расставлены по расстоянию в степени 0.5 — центростремительный
 *    вариант. Равномерный забрасывает кривую за опоры там, где соседние
 *    расстояния разной длины: план перелёта ставит опоры неравномерно, и на
 *    двух препятствиях скорость гуляла вдвое (замер: max/среднее 2.14).
 * 2. Доля пути отсчитывается по **длине самой кривой**, а не по хордам между
 *    опорами. По хордам дуга обсчитывалась короче, чем есть, и камера на ней
 *    разгонялась.
 *
 * Концы не дублируются, а достраиваются зеркально: при дубле касательная на
 * входе и выходе вдвое короче, и камера кралась у станций (замер: 0.50 от
 * средней скорости даже на прямой из двух опор).
 *
 * Взгляд ведётся **направлением**, а не точкой. Точка взгляда — это место в
 * мире, и вести её по кривой значит подписаться на то, что она пройдёт близко
 * к камере: тогда её малое смещение разворачивает кадр целиком. Замер по всем
 * двадцати одному перелёту: там, где точка подходила к камере на 3-5 юнитов,
 * кадр разворачивало со скоростью до 729° в секунду при угловом ускорении
 * 6999°/с² — это не «недостаточно плавно», это рывок. Поэтому опора отдаёт
 * рыскание, тангаж и дальность, и кривая идёт по ним: угловая скорость тогда
 * следует той же параметризации, что и путь. После перехода — 305°/с и
 * 1447°/с² на том же худшем перелёте.
 */

import { cubicBezier } from 'motion';

/** Точка в мировых координатах: X, Y, Z. */
export type Point3 = readonly [number, number, number];

/** Опора пути: где камера и куда смотрит. */
export type PathKey = {
  at: Point3;
  look: Point3;
};

export type CameraPose = {
  position: Point3;
  look: Point3;
};

/**
 * Плавность пролёта: медленный старт, разгон, мягкая остановка.
 *
 * `smootherstep` — многочлен с нулевой первой и второй производной на обоих
 * концах. Прежняя `cubicBezier(0.32, 0, 0.16, 1)` разгоняла камеру до 2.9
 * средней скорости в середине пути, и этот разгон множил собой всё остальное:
 * пик угловой скорости на шаге между станциями упирался в 140°/с там, где на
 * мягкой выходит 91. Линейное движение по-прежнему не годится — оно читается
 * как перемотка.
 */
export const easeFlight = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Мягкая доводка: пропуск пролёта и возврат камеры в разрешённую зону. */
export const easeSettle = cubicBezier(0.22, 1, 0.36, 1);

/** Степень для расстояния между узлами. 0.5 — центростремительная кривая. */
const ALPHA = 0.5;

/**
 * Сколько градусов разворота кадра камера проходит за секунду.
 *
 * Длительность по одной длине пути не годится: четыре перелёта укладывались в
 * нижний предел в 1.4 секунды, разворачивая кадр на 124-140°. Даже идеально
 * гладко это сотня градусов в секунду — вдвое выше спокойной панорамы.
 */
const TURN_SPEED = 45;

/** Подвыборок на участок при замере длины кривой. */
const SUBSTEPS = 24;

/** Минимальный шаг узла: совпавшие опоры не должны делить на ноль. */
const EPSILON = 1e-6;

/** Разобранный путь: точки с виртуальными концами, узлы и таблица длин. */
type Curve = {
  at: number[][];
  /** Взгляд как рыскание, тангаж и дальность — по опоре на каждую точку. */
  aim: number[][];
  knots: number[];
  /** Полный разворот кадра по опорам, в градусах. */
  turn: number;
  /** Участков между настоящими опорами. */
  segments: number;
  /** Длина кривой на каждом участке. */
  spans: number[];
  /** Накопленная длина и её место на кривой: `seg + u`. */
  marks: { length: number; g: number }[];
  total: number;
};

/**
 * Разбор пути кэшируется по ссылке на массив опор.
 *
 * `samplePath` зовётся каждый кадр пролёта, а таблица длин стоит сотни
 * вычислений полинома. Массив опор строится один раз на перелёт, так что
 * ссылка — честный ключ.
 */
const curves = new WeakMap<PathKey[], Curve>();

const distance = (a: Point3, b: Point3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Зеркальное продолжение: точка за концом, чтобы касательная была настоящей. */
const mirror = (inner: readonly number[], next: readonly number[]): number[] => [
  2 * inner[0]! - next[0]!,
  2 * inner[1]! - next[1]!,
  2 * inner[2]! - next[2]!,
];

/**
 * Взгляд опоры в углах: рыскание, тангаж и дальность.
 *
 * Рыскание разворачивается по кратчайшему пути от предыдущей опоры: между
 * -179° и 179° два градуса, а не триста пятьдесят восемь, и камера не обязана
 * ехать через весь горизонт из-за того, что счёт углов где-то замкнулся.
 */
function aimOf(keys: PathKey[]): { angles: number[][]; turn: number } {
  const angles: number[][] = [];
  let turn = 0;

  for (const [index, key] of keys.entries()) {
    const dx = key.look[0] - key.at[0];
    const dy = key.look[1] - key.at[1];
    const dz = key.look[2] - key.at[2];
    const reach = Math.hypot(dx, dy, dz);
    const previous = angles[index - 1];

    // Взгляд в собственную точку направления не задаёт — берём прежнее.
    if (reach < EPSILON) {
      angles.push([previous?.[0] ?? 0, previous?.[1] ?? 0, 0]);
      continue;
    }

    let yaw = Math.atan2(dx / reach, dz / reach);
    const pitch = Math.asin(Math.min(Math.max(dy / reach, -1), 1));

    if (previous) {
      const before = previous[0]!;
      yaw += Math.round((before - yaw) / (2 * Math.PI)) * 2 * Math.PI;

      // Разворот кадра считаем по настоящему углу между направлениями, а не по
      // разнице рыскания: у задранного взгляда рыскание врёт в разы.
      const cos =
        Math.cos(pitch) * Math.cos(previous[1]!) * Math.cos(yaw - before) +
        Math.sin(pitch) * Math.sin(previous[1]!);
      turn += (Math.acos(Math.min(Math.max(cos, -1), 1)) * 180) / Math.PI;
    }

    angles.push([yaw, pitch, reach]);
  }

  return { angles, turn };
}

/**
 * Значение одной оси на участке.
 *
 * Эрмит с касательными неравномерной Catmull-Rom: касательная считается по
 * шагам узлов, а не по номерам точек, — иначе на разной длине участков кривая
 * забрасывается за опору.
 */
function axisValue(
  points: number[][],
  knots: number[],
  seg: number,
  u: number,
  axis: 0 | 1 | 2,
): number {
  const p0 = points[seg]![axis]!;
  const p1 = points[seg + 1]![axis]!;
  const p2 = points[seg + 2]![axis]!;
  const p3 = points[seg + 3]![axis]!;

  const d1 = knots[seg + 1]! - knots[seg]!;
  const d2 = knots[seg + 2]! - knots[seg + 1]!;
  const d3 = knots[seg + 3]! - knots[seg + 2]!;

  const m1 = d2 * ((p1 - p0) / d1 - (p2 - p0) / (d1 + d2) + (p2 - p1) / d2);
  const m2 = d2 * ((p2 - p1) / d2 - (p3 - p1) / (d2 + d3) + (p3 - p2) / d3);

  const u2 = u * u;
  const u3 = u2 * u;

  return (
    (2 * u3 - 3 * u2 + 1) * p1 +
    (u3 - 2 * u2 + u) * m1 +
    (-2 * u3 + 3 * u2) * p2 +
    (u3 - u2) * m2
  );
}

const pointAt = (curve: Curve, points: number[][], g: number): Point3 => {
  const seg = Math.min(Math.floor(g), curve.segments - 1);
  const u = g - seg;

  return [
    axisValue(points, curve.knots, seg, u, 0),
    axisValue(points, curve.knots, seg, u, 1),
    axisValue(points, curve.knots, seg, u, 2),
  ];
};

function buildCurve(keys: PathKey[]): Curve {
  const at = [
    mirror(keys[0]!.at, keys[1]!.at),
    ...keys.map((key) => [...key.at]),
    mirror(keys.at(-1)!.at, keys.at(-2)!.at),
  ];
  const { angles, turn } = aimOf(keys);
  const aim = [
    mirror(angles[0]!, angles[1]!),
    ...angles,
    mirror(angles.at(-1)!, angles.at(-2)!),
  ];

  // Узлы по положению камеры: взгляд обязан идти с ней в ногу, своей
  // параметризации у него быть не может. Зеркальные концы дают шаг, равный
  // соседнему участку, — потому касательная на входе и выходе полноразмерная.
  const knots = [0];
  for (let i = 1; i < at.length; i++) {
    const step = Math.hypot(
      at[i]![0]! - at[i - 1]![0]!,
      at[i]![1]! - at[i - 1]![1]!,
      at[i]![2]! - at[i - 1]![2]!,
    );
    knots.push(knots[i - 1]! + Math.max(step ** ALPHA, EPSILON));
  }

  const curve: Curve = {
    at,
    aim,
    knots,
    turn,
    segments: keys.length - 1,
    spans: [],
    marks: [],
    total: 0,
  };

  // Длина кривой: полином по длине не берётся аналитически, зато по мелким
  // подвыборкам ошибка уходит в доли процента.
  let previous = pointAt(curve, at, 0);
  curve.marks.push({ length: 0, g: 0 });

  for (let seg = 0; seg < curve.segments; seg++) {
    const before = curve.total;

    for (let step = 1; step <= SUBSTEPS; step++) {
      const g = seg + step / SUBSTEPS;
      const point = pointAt(curve, at, g);
      curve.total += distance(previous, point);
      curve.marks.push({ length: curve.total, g });
      previous = point;
    }

    curve.spans.push(curve.total - before);
  }

  return curve;
}

function curveOf(keys: PathKey[]): Curve {
  const cached = curves.get(keys);
  if (cached) return cached;

  const built = buildCurve(keys);
  curves.set(keys, built);
  return built;
}

/** Место на кривой по пройденной длине. */
function markAt(curve: Curve, travelled: number): number {
  const { marks } = curve;

  let low = 0;
  let high = marks.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (marks[middle]!.length <= travelled) low = middle;
    else high = middle - 1;
  }

  const start = marks[low]!;
  const next = marks[low + 1];
  if (!next) return start.g;

  const span = next.length - start.length;
  const local = span <= 0 ? 0 : (travelled - start.length) / span;

  return start.g + (next.g - start.g) * local;
}

/**
 * Длины участков кривой и полная длина.
 *
 * Считается по самой кривой, а не по хордам между опорами: на дуге обхода
 * препятствия разница доходит до процентов, и камера на ней разгонялась.
 */
export function pathLengths(keys: PathKey[]): { spans: number[]; total: number } {
  if (keys.length < 2) return { spans: [], total: 0 };

  const curve = curveOf(keys);
  return { spans: curve.spans, total: curve.total };
}

/**
 * Поза камеры на доле пути.
 *
 * @param keys опоры, не меньше двух
 * @param t доля пути от 0 до 1, уже с учётом плавности
 */
export function samplePath(keys: PathKey[], t: number): CameraPose {
  if (keys.length === 0) {
    throw new Error('Пустой путь: камере некуда лететь');
  }

  const first = keys[0]!;
  if (keys.length === 1) return { position: first.at, look: first.look };

  const curve = curveOf(keys);

  // Все опоры в одной точке: делить не на что, отдаём первую.
  if (curve.total === 0) return { position: first.at, look: first.look };

  const clamped = Math.min(Math.max(t, 0), 1);
  const g = markAt(curve, clamped * curve.total);

  const position = pointAt(curve, curve.at, g);
  const [yaw, pitch, reach] = pointAt(curve, curve.aim, g);

  // Дальность зажимаем: у зеркальных концов она может уйти в минус, а взгляд
  // за спину — это уже другой кадр, а не тот же с другого расстояния.
  const forward = Math.max(reach, 0);
  const flat = Math.cos(pitch) * forward;

  return {
    position,
    look: [
      position[0] + Math.sin(yaw) * flat,
      position[1] + Math.sin(pitch) * forward,
      position[2] + Math.cos(yaw) * flat,
    ],
  };
}

/** Полный разворот кадра вдоль пути, в градусах. */
export function pathTurn(keys: PathKey[]): number {
  if (keys.length < 2) return 0;
  return curveOf(keys).turn;
}

/**
 * Сколько длится пролёт: и по длине пути, и по развороту кадра.
 *
 * Постоянная длительность не годится — перелёт между соседними главами в
 * девять юнитов и вход через полмира прошли бы за одно время, и первый выглядел
 * бы рывком, а второй перемоткой.
 *
 * Одной длины тоже мало. Замер: четыре перелёта укладывались в нижний предел в
 * 1.4 секунды и разворачивали при этом кадр на 124-140° — путь короткий, а
 * смотреть камера начинает совсем в другую сторону. Берём большее из двух
 * времён: то, что дольше, и есть настоящая работа перелёта.
 */
export function flightDuration(
  keys: PathKey[],
  options: { speed?: number; turnSpeed?: number; min?: number; max?: number } = {},
): number {
  // 8.25 юнита в секунду — на четверть медленнее прежних одиннадцати: на них
  // перелёт между соседними станциями успевал только мелькнуть.
  const { speed = 8.25, turnSpeed = TURN_SPEED, min = 1400, max = 11000 } = options;
  const { total } = pathLengths(keys);

  const byPath = (total / speed) * 1000;
  const byTurn = (pathTurn(keys) / turnSpeed) * 1000;

  return Math.min(Math.max(byPath, byTurn, min), max);
}
