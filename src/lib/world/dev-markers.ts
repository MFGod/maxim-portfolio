/** Пометки на инстансах — инструмент подбора, не часть мира. */

import * as THREE from 'three';

export type MarkedInstance = {
  id: number;
  at: [number, number, number];
};

const GROUP = '__dev_marks';

/** Высота столба над меткой, в юнитах мира. */
const STICK = 1.6;

/** Доля высоты экрана, которую занимает цифра. */
const LABEL_SCALE = 0.03;

const FONT = 'bold 40px ui-monospace, monospace';

/**
 * Подпись на прозрачном холсте. Ширина считается по тексту: у фиксированной
 * длинные имена обрезались на середине, и «flexy» превращалось в «flex».
 * @returns текстура и её пропорции — спрайту нужно то же соотношение сторон,
 */
function labelTexture(text: string): { texture: THREE.CanvasTexture; ratio: number } {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;

  context.font = FONT;
  const width = Math.ceil(context.measureText(text).width) + 32;
  canvas.width = width;
  canvas.height = 64;

  context.font = FONT;
  context.fillStyle = 'rgba(8, 10, 20, 0.82)';
  context.beginPath();
  context.roundRect(2, 4, width - 4, 56, 12);
  context.fill();

  context.fillStyle = '#7ef7ff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, ratio: width / 64 };
}

/**
 * Вешает номера на все инстансы вида.
 * @param scene сцена мира
 * @param name имя инстанс-меша: `grace`, `dungeon`, `catacombs`, `evergaol`…
 * @returns список помеченного: номер и координаты
 */
export function markInstances(scene: THREE.Scene, name: string): MarkedInstance[] {
  clearMarks(scene);

  let source: THREE.InstancedMesh | null = null;
  scene.traverse((object) => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh && mesh.name === name) source = mesh;
  });
  if (!source) return [];

  const mesh: THREE.InstancedMesh = source;
  const group = new THREE.Group();
  group.name = GROUP;

  const stickMaterial = new THREE.LineBasicMaterial({
    color: 0x7ef7ff,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
  });

  const matrix = mesh.instanceMatrix.array;
  const marked: MarkedInstance[] = [];

  for (let i = 0; i < mesh.count; i++) {
    const x = matrix[i * 16 + 12]!;
    const y = matrix[i * 16 + 13]!;
    const z = matrix[i * 16 + 14]!;

    const stick = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x, y + STICK, z),
    ]);
    const line = new THREE.Line(stick, stickMaterial);
    line.frustumCulled = false;
    group.add(line);

    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: labelTexture(String(i)).texture,
        depthTest: false,
        transparent: true,
        sizeAttenuation: false,
      }),
    );
    label.position.set(x, y + STICK, z);
    label.scale.set(LABEL_SCALE * 2, LABEL_SCALE, 1);
    label.frustumCulled = false;
    group.add(label);

    marked.push({ id: i, at: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)] });
  }

  scene.add(group);
  return marked;
}

const ROUTE = '__dev_route';

export type RoutePoint = {
  label: string;
  at: readonly [number, number, number];
};

/**
 * Рисует путь камеры: ломаная по точкам, стрелка на каждом отрезке и подпись у
 * каждой остановки.
 */
export function markRoute(
  scene: THREE.Scene,
  points: RoutePoint[],
  options: { color?: number; name?: string } = {},
): number {
  const { color = 0x7ef7ff, name = ROUTE } = options;
  clearRoute(scene, name);
  if (points.length < 2) return 0;

  const group = new THREE.Group();
  group.name = name;

  const vectors = points.map((point) => new THREE.Vector3(...point.at));

  const paint = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });

  const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal');
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(24, vectors.length * 12), 0.16, 6, false),
    paint,
  );
  tube.frustumCulled = false;
  tube.renderOrder = 900;
  group.add(tube);

  const arrows = Math.max(3, vectors.length * 2);
  for (let i = 1; i <= arrows; i++) {
    const t = i / (arrows + 1);
    const at = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);

    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 10), paint);
    cone.position.copy(at);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    cone.frustumCulled = false;
    cone.renderOrder = 901;
    group.add(cone);
  }

  for (const [index, point] of points.entries()) {
    const { texture, ratio } = labelTexture(`${index + 1} ${point.label}`);
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
        transparent: true,
        sizeAttenuation: false,
      }),
    );
    label.position.set(point.at[0], point.at[1] + 1.2, point.at[2]);
    label.scale.set(LABEL_SCALE * ratio, LABEL_SCALE, 1);
    label.frustumCulled = false;
    label.renderOrder = 902;
    group.add(label);
  }

  scene.add(group);
  return points.length;
}

/** Убирает нарисованный путь и освобождает его текстуры. */
export function clearRoute(scene: THREE.Scene, name = ROUTE) {
  const group = scene.getObjectByName(name);
  if (!group) return;

  group.traverse((object) => {
    const sprite = object as THREE.Sprite;
    if (sprite.isSprite) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      return;
    }

    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const item of list) item.dispose();
    }
  });

  scene.remove(group);
}

/** Снимает пометки и освобождает их текстуры. */
export function clearMarks(scene: THREE.Scene) {
  const group = scene.getObjectByName(GROUP);
  if (!group) return;

  group.traverse((object) => {
    const sprite = object as THREE.Sprite;
    if (sprite.isSprite) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
      return;
    }

    const line = object as THREE.Line;
    if (line.isLine) line.geometry.dispose();
  });

  const line = group.children.find((child) => (child as THREE.Line).isLine) as
    THREE.Line | undefined;
  (line?.material as THREE.Material | undefined)?.dispose();

  scene.remove(group);
}
