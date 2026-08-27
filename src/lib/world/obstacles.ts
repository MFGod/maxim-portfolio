/**
 * Карта препятствий: что торчит над рельефом.
 *
 * Оболочка камеры (`map-shell.ts`) снята с рельефа и про инстансы ничего не
 * знает — а это 8968 объектов: деревья, башни, руины, скалы. Замер маршрута
 * показал, что задевает их каждый перелёт, вплоть до прохода сквозь
 * Божественную башню на полтора юнита.
 *
 * Считать пересечения лучом по-настоящему нельзя: один рейкаст по этой карте
 * стоит около ста миллисекунд. Поэтому объекты огрубляются до описанных сфер и
 * растеризуются в сетку высот — тем же приёмом, что и рельеф. Сфера завышает
 * габарит вытянутых объектов, и это здесь в плюс: камера обойдёт крону с
 * запасом, а не впритирку.
 */

import * as THREE from 'three';

import type { WorldBounds } from './bounds';

type ObstacleField = {
  data: Float32Array;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
};

/**
 * Сторона ячейки. Вдвое крупнее, чем у рельефа: препятствия и так огрублены до
 * сфер, и мельчить нет смысла — вчетверо больше памяти ради той же дуги.
 */
const CELL = 0.5;

let field: ObstacleField | null = null;

const cellAt = (cx: number, cz: number): number =>
  !field || cx < 0 || cx >= field.cols || cz < 0 || cz >= field.rows
    ? -Infinity
    : field.data[cz * field.cols + cx]!;

/**
 * Собирает карту по инстансам сцены.
 *
 * @returns сводка замера — её печатает дев-хендл
 */
export function buildObstacleField(scene: THREE.Object3D, bounds: WorldBounds) {
  const started = performance.now();

  const minX = bounds.minX;
  const minZ = bounds.minZ;
  const cols = Math.ceil((bounds.maxX - minX) / CELL) + 1;
  const rows = Math.ceil((bounds.maxZ - minZ) / CELL) + 1;
  const data = new Float32Array(cols * rows).fill(-Infinity);

  let counted = 0;

  scene.traverse((node) => {
    const mesh = node as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) return;

    mesh.geometry.computeBoundingSphere();
    const sphere = mesh.geometry.boundingSphere;
    if (!sphere) return;

    const matrix = mesh.instanceMatrix.array;

    for (let i = 0; i < mesh.count; i++) {
      const at = i * 16;
      // Масштаб берём по первой оси: модели ставятся равномерно.
      const scale = Math.hypot(matrix[at]!, matrix[at + 1]!, matrix[at + 2]!) || 1;
      const radius = sphere.radius * scale;

      const x = matrix[at + 12]! + sphere.center.x * scale;
      const y = matrix[at + 13]! + sphere.center.y * scale;
      const z = matrix[at + 14]! + sphere.center.z * scale;

      const top = y + radius;
      const fromCol = Math.max(0, Math.floor((x - radius - minX) / CELL));
      const toCol = Math.min(cols - 1, Math.ceil((x + radius - minX) / CELL));
      const fromRow = Math.max(0, Math.floor((z - radius - minZ) / CELL));
      const toRow = Math.min(rows - 1, Math.ceil((z + radius - minZ) / CELL));

      for (let r = fromRow; r <= toRow; r++) {
        const row = r * cols;
        for (let c = fromCol; c <= toCol; c++) {
          if (top > data[row + c]!) data[row + c] = top;
        }
      }

      counted++;
    }
  });

  field = { data, cols, rows, minX, minZ };

  return {
    объектов: counted,
    сетка: `${cols} x ${rows}`,
    мс: +(performance.now() - started).toFixed(1),
    памятиМб: +(data.byteLength / 1048576).toFixed(2),
  };
}

/**
 * Верхушка препятствий в точке.
 *
 * Берётся максимум по клетке и её соседям: между узлами сетки объект мог не
 * попасть в центр, и одиночное дерево иначе провалилось бы в щель.
 *
 * @returns высота или `null`, если препятствий здесь нет
 */
export function obstacleHeightAt(x: number, z: number): number | null {
  if (!field) return null;

  const cx = Math.round((x - field.minX) / CELL);
  const cz = Math.round((z - field.minZ) / CELL);

  let top = -Infinity;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const value = cellAt(cx + dx, cz + dz);
      if (value > top) top = value;
    }
  }

  return top === -Infinity ? null : top;
}

/** Освобождает карту: мир закрыт, держать сетку незачем. */
export function clearObstacleField() {
  field = null;
}
