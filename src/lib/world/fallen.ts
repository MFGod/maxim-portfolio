/**
 * Опавшая листва: ковёр золота под кронами Эрдтри.
 *
 * Летящие листья (`leaves.ts`) отвечают на вопрос «что происходит», лежащие —
 * «что происходило до вас». Без них дерево сыплет золото в пустоту: под ним
 * та же трава, что и в чистом поле, и листопад читается декорацией поверх
 * мира, а не его частью.
 *
 * Плоскости, а не точки. `THREE.Points` рисует билборд, всегда обращённый к
 * камере: лежащий лист таким способом не изобразить — он встал бы дыбом,
 * стоит посмотреть сверху. Здесь каждый лист — квадрат, положенный на землю и
 * повёрнутый вокруг своей оси.
 *
 * Высота берётся лучом по **настоящей геометрии**, а не по сетке высот.
 *
 * Сетка (`terrainHeightAt`) — растеризация карты по клеткам в четверть юнита,
 * и в клетку пишется наибольшая высота из всех попавших туда треугольников.
 * Её собственный замер честно говорит, чем это кончается: «сетка почти везде
 * выше настоящего рельефа, медиана 0.65». Ковёр, положенный по ней, висел над
 * травой на пять человеческих ростов, а у построек — на крышах и карнизах: в
 * шести пробах разница доходила до 5.8 юнита.
 *
 * Поэтому листва садится на грань: один проход по треугольникам карты кладёт
 * каждый лист туда, где под ним действительно есть поверхность, и заодно
 * отдаёт нормаль этой грани — по ней лист ложится вдоль склона.
 */

import * as THREE from 'three';

import { notTerrain } from './map-shell';

/**
 * Листьев вокруг одной кроны.
 *
 * Вдвое больше прежних трёхсот сорока: лист стал вдвое мельче, и на старом
 * числе под кроной осталась проплешина вместо ковра. Площадь при этом всё
 * равно закрыта слабее — так и задумано, ковёр не должен прятать траву.
 */
const PER_CROWN = 680;

/**
 * Радиус ковра вокруг ствола, юнитов.
 *
 * Заметно меньше разлёта летящих (те уходят на два десятка): ветер уносит
 * золото далеко, но ковёр под деревом набивается там, куда падает основная
 * масса — у самой кроны.
 */
const RADIUS = 5.5;

/**
 * Насколько листва гуще у ствола.
 *
 * Единица дала бы равномерный по площади круг с проплешиной у ствола: при
 * равномерном радиусе точек на внешнем кольце всегда больше. Показатель ниже
 * половины стягивает их к центру.
 */
const CROWD = 0.45;

/**
 * Размер листа, юнитов — вдесятеро мельче летящего.
 *
 * Летящий лист виден на фоне неба, где сравнить его не с чем, и там сходит
 * размер в треть юнита. Лежащий сравнивается с тем, что рядом: фигура
 * человека в этом мире 0.117 юнита, палатка — около 0.4.
 *
 * Уменьшался дважды. Прежние 0.09–0.18 были той же ошибкой, что и треть
 * юнита, только слабее: лист выходил крупнее человека и вблизи читался лодкой
 * на склоне. Половина от них увела его под рост фигуры — но и там вблизи он
 * оставался с ладонь. Ещё половина ставит лист примерно в пятую долю роста:
 * это уже лист, а не предмет обстановки.
 *
 * Плата названа честно: с обзорной высоты ковёр почти не читается — там от
 * него остаётся оттенок травы, а не листва. Видно его теперь с человеческого
 * роста и ближе, то есть оттуда, откуда листья и разглядывают.
 */
const SIZE = { min: 0.0225, max: 0.045 };

/**
 * Подъём над землёй, юнитов.
 *
 * Не украшение, а необходимость: положенный ровно на поверхность лист спорит
 * с ней за глубину и идёт рябью на любом движении камеры. Два сантиметра
 * достаточно, чтобы этого не случилось, и мало, чтобы это увидеть.
 */
const LIFT = 0.02;

/**
 * Косинус предельного уклона: круче лист не лежит.
 *
 * 0.72 — это примерно сорок четыре градуса. Дальше начинаются не склоны, а
 * скалы и обрывы: настоящий лист на них не задерживается, а нарисованный
 * торчит из камня боком, потому что высота у него берётся в одной точке, а
 * тело занимает площадь.
 *
 * Считается по нормали самой грани, на которую лист сел, а не по разностям
 * высот вокруг: у сетки высот разности врали на кромках, где интерполяция
 * между верхом обрыва и дном давала мягкий уклон вместо ступени.
 */
const SLOPE_LIMIT = 0.72;

/** Сторона клетки, которой точки раскладываются для поиска, юнитов. */
const LOOKUP_CELL = 1;

/** Цвет материала воды: своего имени у него нет — см. `waterSurface`. */
const WATER_COLOR = '46d3dd';

export type Fallen = {
  /**
   * Сам ковёр. Отдаётся наружу ради прохода затенения: `GTAOPass` подменяет
   * материал всей сцены своим и не знает про отсечение по альфе, поэтому в
   * карту нормалей попадает целый квадрат листа — см. `scene.ts`.
   */
  object: THREE.Object3D;
  dispose: () => void;
};

/**
 * Строит проверку «есть ли здесь вода».
 *
 * По самому водному мешу, а не по уровню моря: в карте тридцать пять разных
 * высот воды — море на 0.091, озёра Лиурнии на 2.2, горные пруды выше
 * пятнадцати. Отсечь листву по одному числу значило бы застелить озёра.
 *
 * Берётся **самый верхний** слой, накрывающий точку, а не первый попавшийся.
 * Меш воды многослойный: под морем лежит его же чаша на −0.736, и первый
 * найденный треугольник в проверке по морю оказывался как раз ею. Лист над
 * морем сравнивался с дном чаши, выходил «выше воды» и ложился прямо на волну
 * — ковёр расстилался по всей акватории. Замер: 4658 листьев из 10674 лежали
 * на воде.
 *
 * Перебор всех треугольников на точку — 235 проверок, и это дёшево: меш воды
 * маленький, а вызов делается один раз на лист при укладке ковра, не в кадре.
 *
 * @returns высота верхней воды в точке или `null`, если воды там нет
 */
export function waterSurface(
  scene: THREE.Object3D,
): (x: number, z: number) => number | null {
  let mesh: THREE.Mesh | null = null;

  scene.traverse((object) => {
    const candidate = object as THREE.Mesh;
    const material = candidate.material as THREE.MeshStandardMaterial | undefined;
    // Тот же признак, по которому вода находится в замерах: бирюзовый цвет и
    // металличность 0.853 — своего имени у материала нет.
    if (material?.color?.getHexString() === '46d3dd') mesh = candidate;
  });

  if (!mesh) return () => null;

  const found: THREE.Mesh = mesh;
  const position = found.geometry.attributes.position;
  if (!position) return () => null;

  // Вершины переводятся в мир один раз: меш неподвижен, а перевод на каждую
  // проверку стоил бы втрое дороже самой проверки.
  const points: number[] = [];
  const vertex = new THREE.Vector3();

  for (let index = 0; index < position.count; index++) {
    vertex.fromBufferAttribute(position, index);
    found.localToWorld(vertex);
    points.push(vertex.x, vertex.y, vertex.z);
  }

  return (x: number, z: number): number | null => {
    let top: number | null = null;

    for (let base = 0; base + 8 < points.length; base += 9) {
      const ax = points[base]!;
      const az = points[base + 2]!;
      const bx = points[base + 3]!;
      const bz = points[base + 5]!;
      const cx = points[base + 6]!;
      const cz = points[base + 8]!;

      // Барицентрические координаты по горизонтали: попала ли точка в тень
      // треугольника, если смотреть на карту сверху.
      const area = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(area) < 1e-9) continue;

      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / area;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / area;
      const w = 1 - u - v;

      if (u < 0 || v < 0 || w < 0) continue;

      const height =
        u * points[base + 1]! + v * points[base + 4]! + w * points[base + 7]!;
      if (top === null || height > top) top = height;
    }

    return top;
  };
}

/** Что нашлось под точкой: высота грани и её нормаль. */
type Landing = {
  y: number;
  nx: number;
  ny: number;
  nz: number;
};

/**
 * Находит поверхность под каждой точкой одним проходом по карте.
 *
 * Задача обратная привычной: не «луч ищет треугольник», а «треугольник ищет
 * свои точки». Точек тут четырнадцать тысяч, треугольников — шесть миллионов,
 * и лучом по каждому листу это не считается ни за какое разумное время.
 * Поэтому точки заранее разложены по клеткам в юнит, и каждый треугольник
 * заглядывает только в те клетки, что накрывает его собственная тень сверху.
 *
 * Берётся самая **верхняя** грань под точкой: лист падает сверху и ложится на
 * то, до чего долетит, — на землю, на ступень, на крышу.
 *
 * @param root корень сцены
 * @param spots пары `x, z` подряд — места, куда просятся листья
 * @returns по элементу на точку; `null` там, где под точкой ничего нет
 */
function landingsUnder(root: THREE.Object3D, spots: Float32Array): (Landing | null)[] {
  const count = spots.length / 2;
  const found: (Landing | null)[] = new Array(count).fill(null);

  // Точки по клеткам: ключ — целые координаты клетки, значение — их номера.
  const cells = new Map<string, number[]>();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let index = 0; index < count; index++) {
    const x = spots[index * 2]!;
    const z = spots[index * 2 + 1]!;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);

    const key = `${Math.floor(x / LOOKUP_CELL)}|${Math.floor(z / LOOKUP_CELL)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(index);
    else cells.set(key, [index]);
  }

  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;

    /*
     * Те же исключения, что у сетки высот: крона Древа висит на тридцати
     * юнитах, и лист там честно находил под собой поверхность. Вода
     * добавляется сверх того — на волну лист не ложится, и незачем считать её
     * землёй, чтобы потом отсеивать.
     */
    if (notTerrain(mesh)) return;

    const material = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (material?.color?.getHexString() === WATER_COLOR) return;

    const position = mesh.geometry.attributes.position;
    if (!position) return;

    /*
     * Горячий цикл на миллионы треугольников: сырые массивы и ручное умножение
     * на матрицу — тот же приём, что в `buildMapShell`. `Vector3` с его
     * методами стоил там втрое дороже самой работы.
     */
    const points = position.array;
    const index = mesh.geometry.index ? mesh.geometry.index.array : null;
    const triangles = index ? index.length / 3 : position.count / 3;
    const e = mesh.matrixWorld.elements;

    for (let t = 0; t < triangles; t++) {
      const i0 = (index ? index[t * 3]! : t * 3) * 3;
      const i1 = (index ? index[t * 3 + 1]! : t * 3 + 1) * 3;
      const i2 = (index ? index[t * 3 + 2]! : t * 3 + 2) * 3;

      const p0x = points[i0]!;
      const p0y = points[i0 + 1]!;
      const p0z = points[i0 + 2]!;
      const p1x = points[i1]!;
      const p1y = points[i1 + 1]!;
      const p1z = points[i1 + 2]!;
      const p2x = points[i2]!;
      const p2y = points[i2 + 1]!;
      const p2z = points[i2 + 2]!;

      const ax = e[0]! * p0x + e[4]! * p0y + e[8]! * p0z + e[12]!;
      const ay = e[1]! * p0x + e[5]! * p0y + e[9]! * p0z + e[13]!;
      const az = e[2]! * p0x + e[6]! * p0y + e[10]! * p0z + e[14]!;
      const bx = e[0]! * p1x + e[4]! * p1y + e[8]! * p1z + e[12]!;
      const by = e[1]! * p1x + e[5]! * p1y + e[9]! * p1z + e[13]!;
      const bz = e[2]! * p1x + e[6]! * p1y + e[10]! * p1z + e[14]!;
      const cx = e[0]! * p2x + e[4]! * p2y + e[8]! * p2z + e[12]!;
      const cy = e[1]! * p2x + e[5]! * p2y + e[9]! * p2z + e[13]!;
      const cz = e[2]! * p2x + e[6]! * p2y + e[10]! * p2z + e[14]!;

      // Габарит треугольника сверху. Всё, что не задевает облако точек,
      // отбрасывается одним сравнением — это и есть основная экономия.
      const loX = Math.min(ax, bx, cx);
      if (loX > maxX) continue;
      const hiX = Math.max(ax, bx, cx);
      if (hiX < minX) continue;
      const loZ = Math.min(az, bz, cz);
      if (loZ > maxZ) continue;
      const hiZ = Math.max(az, bz, cz);
      if (hiZ < minZ) continue;

      const area = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(area) < 1e-9) continue;

      const fromCol = Math.floor(loX / LOOKUP_CELL);
      const toCol = Math.floor(hiX / LOOKUP_CELL);
      const fromRow = Math.floor(loZ / LOOKUP_CELL);
      const toRow = Math.floor(hiZ / LOOKUP_CELL);

      for (let col = fromCol; col <= toCol; col++) {
        for (let row = fromRow; row <= toRow; row++) {
          const bucket = cells.get(`${col}|${row}`);
          if (!bucket) continue;

          for (const spot of bucket) {
            const x = spots[spot * 2]!;
            const z = spots[spot * 2 + 1]!;

            // Барицентрические координаты по горизонтали: попала ли точка в
            // тень треугольника, если смотреть сверху.
            const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / area;
            const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / area;
            const w = 1 - u - v;
            if (u < 0 || v < 0 || w < 0) continue;

            const y = u * ay + v * by + w * cy;
            const known = found[spot];
            if (known && known.y >= y) continue;

            // Нормаль грани. Знак приводится вверх: у карты попадаются
            // треугольники с обратным обходом, и от них лист вставал бы вниз
            // головой.
            let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
            let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
            let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
            const length = Math.hypot(nx, ny, nz) || 1;
            nx /= length;
            ny /= length;
            nz /= length;
            if (ny < 0) {
              nx = -nx;
              ny = -ny;
              nz = -nz;
            }

            found[spot] = { y, nx, ny, nz };
          }
        }
      }
    }
  });

  return found;
}

/**
 * Стелет листву вокруг крон.
 *
 * @param parent сцена мира
 * @param texture та же текстура листа, что у летящих — иначе на земле окажется
 *   другое дерево
 * @param crowns центры крон в мировых координатах
 * @param root корень сцены: по его геометрии ищется поверхность под листом
 * @param waterAt высота воды в точке; `null` — воды там нет
 */
export function createFallen(
  parent: THREE.Object3D,
  texture: THREE.Texture,
  crowns: THREE.Vector3[],
  root: THREE.Object3D,
  waterAt: (x: number, z: number) => number | null,
): Fallen {
  const geometry = new THREE.PlaneGeometry(1, 1);
  // Плоскость стоит вертикально; кладём её один раз в геометрии, чтобы у
  // каждого экземпляра остался только поворот вокруг своей оси.
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: false,
    /*
     * Прозрачность отсечением, а не смешиванием: тысяча с лишним плоскостей,
     * лежащих на земле, при смешивании требуют сортировки по глубине, и на
     * любом движении камеры порядок меняется рывком.
     */
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0,
    /*
     * Смещение глубины: лист лежит в сотых долях юнита над землёй, и без него
     * на пологом склоне он частью тонет в ней.
     */
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  /*
   * Раскладка детерминированная: одинаковый ковёр при каждой загрузке —
   * единственный способ сравнивать снимки между собой. Тот же генератор, что
   * у летящих листьев и у торца книжного блока.
   */
  let state = 0x1b873593;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const placed: THREE.Matrix4[] = [];

  /*
   * Сперва места, потом поверхность под ними.
   *
   * Порядок важен: поиск идёт одним проходом по всей карте, и делать его на
   * каждый лист по отдельности значило бы шесть миллионов треугольников
   * четырнадцать тысяч раз.
   */
  const spots = new Float32Array(crowns.length * PER_CROWN * 2);

  for (const [crown, index] of crowns.map((one, at) => [one, at] as const)) {
    for (let leaf = 0; leaf < PER_CROWN; leaf++) {
      const angle = next() * Math.PI * 2;
      const radius = RADIUS * Math.pow(next(), CROWD);
      const at = (index * PER_CROWN + leaf) * 2;

      spots[at] = crown.x + Math.cos(angle) * radius;
      spots[at + 1] = crown.z + Math.sin(angle) * radius;
    }
  }

  const landings = landingsUnder(root, spots);

  for (const [index, landing] of landings.entries()) {
    // Под точкой ничего нет: за краем карты и над провалами лежать не на чем.
    if (!landing) continue;

    const x = spots[index * 2]!;
    const z = spots[index * 2 + 1]!;

    /*
     * На воде листва не лежит: там она плавала бы поверх ряби, а под берегом
     * — просвечивала сквозь неё. Сравнение с запасом в пять сантиметров: у
     * самой кромки земля и вода сходятся вплотную, и без него лист садится на
     * урез.
     */
    const water = waterAt(x, z);
    if (water !== null && landing.y <= water + 0.05) continue;

    normal.set(landing.nx, landing.ny, landing.nz);

    // Скалы и обрывы листва не держит.
    if (normal.y < SLOPE_LIMIT) continue;

    // Подъём — по нормали, а не по вертикали: на склоне вертикальный сдвиг
    // уводит лист вдоль поверхности, а не от неё.
    position.set(x, landing.y, z).addScaledVector(normal, LIFT);

    // Сначала уложить по склону, потом повернуть вокруг него: поворот вокруг
    // мировой вертикали после наклона возвращал бы лист к горизонту.
    tilt.setFromUnitVectors(up, normal);
    spin.setFromAxisAngle(normal, next() * Math.PI * 2);
    quaternion.multiplyQuaternions(spin, tilt);

    const size = SIZE.min + next() * (SIZE.max - SIZE.min);
    scale.set(size, size, size);

    placed.push(matrix.clone().compose(position, quaternion, scale));
  }

  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(placed.length, 1));
  mesh.name = 'world-fallen-leaves';
  mesh.count = placed.length;

  for (const [index, transform] of placed.entries()) mesh.setMatrixAt(index, transform);
  mesh.instanceMatrix.needsUpdate = true;

  /*
   * Габарит считается по экземплярам, а не по геометрии.
   *
   * Без этого `three` берёт сферу исходной плоскости — единичный квадрат у
   * начала координат, — и отсекает по ней **весь** ковёр: листва пропадает
   * везде, кроме центра карты. Ошибка тихая: меш есть, экземпляры на местах,
   * в кадре пусто.
   */
  mesh.computeBoundingSphere();

  // Листва лежит на земле и принимает её тень, но своей не отбрасывает: лист
  // толщиной в ноль не может затенить то, на чём лежит.
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  parent.add(mesh);

  return {
    object: mesh,

    dispose: () => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
