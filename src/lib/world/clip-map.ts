/*
 *  Обрезка геометрии карты по границам мира — при загрузке, а не в ассете.
 *
 *  Почему не перезапечь map.glb: за границей лежат два меша на 255 треугольников
 *  из 7 миллионов. Ради них гонять 20 МБ через draco туда-обратно — риск потерять
 *  на перекодировании больше, чем выигрываем. Границы живут в map-bounds.js, режем
 *  на лету за доли миллисекунды и не держим второй бинарник в репозитории.
 *
 *  Отбросить треугольники целиком нельзя: море — несколько гигантских
 *  треугольников с ребром до 3485 юнитов, каждый пересекает границу, и отбор
 *  "выкинуть всё, что торчит" снёс бы море целиком. Поэтому Сазерленд—Ходжман:
 *  многоугольник режется плоскостью, остаток тріангулируется веером.
 */

import * as THREE from 'three';

import type { WorldBounds } from './bounds';

/** Вершина со всеми атрибутами, которые надо интерполировать на срезе. */
type ClipVertex = {
  position: number[];
  normal: number[];
  color: number[];
  color_1: number[];
};

type Edge = { axis: 0 | 2; sign: 1 | -1 };

/** Плоскости заданы в локальных координатах меша: ось и сторона. */
const EDGES: Edge[] = [
  { axis: 0, sign: 1 }, // x >= minX
  { axis: 0, sign: -1 }, // x <= maxX
  { axis: 2, sign: 1 }, // z >= minZ
  { axis: 2, sign: -1 }, // z <= maxZ
];

function limitFor(edge: Edge, bounds: WorldBounds): number {
  if (edge.axis === 0) return edge.sign === 1 ? bounds.minX : bounds.maxX;
  return edge.sign === 1 ? bounds.minZ : bounds.maxZ;
}

/** Знаковое расстояние до плоскости: >= 0 — точка остаётся. */
function distance(vertex: ClipVertex, edge: Edge, limit: number): number {
  return (vertex.position[edge.axis]! - limit) * edge.sign;
}

function lerpVertex(a: ClipVertex, b: ClipVertex, t: number): ClipVertex {
  const out: ClipVertex = { position: [], normal: [], color: [], color_1: [] };
  for (let i = 0; i < 3; i++) {
    out.position[i] = a.position[i]! + (b.position[i]! - a.position[i]!) * t;
    out.normal[i] = a.normal[i]! + (b.normal[i]! - a.normal[i]!) * t;
    out.color_1[i] = a.color_1[i]! + (b.color_1[i]! - a.color_1[i]!) * t;
  }
  for (let i = 0; i < 4; i++) {
    out.color[i] = a.color[i]! + (b.color[i]! - a.color[i]!) * t;
  }
  return out;
}

/** Сазерленд—Ходжман для выпуклого многоугольника против одной плоскости. */
function clipPolygon(polygon: ClipVertex[], edge: Edge, limit: number): ClipVertex[] {
  if (polygon.length === 0) return polygon;

  const result: ClipVertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    const dCurrent = distance(current, edge, limit);
    const dNext = distance(next, edge, limit);

    if (dCurrent >= 0) result.push(current);

    if (dCurrent >= 0 !== dNext >= 0) {
      const t = dCurrent / (dCurrent - dNext);
      result.push(lerpVertex(current, next, t));
    }
  }
  return result;
}

function readVertex(attrs: THREE.NormalBufferAttributes, index: number): ClipVertex {
  const vertex: ClipVertex = { position: [], normal: [], color: [], color_1: [] };
  for (let i = 0; i < 3; i++) {
    vertex.position[i] = attrs.position!.array[index * 3 + i]!;
    vertex.normal[i] = attrs.normal ? attrs.normal.array[index * 3 + i]! : 0;
    vertex.color_1[i] = attrs.color_1 ? attrs.color_1.array[index * 3 + i]! : 0;
  }
  for (let i = 0; i < 4; i++) {
    vertex.color[i] = attrs.color ? attrs.color.array[index * 4 + i]! : 255;
  }
  return vertex;
}

/**
 * Новая геометрия внутри границ, или null — если резать нечего.
 * Границы приходят в мировых координатах и переводятся в локальные меша.
 */
export function clipGeometry(
  mesh: THREE.Mesh,
  bounds: WorldBounds,
): THREE.BufferGeometry | null {
  const geometry = mesh.geometry;
  const attrs = geometry.attributes;
  if (!attrs.position) return null;

  mesh.updateWorldMatrix(true, false);
  const toLocal = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const min = new THREE.Vector3(bounds.minX, 0, bounds.minZ).applyMatrix4(toLocal);
  const max = new THREE.Vector3(bounds.maxX, 0, bounds.maxZ).applyMatrix4(toLocal);
  const local = {
    minX: Math.min(min.x, max.x),
    maxX: Math.max(min.x, max.x),
    minZ: Math.min(min.z, max.z),
    maxZ: Math.max(min.z, max.z),
  };

  const index = geometry.index;
  const triangles = index ? index.count / 3 : attrs.position.count / 3;

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const colors1: number[] = [];
  let changed = false;

  for (let t = 0; t < triangles; t++) {
    const ids = [0, 1, 2].map((k) => (index ? index.array[t * 3 + k]! : t * 3 + k));
    let polygon = ids.map((id) => readVertex(attrs, id));

    for (const edge of EDGES) {
      polygon = clipPolygon(polygon, edge, limitFor(edge, local));
      if (polygon.length === 0) break;
    }

    if (polygon.length !== 3) changed = true;
    if (polygon.length < 3) continue;

    // Веер: выпуклый многоугольник после срезов разбивается от первой вершины.
    for (let k = 1; k < polygon.length - 1; k++) {
      for (const vertex of [polygon[0]!, polygon[k]!, polygon[k + 1]!]) {
        positions.push(...vertex.position);
        normals.push(...vertex.normal);
        colors.push(...vertex.color);
        colors1.push(...vertex.color_1);
      }
    }
  }

  if (!changed) return null;

  const clipped = new THREE.BufferGeometry();
  clipped.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (attrs.normal)
    clipped.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (attrs.color) {
    clipped.setAttribute(
      'color',
      new THREE.Uint8BufferAttribute(
        Uint8Array.from(colors, (v) => Math.round(v)),
        4,
        true,
      ),
    );
  }
  if (attrs.color_1)
    clipped.setAttribute('color_1', new THREE.Float32BufferAttribute(colors1, 3));
  clipped.computeBoundingBox();
  clipped.computeBoundingSphere();
  return clipped;
}

/**
 * Обрезает всё, что торчит за границы. Ищет по габаритам, а не по именам:
 * список мешей карты меняется, правило — нет.
 */
export function clipToBounds(root: THREE.Object3D, bounds: WorldBounds) {
  const report = { checked: 0, clipped: 0, trianglesBefore: 0, trianglesAfter: 0 };
  const world = new THREE.Box3();

  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const object = node as THREE.Mesh;
    if (!object.isMesh || (object as THREE.InstancedMesh).isInstancedMesh) return;
    report.checked++;

    world.setFromObject(object);
    const sticksOut =
      world.min.x < bounds.minX - 0.01 ||
      world.max.x > bounds.maxX + 0.01 ||
      world.min.z < bounds.minZ - 0.01 ||
      world.max.z > bounds.maxZ + 0.01;
    if (!sticksOut) return;

    const before = object.geometry.index
      ? object.geometry.index.count / 3
      : object.geometry.attributes.position!.count / 3;

    const clipped = clipGeometry(object, bounds);
    if (!clipped) return;

    object.geometry.dispose();
    object.geometry = clipped;

    report.clipped++;
    report.trianglesBefore += before;
    report.trianglesAfter += clipped.attributes.position!.count / 3;
  });

  return report;
}
