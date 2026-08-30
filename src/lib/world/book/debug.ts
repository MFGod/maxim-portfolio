/** Инструменты разбора книги: заморозка переворота и замер проекций. */

import * as THREE from 'three';

import type { PageHotspot, PageSide } from './draw';

/** Часть книги на экране: доли от 0 до 1 от левого верхнего угла кадра. */
export type BookProbePart = {
  name: 'sheet' | 'left' | 'right' | 'seam';
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type BookProbe = {
  /** Доля переворота, если он идёт или удержан. */
  progress: number | null;
  parts: BookProbePart[];
};

export type BookDebug = {
  /** Замереть переворот на доле от 0 до 1. `null` — отпустить. */
  freeze: (progress: number | null) => void;
  /** Мишени ссылок на раскрытых страницах, в пикселях холста. */
  links: () => Record<PageSide, readonly PageHotspot[]>;
  /** Проекции частей книги на экран. `null`, пока камера не известна. */
  probe: () => BookProbe | null;
  dispose: () => void;
};

/** Что книга даёт инструментам: только чтение и одна ручка удержания. */
export type DebugHost = {
  hold: (progress: number | null) => void;
  isOpen: () => boolean;
  /** Доля переворота: удержанная или текущая. */
  progress: () => number | null;
  /** Камера последнего кадра. */
  camera: () => THREE.Camera | null;
  /** Меши для замера. Скрытые пропускаются. */
  parts: () => Array<{ name: BookProbePart['name']; mesh: THREE.Mesh }>;
  /** Мишени ссылок текущего разворота. */
  links: () => Record<PageSide, readonly PageHotspot[]>;
};

/** Шаг покадрового листания. Пятьдесят кадров на переворот. */
const STEP = 0.02;

const point = new THREE.Vector3();

/** Меш со скиннингом — или `null`, если кости к нему не привязаны. */
function asSkinned(mesh: THREE.Mesh): THREE.SkinnedMesh | null {
  return 'isSkinnedMesh' in mesh ? (mesh as THREE.SkinnedMesh) : null;
}

/** Прямоугольник меша на экране, в долях кадра. */
function measure(
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  name: BookProbePart['name'],
): BookProbePart | null {
  const attribute = mesh.geometry.attributes.position;
  if (!attribute) return null;

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  const skinned = asSkinned(mesh);

  for (let index = 0; index < attribute.count; index++) {
    if (skinned) {
      skinned.getVertexPosition(index, point);
      mesh.localToWorld(point);
    } else {
      point.fromBufferAttribute(attribute, index).applyMatrix4(mesh.matrixWorld);
    }

    point.project(camera);
    const x = point.x * 0.5 + 0.5;
    const y = 0.5 - point.y * 0.5;

    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }

  return { name, left, right, top, bottom };
}

export function createBookDebug(host: DebugHost): BookDebug {
  /** Клавиши: `[` и `]` шагают по перевороту, `\` отпускает. */
  const onKey = (event: KeyboardEvent) => {
    if (!host.isOpen()) return;

    const at = host.progress() ?? 0;

    if (event.key === '[') host.hold(at - STEP);
    else if (event.key === ']') host.hold(at + STEP);
    else if (event.key === '\\') host.hold(null);
    else return;

    event.preventDefault();

    const now = host.progress();
    console.info(now === null ? 'книга: отпущена' : `книга: доля ${now.toFixed(2)}`);
  };

  window.addEventListener('keydown', onKey);

  return {
    freeze: host.hold,
    links: host.links,
    probe: () => {
      const camera = host.camera();
      if (!camera) return null;

      const parts = host
        .parts()
        .map(({ name, mesh }) => (mesh.visible ? measure(mesh, camera, name) : null))
        .filter((part): part is BookProbePart => part !== null);

      return { progress: host.progress(), parts };
    },
    dispose: () => window.removeEventListener('keydown', onKey),
  };
}
