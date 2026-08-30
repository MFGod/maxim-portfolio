/** Листающийся лист книги: плоскость на цепочке костей. */

import * as THREE from 'three';

import { requireAttribute } from './attributes';
import { pageProfile } from './profile';
import { BONES, SEGMENTS, flipRotations, pageSkin } from './skin';

export type SheetOptions = {
  /** Ширина листа от корешка к внешнему краю. */
  width: number;
  height: number;
  /** Высота лежащей страницы у внешнего края — та же, что у половин книги. */
  lift: number;
  /** Провал бумаги в жёлоб у корешка — тот же, что у лежащих страниц. */
  dip: number;
  /** Отступ бумаги от корешка — тот же, что у лежащих страниц. */
  inset: number;
  /** Просвет над лежащей бумагой: насколько лист идёт выше страницы под ним. */
  clearance: number;
  /** Наклон половины раскрытой книги. Лист садится на наклонную стопку. */
  tilt: number;
  /** Материалы лица и изнанки. Изнанка получит геометрию с зеркальными UV. */
  front: THREE.Material;
  back: THREE.Material;
};

export type Sheet = {
  /** Узел листа. Добавляется в книгу; корешок в его начале координат. */
  root: THREE.Object3D;
  front: THREE.SkinnedMesh;
  back: THREE.SkinnedMesh;
  /** Раскладывает долю переворота от 0 до 1 по костям. */
  setProgress: (progress: number) => void;
  setVisible: (visible: boolean) => void;
  /** Пересчитывает сферы отсечения по текущей позе. */
  refreshBounds: () => void;
  dispose: () => void;
};

export function createSheet({
  width,
  height,
  lift,
  dip,
  inset,
  clearance,
  tilt,
  front,
  back,
}: SheetOptions): Sheet {
  const root = new THREE.Object3D();

  const paperWidth = width - inset;
  const geometry = new THREE.PlaneGeometry(paperWidth, height, SEGMENTS, 1);
  geometry.translate(inset + paperWidth / 2, 0, 0);

  const placed = requireAttribute(geometry, 'position').array;
  const fromHinge = new Float32Array(placed.length);
  for (let index = 0; index < placed.length; index += 3) {
    fromHinge[index] = (placed[index] ?? 0) - width / 2;
  }
  const skin = pageSkin(fromHinge, width, BONES);
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skin.index, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skin.weight, 4));

  const backGeometry = geometry.clone();
  const backUv = requireAttribute(backGeometry, 'uv');
  for (let index = 0; index < backUv.count; index++) {
    backUv.setX(index, 1 - backUv.getX(index));
  }
  backUv.needsUpdate = true;

  const bones: THREE.Bone[] = [];
  for (let index = 0; index < BONES; index++) {
    const bone = new THREE.Bone();
    if (index === 0) root.add(bone);
    else {
      bone.position.x = width / BONES;
      bones[index - 1]!.add(bone);
    }
    bones.push(bone);
  }

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  const attach = (source: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.SkinnedMesh(source, material);
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton);
    return mesh;
  };

  const frontMesh = attach(geometry, front);
  const backMesh = attach(backGeometry, back);

  /** Кладёт лист по профилю той стопки, на которой он сейчас. */
  function applyProfile(progress: number) {
    const hinge = flipRotations(progress, BONES)[0] ?? 0;

    const lean = Math.cos(hinge);

    for (const target of [geometry, backGeometry]) {
      const position = requireAttribute(target, 'position');

      for (let index = 0; index < position.count; index++) {
        const fromSpine = Math.abs(position.getX(index)) / width;
        position.setZ(index, (pageProfile(fromSpine, lift, dip) + clearance) * lean);
      }

      position.needsUpdate = true;
    }
  }

  applyProfile(0);

  return {
    root,
    front: frontMesh,
    back: backMesh,
    setProgress: (progress) => {
      const angles = flipRotations(progress, BONES);
      for (let index = 0; index < bones.length; index++) {
        bones[index]!.rotation.y = angles[index] ?? 0;
      }

      applyProfile(progress);

      root.rotation.y = tilt * (2 * progress - 1);
    },
    setVisible: (visible) => {
      frontMesh.visible = visible;
      backMesh.visible = visible;
    },
    refreshBounds: () => {
      frontMesh.computeBoundingSphere();
      backMesh.computeBoundingSphere();
    },
    dispose: () => {
      skeleton.dispose();
      geometry.dispose();
      backGeometry.dispose();
    },
  };
}
