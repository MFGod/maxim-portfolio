/**
 * Закладка подсказок: картонка, заложенная между страниц и торчащая вверх.
 *
 * Отдельным узлом, а не частью корпуса: у корпуса всё держится на симметрии
 * половин, а закладка одна и живёт по своим правилам. Смешивать её с `body.ts`
 * значило бы завести там ветку «а эта деталь только справа».
 *
 * Крепится к шарниру половины, а не к корню книги: половина при раскрытии
 * поворачивается вокруг корешка, и закладка обязана ехать вместе с ней.
 *
 * Выходит за габарит книги по высоте, а не по ширине, — поэтому видна и у
 * закрытого тома, и у раскрытого, и ни на одном из них не спорит с текстом.
 * У закрытой книги правая половина лежит снизу, и закладка вместе с ней —
 * торчит над головкой из-под крышки, как у настоящего тома с заложенной
 * страницей.
 */

import * as THREE from 'three';

import { createPageMaterial } from './body';
import {
  BLOCK_OVERSIZE,
  PAGE_H,
  PAGE_W,
  PAPER_LIFT,
  SHEET_CLEARANCE,
  TAB,
  TAB_COLOR,
  TAB_INK,
} from './metrics';

/**
 * Холст знака. Квадратный и мелкий: на экране закладка занимает несколько
 * десятков пикселей, и разрешение выше здесь пропадает в мип-уровнях.
 */
const SIGN_CANVAS = 64;

/** Знак на закладке. Вопрос — единственное, что читается в этом размере. */
const SIGN = '?';

/**
 * Номер лицевой грани у `BoxGeometry` — `+Z`.
 *
 * Грани идут `+X, -X, +Y, -Y, +Z, -Z`. Закладка лежит в плоскости страницы, и
 * к зрителю раскрытой книги смотрит `+Z` — в отличие от крышек переплёта,
 * которые лежат ниже бумаги и показывают наружу `-Z`.
 */
const FACE = 4;

/**
 * Положение закладки в тех же величинах, что и в `metrics.ts`.
 *
 * Ими её и подбирают: панель в углу мира шагает по этим трём числам, а
 * подошедшие переносят в `TAB` руками. Хранить подобранное самим инструментом
 * нельзя — оно должно попасть в исходник, а не в память вкладки.
 */
export type TabPose = {
  /** Доля страницы от корешка. */
  along: number;
  /** Выступ над головкой блока. */
  reach: number;
  /** Наклон в плоскости страницы, в радианах. */
  tilt: number;
};

export type BookTab = {
  /** Меш закладки. Уходит в цели луча и сравнивается в разборе щелчка. */
  mesh: THREE.Mesh;
  /** Текущее положение. */
  pose: () => TabPose;
  /** Сдвигает закладку на приращения. Инструмент подбора, зовётся из лесов. */
  nudge: (delta: Partial<TabPose>) => TabPose;
  dispose: () => void;
};

/** Кожа закладки со знаком вопроса. */
function signTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIGN_CANVAS;
  canvas.height = SIGN_CANVAS;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('книга: холст закладки не дал двумерный контекст');

  context.fillStyle = TAB_COLOR;
  context.fillRect(0, 0, SIGN_CANVAS, SIGN_CANVAS);

  context.fillStyle = TAB_INK;
  context.font = `600 ${SIGN_CANVAS * 0.72}px Georgia, serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // Базовая линия у знака вопроса выше середины кегля — сдвиг возвращает его
  // в центр язычка, иначе он сидит в верхней трети и читается сбитым.
  context.fillText(SIGN, SIGN_CANVAS / 2, SIGN_CANVAS * 0.54);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Ставит закладку на половину книги.
 *
 * @param wing шарнир половины книги: закладка едет вместе с ней
 * @param sign знак половины: у правой координаты вдоль страницы положительны
 */
export function createTab(wing: THREE.Object3D, sign: 1 | -1): BookTab {
  const geometry = new THREE.BoxGeometry(TAB.width, TAB.height, TAB.thickness);

  /*
   * Головка блока — верхняя граница бумаги. Наружу за неё выходит ровно
   * `reach`, остальное прячется в стопке: закладка, не касающаяся книги,
   * читается не закладкой, а обломком геометрии.
   *
   * По глубине — поверх бумаги и поверх листа в покое. Почему не под ними,
   * хотя вложенной картонке там и место, — в `TAB.lift`.
   */
  const head = (PAGE_H * BLOCK_OVERSIZE) / 2;
  const depth = PAPER_LIFT + SHEET_CLEARANCE + TAB.lift + TAB.thickness / 2;

  /*
   * Положение задаётся мешу, а не впекается в геометрию сдвигом вершин.
   *
   * Разница только одна, и она про подбор: положение закладки искали глазами,
   * а сдвинутые вершины пришлось бы пересобирать на каждый шаг инструмента.
   */
  const pose: TabPose = { along: TAB.along, reach: TAB.reach, tilt: TAB.tilt };

  const texture = signTexture();

  /*
   * Оба материала самосветящиеся, как вся книга: освещаемая охра в мире с
   * заливкой силой около девяти выцвела бы в белёсую полоску. Кожа берёт цвет
   * свечением, лицо — картинкой со знаком.
   */
  const skin = createPageMaterial(THREE.FrontSide);
  skin.emissive = new THREE.Color(TAB_COLOR);

  const face = createPageMaterial(THREE.FrontSide);
  face.emissiveMap = texture;

  // Знак только на лицевой грани, остальные пять — гладкая кожа. Массив
  // собирается по номеру грани, а не выписывается вручную: порядок граней у
  // коробки помнить негде, а промах виден только тем, что знак смотрит в стол.
  const faces = [skin, skin, skin, skin, skin, skin];
  faces[FACE] = face;

  const mesh = new THREE.Mesh(geometry, faces);
  mesh.name = 'book-tab';
  mesh.frustumCulled = false;

  const place = () => {
    mesh.position.set(sign * PAGE_W * pose.along, head + pose.reach - TAB.height / 2, depth);
    // Наклон зеркалится вместе с половиной: на левой странице тот же знак
    // угла кренил бы закладку в другую сторону, чем на правой.
    mesh.rotation.z = sign * pose.tilt;
  };

  place();
  wing.add(mesh);

  return {
    mesh,
    pose: () => ({ ...pose }),
    nudge: (delta) => {
      pose.along += delta.along ?? 0;
      pose.reach += delta.reach ?? 0;
      pose.tilt += delta.tilt ?? 0;
      place();
      return { ...pose };
    },
    dispose: () => {
      geometry.dispose();
      skin.dispose();
      face.dispose();
      texture.dispose();
      mesh.removeFromParent();
    },
  };
}
