/**
 * Корпус книги: две неподвижные половины и шов по корешку.
 *
 * Всё, что не двигается при перевороте. Вынесено из сборки, потому что это
 * законченный узел со своей геометрией, своими материалами и своим разбором —
 * а `index.ts` остаётся про состояние, ход переворота и ввод.
 */

import * as THREE from 'three';

import { WORLD_ASSETS } from '../assets';
import { requireAttribute } from './attributes';
import {
  CLOSED_THICKNESS,
  COVER_ATLAS,
  COVER_H,
  COVER_W,
  spinePose,
  type PanelRect,
} from './cover';
import {
  BLOCK_OVERSIZE,
  BLOCK_T,
  BOARD_T,
  COVER_EDGE_COLOR,
  GUTTER_DIP,
  OPEN_TILT,
  PAGE_H,
  PAGE_INSET,
  PAGE_W,
  PAPER_COLOR,
  PAPER_LIFT,
  SEAM_COLOR,
  SEAM_DEPTH,
  SEAM_WIDTH,
  SHEET_INK,
  THREAD_COLOR,
} from './metrics';
import { pageProfile } from './profile';

/** Развёртка обложки: задняя крышка, корешок, передняя — одной картинкой. */
const COVER_TEXTURE = `${WORLD_ASSETS}/book/cover.png`;

/**
 * Анизотропия обложки. Закрытая книга лежит в углу кадра под наклоном, и без
 * неё золото на корешке рассыпается. Три — потолок железа обычно 16, берётся
 * меньшее: `WebGLTextures` зажимает значение сам.
 */
const COVER_ANISOTROPY = 8;

/**
 * Номер группы внешней грани у `BoxGeometry`.
 *
 * Грани идут в порядке `+X, -X, +Y, -Y, +Z, -Z`. Крышки лежат ниже страниц, и
 * наружу — от зрителя раскрытой книги — смотрит именно `-Z`.
 */
const OUTER_FACE = 5;

/**
 * Номера головки и хвоста — верхнего и нижнего торцов блока.
 *
 * Из того же порядка граней: `+Y` и `-Y`. Видно у раскрытой книги в основном
 * хвост — том наклонён от зрителя, — но разворачиваются оба: головка выходит
 * на кадр, стоит посетителю качнуть камеру.
 */
const HEAD_FACE = 2;
const TAIL_FACE = 3;

/** Делений страницы вдоль листа: на провале в 8 % гранёности уже не видно. */
const PAGE_SEGMENTS = 14;

/**
 * Холст дна жёлоба, в пикселях.
 *
 * Узкий и высокий: поперёк корешка рисунок не меняется, и разрешение нужно
 * только вдоль — там идёт пунктир ниток. При шаге стежка в 48 пикселей высота
 * 512 даёт десяток стежков на всю длину корешка, как у сшитого блока.
 */
const SEAM_CANVAS = { width: 32, height: 512 };

/** Нитки на дне жёлоба: длина штриха и промежуток, в пикселях холста. */
const STITCH = { length: 22, gap: 26, width: 5, inset: 12 };

/**
 * Торец бумажного блока: холст и раскладка листов.
 *
 * Широкий и низкий: длинная сторона холста идёт вдоль стопки, там и лежат
 * листы, а поперёк среза бумага почти однородна — хватает шестидесяти четырёх
 * пикселей. Разметка боковых обрезов у коробки совпадает с этим сама: у граней
 * `±X` горизонталь идёт вдоль толщины. Головку и хвост разворачивает
 * `turnFaceUV`.
 *
 * Листов сто восемьдесят: блок в 0.026 юнита при росте страницы 0.28 отвечает
 * бумажному блоку сантиметра в два, а это как раз стопка такого порядка. Дальше
 * дробить бессмысленно — на экране торец занимает десяток пикселей, и лишние
 * линии сольются в мип-уровнях в ровную серость.
 *
 * Каждый двенадцатый лист темнее: у сшитого блока тетради лежат стопками, и на
 * срезе видны их границы. Без них торец читается пластиной с насечкой — а
 * пятнадцать границ тетрадей переживают уменьшение и держат структуру там, где
 * сама насечка уже размылась.
 */
const EDGES = {
  canvas: { width: 512, height: 64 },
  sheets: 180,
  signature: 12,
  /** Зерно шума. Постоянное: см. `noise`. */
  seed: 0x5eed,
  /** Насечка листа: тень штриха, разброс по листам и толщина, в пикселях. */
  sheet: { ink: 0.1, spread: 0.18, width: 1 },
  /** Граница тетради: заметнее и шире одного листа. */
  binding: { ink: 0.5, width: 2 },
  /**
   * Кромки стопки, где торец уходит под переплёт.
   *
   * Там бумага сжата крышкой плотнее, и просветов между листами почти нет:
   * насечка на восьми процентах длины с каждого конца загустевает до тени.
   */
  rim: { span: 0.08, ink: 0.3 },
};

/**
 * Мелкий детерминированный шум.
 *
 * Не `Math.random`: торец рисуется при каждой сборке книги, и случайные линии
 * давали бы разный рисунок на каждой загрузке — сравнивать кадры между собой
 * стало бы нечем. Зерно постоянное, рисунок повторяется.
 */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Насколько гуще насечка на доле `share` пути вдоль стопки.
 *
 * Ноль на всей середине блока и до `EDGES.rim.ink` у самых кромок. Считается
 * отдельно от рисования, потому что это единственная арифметика торца —
 * остальное там вызовы холста.
 */
export function rimShade(share: number): number {
  const toEdge = Math.min(share, 1 - share) / EDGES.rim.span;
  return toEdge >= 1 ? 0 : (1 - toEdge) * EDGES.rim.ink;
}

/** Срез стопки листов: насечка по бумаге и границы тетрадей. */
function edgeTexture(): THREE.CanvasTexture {
  const { width, height } = EDGES.canvas;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('книга: холст торца не дал двумерный контекст');

  context.fillStyle = PAPER_COLOR;
  context.fillRect(0, 0, width, height);

  const random = noise(EDGES.seed);
  const step = width / EDGES.sheets;

  context.fillStyle = SHEET_INK;

  for (let sheet = 0; sheet < EDGES.sheets; sheet++) {
    const share = sheet / (EDGES.sheets - 1);
    const binding = sheet % EDGES.signature === 0;

    // Разброс берётся на каждом листе, включая границы тетрадей: иначе шум
    // сдвигается и рисунок между тетрадями повторяется.
    const scatter = random() * EDGES.sheet.spread;
    const ink = binding ? EDGES.binding.ink : EDGES.sheet.ink + scatter;

    context.globalAlpha = Math.min(ink + rimShade(share), 1);
    context.fillRect(
      sheet * step,
      0,
      binding ? EDGES.binding.width : EDGES.sheet.width,
      height,
    );
  }

  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  /*
   * На торец смотрят с ребра: он вытянут в высоту страницы и шириной в десяток
   * пикселей. Без анизотропии насечка на нём смазывается в ровную заливку —
   * ровно в ту, ради ухода от которой торец и рисуется.
   */
  texture.anisotropy = COVER_ANISOTROPY;
  return texture;
}

/** Половина книги: переплёт, торец бумажного блока и лежащая страница. */
export type Wing = {
  pivot: THREE.Object3D;
  cover: THREE.Mesh;
  stack: THREE.Mesh;
  page: THREE.Mesh;
  /**
   * Материал страницы — отдельной ссылкой, а не чтением из `page.material`.
   *
   * `Mesh.material` типизирован как `Material | Material[]`, и каждая подмена
   * текстуры требовала бы приведения к `MeshStandardMaterial`. Материал делает
   * этот же файл и его тип знает точно.
   */
  pageMaterial: THREE.MeshStandardMaterial;
};

export type Body = {
  left: Wing;
  right: Wing;
  seam: THREE.Mesh;
  /**
   * Части, по которым бьёт луч указателя.
   *
   * Листающегося листа здесь нет намеренно: `Raycaster` проверяет только
   * `layers` и не смотрит `visible`, а лист после переворота остаётся лежать
   * скрытым на левой стопке. Клик по левой половине попадал в него, и книга
   * отказывалась листаться назад.
   */
  targets: THREE.Object3D[];
  /**
   * Относится ли часть к левой половине книги.
   *
   * Спрашивает обработчик указателя: половина решает направление, как в живой
   * книге. Состав половины знает корпус, и перечислять её части на стороне
   * ввода значило бы забыть про новую при первой же правке.
   */
  isLeft: (object: THREE.Object3D) => boolean;
  /**
   * Бумага ли это.
   *
   * Ссылки живут только на странице: у крышки развёртка ведёт в атлас обложки,
   * у стопки — в кромку бумаги, и координаты оттуда указывали бы в текст, до
   * которого посетитель не дотрагивался.
   */
  isPage: (object: THREE.Object3D) => boolean;
  /**
   * Раскладывает корпус по доле раскрытия: половины и корешок.
   *
   * Зовётся из кадра. Ход половин и ход корешка связаны одной величиной, и
   * держать их порознь в сборке значило бы однажды подвинуть одно без другого.
   */
  pose: (raised: number) => void;
  dispose: () => void;
};

/**
 * Углы половин книги при доле раскрытия `raised`, в радианах вокруг корешка.
 *
 * При нуле левая половина лежит на правой лицом вниз — это и есть закрытая
 * книга. В раскрытом виде обе подняты к зрителю на `tilt`: книга стоит пологой
 * дугой, потому что переплёт держит половины домиком. Плашмя лежат только
 * страницы в макете.
 *
 * @param raised доля раскрытия, от 0 до 1
 * @param tilt наклон половины раскрытой книги
 */
export function wingAngles(
  raised: number,
  tilt: number,
): { left: number; right: number } {
  return {
    left: Math.PI * (1 - raised) + tilt * raised,
    right: -tilt * raised,
  };
}

/**
 * Материал страницы: только собственное свечение, без отклика на свет мира.
 *
 * `color` чёрный намеренно — он гасит рассеянную составляющую целиком. Мир
 * залит светом суммарной силы около девяти (`AmbientLight` 1 плюс
 * `HemisphereLight` 7 плюс направленный 1), и обычная бумага в нём выгорала в
 * чистый белый: заданный пергамент до экрана не доживал. Теперь страница
 * показывает ровно то, что нарисовано на холсте, и одинаково во всех регионах.
 *
 * Непрозрачность задана явно, а не оставлена умолчаниям: холст страницы
 * проходит через `clearRect`, и один незакрашенный слот дал бы полупрозрачный
 * лист. С этими значениями альфа текстуры на смешивание не влияет вовсе.
 *
 * Объём странице даёт не свет, а форма: провал бумаги к корешку и торец блока.
 * Экранного затенения у книги нет — она рисуется отдельным проходом уже после
 * `GTAOPass`, иначе затенение считалось бы по геометрии мира перед ней.
 */
export function createPageMaterial(side: THREE.Side): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    roughness: 1,
    metalness: 0,
    side,
    transparent: false,
    opacity: 1,
  });
}

/**
 * Номера вершин одной грани коробки, без повторов.
 *
 * Берутся из групп геометрии, а не из знания о том, в каком порядке three
 * складывает вершины: порядок — деталь реализации, группы — контракт. Один
 * треугольник делит вершины с соседним, поэтому обход идёт через множество:
 * дважды сдвинутая координата уехала бы вдвое.
 */
function faceVertices(geometry: THREE.BufferGeometry, face: number): number[] {
  const index = geometry.getIndex();
  if (!index) throw new Error('книга: коробка пришла без индексов');

  const group = geometry.groups[face];
  if (!group) throw new Error(`книга: у коробки нет грани ${face}`);

  const seen = new Set<number>();
  for (let at = group.start; at < group.start + group.count; at++) {
    seen.add(index.getX(at));
  }

  return [...seen];
}

/**
 * Переносит UV одной грани коробки в её кусок развёртки.
 *
 * У `BoxGeometry` каждая грань размечена от нуля до единицы, поэтому без
 * правки обложка отпечаталась бы целиком на всех шести гранях, включая торцы.
 */
export function mapFaceToPanel(
  geometry: THREE.BufferGeometry,
  face: number,
  rect: PanelRect,
): void {
  const uv = requireAttribute(geometry, 'uv');
  const span = rect.u1 - rect.u0;

  for (const vertex of faceVertices(geometry, face)) {
    uv.setX(vertex, rect.u0 + uv.getX(vertex) * span);
  }

  uv.needsUpdate = true;
}

/**
 * Разворачивает разметку грани на четверть оборота.
 *
 * Насечка торца нарисована вдоль ширины холста, а стопка на разных гранях
 * коробки идёт по разным осям: у боковых обрезов (`±X`) горизонталь разметки
 * лежит вдоль толщины блока, у головки и хвоста (`±Y`) — вдоль ширины
 * страницы. Без разворота листы на них шли бы поперёк стопки — торец читался
 * бы гребёнкой, воткнутой в бумагу не с той стороны.
 *
 * Мена координат местами, а не поворот с переносом: рисунок торца одинаков по
 * всей высоте холста, и куда именно смотрит насечка после мены, неважно.
 */
export function turnFaceUV(geometry: THREE.BufferGeometry, face: number): void {
  const uv = requireAttribute(geometry, 'uv');

  for (const vertex of faceVertices(geometry, face)) {
    const u = uv.getX(vertex);
    uv.setX(vertex, uv.getY(vertex));
    uv.setY(vertex, u);
  }

  uv.needsUpdate = true;
}

/** Тёмное дно жёлоба с пунктиром ниток. */
function seamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SEAM_CANVAS.width;
  canvas.height = SEAM_CANVAS.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('книга: холст шва не дал двумерный контекст');

  context.fillStyle = SEAM_COLOR;
  context.fillRect(0, 0, SEAM_CANVAS.width, SEAM_CANVAS.height);

  context.strokeStyle = THREAD_COLOR;
  context.lineWidth = STITCH.width;
  context.lineCap = 'round';
  context.setLineDash([STITCH.length, STITCH.gap]);
  context.beginPath();
  context.moveTo(SEAM_CANVAS.width / 2, STITCH.inset);
  context.lineTo(SEAM_CANVAS.width / 2, SEAM_CANVAS.height - STITCH.inset);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createBody(root: THREE.Object3D): Body {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  /*
   * Обложка светится сама, как и страницы: мир залит светом суммарной силы
   * около девяти, и освещаемая кожа в нём выцвела бы в серое вместе с золотом.
   * Рисунок уже несёт своё освещение — тени, потёртости и блики впечены в него.
   */
  const coverFace = createPageMaterial(THREE.FrontSide);

  /*
   * Торцы: та же кожа, но без рисунка. Развёртка их не покрывает — у неё три
   * панели, а у коробки шесть граней, — поэтому кромки красятся ровным цветом,
   * снятым с самой картинки.
   */
  const coverEdge = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: COVER_EDGE_COLOR,
    emissiveIntensity: 1,
    roughness: 1,
    metalness: 0,
  });

  /*
   * Торец блока светится сам, как страницы и обложка. Освещаемым он был ровной
   * плашкой: заливка мира силой около девяти выбивала насечку в белый вместе с
   * бумагой, и стопка листов читалась куском картона.
   */
  const paper = createPageMaterial(THREE.FrontSide);
  const paperTexture = edgeTexture();
  paper.emissiveMap = paperTexture;
  textures.push(paperTexture);

  materials.push(coverFace, coverEdge, paper);

  /*
   * Обложка приходит асинхронно, и материал ждёт её с уже занятым слотом
   * карты: шейдерная программа зависит от того, есть карта или нет, а не от
   * того, дошли ли пиксели. Так первый кадр с обложкой не стоит перекомпиляции.
   */
  const coverTexture = new THREE.TextureLoader().load(
    COVER_TEXTURE,
    undefined,
    undefined,
    () => {
      console.error(
        `книга: обложка не загрузилась (${COVER_TEXTURE}) — переплёт останется чёрным`,
      );
    },
  );
  coverTexture.colorSpace = THREE.SRGBColorSpace;
  coverTexture.anisotropy = COVER_ANISOTROPY;
  coverFace.emissiveMap = coverTexture;
  textures.push(coverTexture);

  /** Бумажный блок половины. От корешка отступает на половину шва. */
  const blockGeometry = (sign: 1 | -1) => {
    const width = PAGE_W * BLOCK_OVERSIZE - PAGE_INSET;
    const block = new THREE.BoxGeometry(width, PAGE_H * BLOCK_OVERSIZE, BLOCK_T);
    block.translate(sign * (PAGE_INSET + width / 2), 0, -BLOCK_T / 2);

    // Боковые обрезы разметка коробки устраивает как есть, головку и хвост —
    // нет: у них стопка идёт поперёк насечки.
    turnFaceUV(block, HEAD_FACE);
    turnFaceUV(block, TAIL_FACE);

    return block;
  };

  const coverGeometry = (sign: 1 | -1, panel: PanelRect) => {
    const cover = new THREE.BoxGeometry(COVER_W, COVER_H, BOARD_T);
    cover.translate((sign * PAGE_W) / 2, 0, -BLOCK_T - BOARD_T / 2);
    mapFaceToPanel(cover, OUTER_FACE, panel);
    return cover;
  };

  /**
   * Страница, выгнутая по профилю раскрытой книги.
   *
   * Бумага не доходит до корешка на половину шва: иначе страницы смыкаются
   * вплотную и накрывают шов сверху — развести одни стопки мало.
   */
  const pageGeometry = (sign: 1 | -1) => {
    const width = PAGE_W - PAGE_INSET;
    const plane = new THREE.PlaneGeometry(width, PAGE_H, PAGE_SEGMENTS, 1);
    plane.translate(sign * (PAGE_INSET + width / 2), 0, 0);

    const position = requireAttribute(plane, 'position');
    for (let index = 0; index < position.count; index++) {
      const fromSpine = Math.abs(position.getX(index)) / PAGE_W;
      position.setZ(index, pageProfile(fromSpine, PAPER_LIFT, GUTTER_DIP));
    }
    position.needsUpdate = true;
    plane.computeVertexNormals();

    return plane;
  };

  /**
   * Половины различаются знаком сдвига, а не отрицательным масштабом: `scale.x
   * = -1` вывернул бы порядок обхода треугольников, и страница с материалом
   * `FrontSide` отсеклась бы как обращённая от камеры.
   */
  const makeWing = (sign: 1 | -1, panel: PanelRect): Wing => {
    const pivot = new THREE.Object3D();

    const coverShape = coverGeometry(sign, panel);
    const blockShape = blockGeometry(sign);
    const pageShape = pageGeometry(sign);
    geometries.push(coverShape, blockShape, pageShape);

    const pageMaterial = createPageMaterial(THREE.FrontSide);
    materials.push(pageMaterial);

    // Рисунок только на внешней грани, остальные пять — кромка.
    const cover = new THREE.Mesh(coverShape, [
      coverEdge,
      coverEdge,
      coverEdge,
      coverEdge,
      coverEdge,
      coverFace,
    ]);
    const stack = new THREE.Mesh(blockShape, paper);
    const page = new THREE.Mesh(pageShape, pageMaterial);

    for (const mesh of [cover, stack, page]) mesh.frustumCulled = false;

    pivot.add(cover, stack, page);
    root.add(pivot);
    return { pivot, cover, stack, page, pageMaterial };
  };

  /*
   * Передняя крышка достаётся левой половине, а не правой.
   *
   * У закрытой книги левая половина повёрнута на пол-оборота и лежит поверх
   * правой — наверх смотрит именно её внешняя грань. Правая при этом лежит
   * снизу, и на ней задняя крышка.
   */
  const right = makeWing(1, COVER_ATLAS.back);
  const left = makeWing(-1, COVER_ATLAS.front);

  /*
   * Корешок — отдельный брусок, а не часть крышек: между двумя коробками
   * переплёта пусто, и у закрытой книги там зияла бы щель во всю толщину.
   * Поза считается в `cover.ts`, здесь только применяется.
   */
  const spineShape = new THREE.BoxGeometry(CLOSED_THICKNESS, COVER_H, BOARD_T);
  mapFaceToPanel(spineShape, OUTER_FACE, COVER_ATLAS.spine);
  geometries.push(spineShape);

  const spine = new THREE.Mesh(spineShape, [
    coverEdge,
    coverEdge,
    coverEdge,
    coverEdge,
    coverEdge,
    coverFace,
  ]);
  spine.frustumCulled = false;
  root.add(spine);

  /*
   * Шов по корешку — плоскость, а не брусок: виден только сверху, а объём
   * жёлобу и так дают расступившиеся стопки и провал бумаги. Материал
   * неосвещаемый, иначе заливка мира выбелила бы тень в цвет бумаги.
   */
  const seamShape = new THREE.PlaneGeometry(SEAM_WIDTH, PAGE_H * BLOCK_OVERSIZE);
  seamShape.translate(0, 0, -SEAM_DEPTH);
  geometries.push(seamShape);

  const texture = seamTexture();
  textures.push(texture);

  const seamMaterial = new THREE.MeshBasicMaterial({ map: texture });
  materials.push(seamMaterial);

  const seam = new THREE.Mesh(seamShape, seamMaterial);
  seam.frustumCulled = false;
  root.add(seam);

  const leftParts = new Set<THREE.Object3D>([left.page, left.cover, left.stack]);

  return {
    left,
    right,
    seam,
    targets: [left.page, right.page, left.cover, right.cover, left.stack, right.stack],
    isLeft: (object) => leftParts.has(object),
    isPage: (object) => object === left.page || object === right.page,
    pose: (raised) => {
      const angles = wingAngles(raised, OPEN_TILT);
      left.pivot.rotation.y = angles.left;
      right.pivot.rotation.y = angles.right;

      const stand = spinePose(raised);
      spine.position.set(stand.x, 0, stand.z);
      spine.rotation.y = stand.angle;
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      // Текстуру шва материал не разбирает: `Material.dispose` карты не трогает.
      for (const texture of textures) texture.dispose();
    },
  };
}
