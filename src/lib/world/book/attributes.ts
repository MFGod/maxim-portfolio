/** Доступ к атрибутам геометрии с честной ошибкой. */

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
