/**
 * Заселение мира — инструмент запекания, брат `dev-figures.ts`.
 *
 * Расставить полторы сотни фигур руками нельзя, а на глаз — тем более: каждая
 * точка требует трёх замеров лучом, и любая пропущенная проверка тут же видна
 * в кадре. Поэтому проверки собраны в одном месте:
 *
 * 1. **Земля — верх рельефа.** Не сетка оболочки (та висит над рельефом,
 *    медиана 0,65 по замеру автора карты) и не «ярус, ближайший к её оценке»:
 *    у террас он промахивается мимо видимой поверхности, и фигура уходит в
 *    склон на три юнита.
 * 2. **Место свободно.** След ближайшего инстанса: 7625 объектов, круг в 0,45
 *    габарита. Без него страж встаёт внутрь телеги.
 * 3. **Площадка ровная.** Рельеф вокруг точки не поднимается: иначе фигура,
 *    поставленная вплотную к скале, наполовину уходит в неё.
 *
 * Модуль дев-только: он ничего не рисует и вызывается из консоли
 * (`__world.crowd`). Итог его работы — текст для `src/data/world-figures.ts`.
 */

import * as THREE from 'three';

/** Точка стояния: X, Y, Z и поворот к цели. */
export type Spot = readonly [number, number, number, number];

export type CrowdTools = {
  /** Свободна ли точка от инстансов. Возвращает имя мешающего типа. */
  blocking: (x: number, z: number) => string | null;
  /** Годится ли площадка под фигуру: ровная, без стены вплотную. */
  flat: (x: number, z: number, y: number) => boolean;
  /** Сколько сторон вокруг точки открыто и куда смотреть. */
  openness: (x: number, z: number, y: number) => { open: number; facing: number };
  /** Ходовая ли это земля, а не крыша постройки. */
  walkable: (x: number, z: number, y: number) => boolean;
  /** Место рядом с объектом — по кругу радиусом `reach`. */
  spotNear: (x: number, z: number, reach: number) => Spot | null;
  /** Пара мест по разные стороны объекта, на одной высоте. */
  pairAt: (x: number, z: number, reach: number) => [Spot, Spot] | null;
  /** Места всех экземпляров инстанс-меша. */
  places: (name: string) => [number, number][];
  /** Готовый кусок для `world-figures.ts`. */
  emit: (rows: { id: string; clip: string; at: Spot }[]) => string;
};

/**
 * Доля габарита, которую занимает плотный объект: телега, палатка, гроб.
 *
 * Круг тут не годится: телега 0,17 × 0,40, и вписанный круг радиусом 0,09
 * оставляет её половину «свободной» — по ней дозор и проходил насквозь.
 * Поэтому след прямоугольный, по повёрнутому габариту.
 */
const SOLID = 0.75;

/**
 * И доля для высокого и тонкого — дерева, надгробия, столба.
 *
 * У дерева габарит задаёт крона, а мешает ствол: по полному следу дороги под
 * кронами оказались бы закрыты.
 */
const SLIM = 0.35;

/** Выше этого отношения высоты к ширине объект считается стволом, а не телом. */
const SLIM_RATIO = 1.5;

/**
 * Полуширина самой фигуры: её тоже надо учесть, иначе она задевает плечом.
 *
 * 0,02 — половина ширины скелета при росте 0,117. Больше брать нельзя: лента
 * дороги в этой карте шириной 0,05–0,15 юнита, и щедрый запас закрывал бы её
 * целиком у любого придорожного камня.
 */
const FIGURE_HALF = 0.02;

/** Мелочь ниже этого в высоту преградой не считается. */
const MIN_OBSTACLE = 0.06;

/**
 * Насколько рельеф вокруг может подниматься, прежде чем встанет стеной.
 *
 * 0,12 — примерно рост фигуры: стоять вплотную к стене можно, войти в неё
 * нельзя. Строже не выходит: входы в пещеры врезаны в склоны, и при пороге
 * 0,05 из двадцати двух входов проходили два, при 0,08 — один.
 */
const PAD_RISE = 0.12;

/** И насколько проваливаться, прежде чем это обрыв. */
const PAD_DROP = 0.2;

/** На каком отдалении щупается площадка: половина ширины фигуры. */
const PAD_REACH = 0.05;

/** Разброс высот в паре у входа. Больше — и стражи стоят на разных ступенях. */
const PAIR_LEVEL = 0.08;

/** Куда смотреть при поиске места: восемь румбов, крестовые первыми. */
const RHUMBS = [0, 2, 4, 6, 1, 3, 5, 7];

/** На каком отдалении проверяется, открыт ли вид: полтора роста фигуры. */
const LOOK_REACH = 0.18;

/** Сколько румбов из восьми должно быть открыто. Меньше — это ниша. */
const MIN_OPEN = 5;

/** Расхождение верха рельефа и ходовой сетки, после которого это крыша. */
const ROOF_GAP = 0.5;

export type CrowdOptions = {
  scene: THREE.Object3D;
  /** Высота поверхности лучом сверху. Даёт `scene.ts`. */
  surfaceAt: (
    x: number,
    z: number,
    onto?: 'ground' | 'props' | 'road' | 'top',
  ) => number | null;
};

export function createCrowdTools({ scene, surfaceAt }: CrowdOptions): CrowdTools {
  /*
   * Замеры кэшируются: проверка площадки щупает соседей той же точки, соседняя
   * точка щупает её саму, и без кэша один вход в пещеру стоит четыре десятка
   * лучей. С кэшем — единицы.
   */
  const heights = new Map<string, number | null>();
  const topAt = (x: number, z: number): number | null => {
    const key = `${x.toFixed(2)}:${z.toFixed(2)}`;
    if (heights.has(key)) return heights.get(key)!;
    const value = surfaceAt(x, z, 'top');
    heights.set(key, value);
    return value;
  };

  /*
   * След инстансов разложен по клеткам в два юнита: перебирать 7625 объектов
   * на каждую точку — это минуты на одно заселение.
   */
  type Footprint = { x: number; z: number; ex: number; ez: number; kind: string };
  const grid = new Map<string, Footprint[]>();

  scene.traverse((node) => {
    const mesh = node as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) return;

    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const height = box.max.y - box.min.y;
    if (height < MIN_OBSTACLE) return;

    const hx = (box.max.x - box.min.x) / 2;
    const hy = height / 2;
    const hz = (box.max.z - box.min.z) / 2;
    const share = height / Math.max(hx, hz) / 2 > SLIM_RATIO ? SLIM : SOLID;

    const matrices = mesh.instanceMatrix.array;

    for (let i = 0; i < mesh.count; i++) {
      const at = i * 16;
      const x = matrices[at + 12]!;
      const z = matrices[at + 14]!;

      /*
       * Инстансы повёрнуты как попало, поэтому габарит проецируется на землю
       * через саму матрицу: полуразмер по X — это сумма модулей первой строки,
       * умноженных на полуразмеры тела. Получается охватывающий прямоугольник,
       * чуть щедрее самого объекта — и это здесь в плюс.
       */
      const ex =
        Math.abs(matrices[at]!) * hx +
        Math.abs(matrices[at + 4]!) * hy +
        Math.abs(matrices[at + 8]!) * hz;
      const ez =
        Math.abs(matrices[at + 2]!) * hx +
        Math.abs(matrices[at + 6]!) * hy +
        Math.abs(matrices[at + 10]!) * hz;

      const key = `${Math.floor(x / 2)}:${Math.floor(z / 2)}`;
      const list = grid.get(key) ?? [];
      list.push({
        x,
        z,
        ex: ex * share + FIGURE_HALF,
        ez: ez * share + FIGURE_HALF,
        kind: mesh.name,
      });
      grid.set(key, list);
    }
  });

  const blocking = (x: number, z: number): string | null => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = grid.get(`${Math.floor(x / 2) + dx}:${Math.floor(z / 2) + dz}`);
        if (!list) continue;
        for (const item of list) {
          if (Math.abs(x - item.x) < item.ex && Math.abs(z - item.z) < item.ez) {
            return item.kind;
          }
        }
      }
    }
    return null;
  };

  const flat = (x: number, z: number, y: number): boolean => {
    for (const [dx, dz] of [
      [PAD_REACH, 0],
      [-PAD_REACH, 0],
      [0, PAD_REACH],
      [0, -PAD_REACH],
    ]) {
      const height = topAt(x + dx!, z + dz!);
      if (height === null) return false;
      if (height - y > PAD_RISE || y - height > PAD_DROP) return false;
    }
    return true;
  };

  /**
   * Куда смотреть: в сторону, где перед фигурой открыто.
   *
   * Раньше фигура разворачивалась к тому объекту, у которого её поставили, —
   * и утыкалась носом в стену или в частокол. Теперь щупаем восемь румбов и
   * берём самый открытый; заодно считаем, сколько их вообще открыто, чтобы
   * не селить никого в нишу.
   */
  const openness = (
    x: number,
    z: number,
    y: number,
  ): { open: number; facing: number } => {
    let open = 0;
    let facing = 0;
    let bestGap = -Infinity;

    for (let rhumb = 0; rhumb < 8; rhumb++) {
      const angle = (rhumb / 8) * Math.PI * 2;
      const dx = Math.cos(angle) * LOOK_REACH;
      const dz = Math.sin(angle) * LOOK_REACH;
      const height = topAt(x + dx, z + dz);
      // За краем карты — тоже открыто: там небо, а не стена.
      const gap = height === null ? LOOK_REACH : y - height;
      if (gap > -PAD_RISE) open++;
      if (gap > bestGap) {
        bestGap = gap;
        facing = Math.atan2(dx, dz);
      }
    }

    return { open, facing: +facing.toFixed(2) };
  };

  /**
   * Стоит ли точка на ходовой земле, а не на крыше или карнизе.
   *
   * Замки в этой карте — часть рельефа, а не инстансы, поэтому «верх рельефа»
   * у них это шпиль. Сетка оболочки ведёт себя иначе: она сглажена и держится
   * ходовой поверхности. Расхождение больше полуметра значит, что мы забрались
   * на постройку, куда пешком не приходят.
   */
  const walkable = (x: number, z: number, y: number): boolean => {
    const ground = surfaceAt(x, z, 'ground');
    return ground !== null && Math.abs(ground - y) <= ROOF_GAP;
  };

  const round = (value: number) => +value.toFixed(3);

  const spotNear = (cx: number, cz: number, reach: number): Spot | null => {
    for (const rhumb of RHUMBS) {
      const angle = (rhumb / 8) * Math.PI * 2;
      const x = +(cx + Math.cos(angle) * reach).toFixed(2);
      const z = +(cz + Math.sin(angle) * reach).toFixed(2);
      if (blocking(x, z)) continue;

      const y = topAt(x, z);
      // Уровень моря — 0,09: ниже фигура стоит в воде.
      if (y === null || y < 0.12 || !flat(x, z, y)) continue;
      if (!walkable(x, z, y)) continue;

      const view = openness(x, z, y);
      if (view.open < MIN_OPEN) continue;

      return [x, round(y), z, view.facing];
    }
    return null;
  };

  const pairAt = (cx: number, cz: number, reach: number): [Spot, Spot] | null => {
    for (const rhumb of [0, 1, 2, 3]) {
      const angle = (rhumb / 8) * Math.PI * 2;
      const ax = +(cx + Math.cos(angle) * reach).toFixed(2);
      const az = +(cz + Math.sin(angle) * reach).toFixed(2);
      const bx = +(cx - Math.cos(angle) * reach).toFixed(2);
      const bz = +(cz - Math.sin(angle) * reach).toFixed(2);
      if (blocking(ax, az) || blocking(bx, bz)) continue;

      const ay = topAt(ax, az);
      const by = topAt(bx, bz);
      if (ay === null || by === null || ay < 0.12) continue;
      // Пара на разной высоте читается как ошибка расстановки. Порог мягкий:
      // входы врезаны в склоны, и совсем ровных площадок по обе стороны мало.
      if (Math.abs(ay - by) > PAIR_LEVEL) continue;
      if (!flat(ax, az, ay) || !flat(bx, bz, by)) continue;
      if (!walkable(ax, az, ay) || !walkable(bx, bz, by)) continue;

      const viewA = openness(ax, az, ay);
      const viewB = openness(bx, bz, by);
      if (viewA.open < MIN_OPEN || viewB.open < MIN_OPEN) continue;

      return [
        [ax, round(ay), az, viewA.facing],
        [bx, round(by), bz, viewB.facing],
      ];
    }
    return null;
  };

  const places = (name: string): [number, number][] => {
    const mesh = scene.getObjectByName(name) as THREE.InstancedMesh | undefined;
    if (!mesh?.isInstancedMesh) return [];

    const matrices = mesh.instanceMatrix.array;
    const out: [number, number][] = [];
    for (let i = 0; i < mesh.count; i++) {
      out.push([
        +matrices[i * 16 + 12]!.toFixed(2),
        +matrices[i * 16 + 14]!.toFixed(2),
      ]);
    }
    return out;
  };

  const emit = (rows: { id: string; clip: string; at: Spot }[]): string =>
    rows
      .map(({ id, clip, at }) =>
        [
          '  {',
          `    id: '${id.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}',`,
          "    model: 'skeleton_warrior',",
          `    clip: '${clip}',`,
          `    at: [${at[0]}, ${at[1]}, ${at[2]}],`,
          `    turn: ${at[3]},`,
          '    height: 0.117,',
          '  },',
        ].join('\n'),
      )
      .join('\n');

  return { blocking, flat, openness, walkable, spotNear, pairAt, places, emit };
}
