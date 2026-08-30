/** Кручение книги в руках: из протяжки указателя в поворот. */

import * as THREE from 'three';

/** Сколько пикселей протяжки даёт полный оборот. */
export const SPIN_TURN_PIXELS = 600;

/** Вертикаль экрана: вокруг неё книга вертится при протяжке вбок. */
const SCREEN_UP = new THREE.Vector3(0, 1, 0);

/** Горизонталь экрана: вокруг неё книга кувыркается при протяжке вверх-вниз. */
const SCREEN_RIGHT = new THREE.Vector3(1, 0, 0);

const RADIANS_PER_PIXEL = (Math.PI * 2) / SPIN_TURN_PIXELS;

/**
 * Поворот за один шаг протяжки.
 * @param dx сдвиг указателя вправо, в пикселях
 * @param dy сдвиг указателя вниз, в пикселях
 */
export function spinStep(dx: number, dy: number): THREE.Quaternion {
  const yaw = new THREE.Quaternion().setFromAxisAngle(
    SCREEN_UP,
    dx * RADIANS_PER_PIXEL,
  );
  const tumble = new THREE.Quaternion().setFromAxisAngle(
    SCREEN_RIGHT,
    dy * RADIANS_PER_PIXEL,
  );

  return tumble.multiply(yaw);
}

/** Сколько от накрученного поворота осталось, пока книга распрямляется. */
export function unwound(from: THREE.Quaternion, share: number): THREE.Quaternion {
  const settled = Math.min(Math.max(share, 0), 1);
  return new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), from, settled);
}
