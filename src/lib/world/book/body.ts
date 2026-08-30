/** Корпус книги: две неподвижные половины и шов по корешку. */

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

/** Номер группы внешней грани у `BoxGeometry`. */
const OUTER_FACE = 5;

/** Номера головки и хвоста — верхнего и нижнего торцов блока. */
const HEAD_FACE = 2;
const TAIL_FACE = 3;

/** Делений страницы вдоль листа: на провале в 8 % гранёности уже не видно. */
const PAGE_SEGMENTS = 14;

/** Холст дна жёлоба, в пикселях. */
const SEAM_CANVAS = { width: 32, height: 512 };

/** Нитки на дне жёлоба: длина штриха и промежуток, в пикселях холста. */
const STITCH = { length: 22, gap: 26, width: 5, inset: 12 };

/** Торец бумажного блока: холст и раскладка листов. */
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
  /** Кромки стопки, где торец уходит под переплёт. */
  rim: { span: 0.08, ink: 0.3 },
};

/** Мелкий детерминированный шум. */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Насколько гуще насечка на доле `share` пути вдоль стопки. */
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
  texture.anisotropy = COVER_ANISOTROPY;
  return texture;
}

/** Половина книги: переплёт, торец бумажного блока и лежащая страница. */
export type Wing = {
  pivot: THREE.Object3D;
  cover: THREE.Mesh;
  stack: THREE.Mesh;
  page: THREE.Mesh;
  /** Материал страницы — отдельной ссылкой, а не чтением из `page.material`. */
  pageMaterial: THREE.MeshStandardMaterial;
};

export type Body = {
  left: Wing;
  right: Wing;
  seam: THREE.Mesh;
  /** Части, по которым бьёт луч указателя. */
  targets: THREE.Object3D[];
  /** Относится ли часть к левой половине книги. */
  isLeft: (object: THREE.Object3D) => boolean;
  /** Бумага ли это. */
  isPage: (object: THREE.Object3D) => boolean;
  /** Корешок ли это. */
  isSeam: (object: THREE.Object3D) => boolean;
  /** Раскладывает корпус по доле раскрытия: половины и корешок. */
  pose: (raised: number) => void;
  dispose: () => void;
};

/**
 * Углы половин книги при доле раскрытия `raised`, в радианах вокруг корешка.
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

/** Материал страницы: только собственное свечение, без отклика на свет мира. */
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

/** Номера вершин одной грани коробки, без повторов. */
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

/** Переносит UV одной грани коробки в её кусок развёртки. */
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

/** Разворачивает разметку грани на четверть оборота. */
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

  const coverFace = createPageMaterial(THREE.FrontSide);

  const coverEdge = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: COVER_EDGE_COLOR,
    emissiveIntensity: 1,
    roughness: 1,
    metalness: 0,
  });

  const paper = createPageMaterial(THREE.FrontSide);
  const paperTexture = edgeTexture();
  paper.emissiveMap = paperTexture;
  textures.push(paperTexture);

  materials.push(coverFace, coverEdge, paper);

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

  /** Страница, выгнутая по профилю раскрытой книги. */
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

  const right = makeWing(1, COVER_ATLAS.back);
  const left = makeWing(-1, COVER_ATLAS.front);

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
    targets: [
      left.page,
      right.page,
      left.cover,
      right.cover,
      left.stack,
      right.stack,
      seam,
    ],
    isLeft: (object) => leftParts.has(object),
    isPage: (object) => object === left.page || object === right.page,
    isSeam: (object) => object === seam,
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
      for (const texture of textures) texture.dispose();
    },
  };
}
