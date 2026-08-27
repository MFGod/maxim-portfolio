/**
 * Доступ к атрибутам геометрии с честной ошибкой.
 *
 * `BufferGeometry.attributes` — словарь, и при `noUncheckedIndexedAccess` любое
 * чтение из него даёт `undefined` в типе. Утверждение о непустоте (`!`) убирало
 * тип, но не проблему: геометрия без нужного атрибута валилась бы позже и в
 * другом месте — на `undefined.count` посреди цикла по вершинам. Здесь она
 * падает сразу и говорит, у какой геометрии какого атрибута не хватило.
 *
 * Через `getAttribute`, а не через `attributes` напрямую: официальные типы
 * three прямо велят обращаться к словарю только через него.
 */

import type * as THREE from 'three';

/** Атрибут геометрии. Бросает, если его нет. */
export function requireAttribute(
  geometry: THREE.BufferGeometry,
  name: 'position' | 'uv',
): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  const attribute = geometry.getAttribute(name);
  if (!attribute) {
    throw new Error(`книга: у геометрии «${geometry.type}» нет атрибута «${name}»`);
  }
  return attribute;
}
