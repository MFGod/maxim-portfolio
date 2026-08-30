/** Риг: единственный владелец камеры. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { CAMERA_BOUNDS, CAMERA_FLOOR } from './bounds';
import {
  easeFlight,
  easeSettle,
  flightDuration,
  pathLengths,
  samplePath,
  type PathKey,
  type Point3,
} from './camera-path';
import { planFlight } from './flight-plan';
import { clampCameraToShell, clampMovementToShell, shellHeightAt } from './map-shell';
import { obstacleHeightAt } from './obstacles';

export type ControlMode = 'orbit' | 'fps';

export type FlightOptions = {
  /** Длительность в миллисекундах. По умолчанию считается от длины пути. */
  durationMs?: number;
  /** Поставить камеру в конец пути сразу: «покой» и повторные заходы. */
  instant?: boolean;
  /** Отдать направление взгляда мыши, оставив ригу только траекторию. */
  freeLook?: boolean;
};

export type CameraRig = {
  controls: OrbitControls;
  /** Идёт ли сейчас пролёт. */
  readonly flying: boolean;
  /** Двигает камеру. Единственное место, где это происходит. */
  update: (delta: number) => void;
  /** Ведёт камеру по опорам. Промис — по завершении или отмене. */
  fly: (keys: PathKey[], options?: FlightOptions) => Promise<void>;
  /** Летит к одной точке от того места, где камера стоит сейчас. */
  flyTo: (key: PathKey, options?: FlightOptions) => Promise<void>;
  /** Прерывает пролёт и мягко возвращает управление. */
  cancel: () => void;
  /** Осмотр с места: камера стоит, вращается только взгляд. */
  setStationLook: (enabled: boolean) => void;
  /** Стоит ли камера в режиме осмотра. */
  readonly stationLook: boolean;
  /** Доворачивает взгляд на месте — для покоя мира (`idle.ts`). */
  nudgeLook: (yaw: number) => void;
  setControlMode: (mode: ControlMode) => void;
  /** Ход не с клавиатуры: экранный стик на сенсорном устройстве. */
  setMove: (x: number, z: number) => void;
  setMoveSpeed: (speed: number) => void;
  /** Преграды: купол над рельефом и нижний предел над водой. */
  setCollisions: (enabled: boolean) => void;
  dispose: () => void;
};

/** Предел наклона орбиты. */
const ORBIT_MAX_POLAR = Math.PI * 0.62;

/** Клавиша движения берётся по `code`: `key` меняется вместе с раскладкой. */
const MOVEMENT_KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/**
 * Скорость хода, юнитов в секунду. В форке было 15 — там мир не обрезан. У нас
 * карта 119.7 x 114.7 и дерево в полюнита: на пятнадцати камера пролетает всё
 * за восемь секунд, рассмотреть на ходу нельзя ничего.
 */
const MOVE_SPEED = 5;

/** Сколько длится доводка после пропуска пролёта. */
const SETTLE_MS = 450;

/** На какую дистанцию отставляется точка взгляда, когда управление возвращается. */
const HANDOVER_DISTANCE = 12;

/** Сколько радиан поворота даёт пиксель движения мыши на свободном взгляде. */
const LOOK_SENSITIVITY = 0.0042;

/** Предел наклона свободного взгляда: у зенита и надира кадр переворачивается. */
const LOOK_PITCH_LIMIT = (78 * Math.PI) / 180;

/** Полоса, в которой предел высоты начинает действовать, а не срабатывает разом. */
const LIMIT_MARGIN = 0.35;

/** Как быстро камера возвращается на план, когда преграда кончилась. */
const RELEASE_RATE = 2.5;

/** За сколько подъём догоняет преграду. */
const LIFT_SETTLE = 0.34;

/** На сколько вперёд по пути камера смотрит на преграду. */
const LOOK_AHEAD_UNITS = 3;

/** Сколько точек смотрим на этом отрезке. */
const LOOK_AHEAD_STEPS = 8;

/** Мягкий предел снизу: выше полосы значение не трогается, ниже — упирается. */
function liftAbove(value: number, limit: number): number {
  const blend = Math.min(Math.max(0.5 + (value - limit) / (2 * LIMIT_MARGIN), 0), 1);

  return limit + (value - limit) * blend + LIMIT_MARGIN * blend * (1 - blend);
}

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  element: HTMLElement,
): CameraRig {
  const controls = new OrbitControls(camera, element);
  controls.enableDamping = true;
  controls.dampingFactor = 0.3;
  controls.minDistance = 0.5;
  controls.maxDistance = 60;
  controls.panSpeed = 1;
  controls.rotateSpeed = 1;
  controls.maxPolarAngle = ORBIT_MAX_POLAR;
  controls.update();

  let fps = false;
  let moveSpeed = MOVE_SPEED;
  let collisions = true;

  const keys = { up: false, down: false, left: false, right: false };
  /** Отклонение экранного стика. Ноль — стик не тронут. */
  const stick = { x: 0, z: 0 };
  const moveDirection = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const desiredVelocity = new THREE.Vector3();
  let smoothing = 0;
  let moving = true;

  type Flight = {
    keys: PathKey[];
    durationMs: number;
    elapsed: number;
    /** Откуда стартовала доводка после пропуска. */
    settleFrom: { position: THREE.Vector3; look: THREE.Vector3 } | null;
    settleElapsed: number;
    freeLook: boolean;
    resolve: () => void;
  };

  /** Свободный взгляд: углы держим сами — контрол на пролёте выключен. */
  let lookYaw = 0;
  let lookPitch = 0;
  let lookTaken = false;
  let dragging = false;
  /** Прошлая точка указателя. */
  const lastPointer = { x: 0, y: 0 };

  /** Осмотр с места: между шагами камера никуда не едет. */
  let stationLook = false;

  let flight: Flight | null = null;
  const scratch = new THREE.Vector3();

  /** Насколько камера сейчас поднята над плановой высотой преградами. */
  let lift = 0;
  let liftSpeed = 0;

  function stopMovement() {
    keys.up = keys.down = keys.left = keys.right = false;
    stick.x = stick.z = 0;
    moveDirection.set(0, 0, 0);
    velocity.set(0, 0, 0);
  }

  /** Возвращает управление контролу. */
  function handOver() {
    const forward = scratch.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const distance = fps ? 0.01 : HANDOVER_DISTANCE;

    controls.target.copy(camera.position).addScaledVector(forward, distance);
    controls.enabled = true;

    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
  }

  /** Ставит точку взгляда по накопленным углам свободного взгляда. */
  function aimByAngles() {
    const cos = Math.cos(lookPitch);
    scratch.set(Math.sin(lookYaw) * cos, Math.sin(lookPitch), Math.cos(lookYaw) * cos);

    controls.target.copy(camera.position).addScaledVector(scratch, HANDOVER_DISTANCE);
    camera.lookAt(controls.target);
  }

  /** Забирает углы из текущего направления камеры — начало свободного взгляда. */
  function takeLook() {
    const forward = scratch.set(0, 0, -1).applyQuaternion(camera.quaternion);
    lookYaw = Math.atan2(forward.x, forward.z);
    lookPitch = Math.asin(Math.min(Math.max(forward.y, -1), 1));
    lookTaken = true;
  }

  function setStationLook(enabled: boolean) {
    stationLook = enabled;
    if (!enabled) {
      handOver();
      return;
    }

    takeLook();
    controls.enabled = false;
    stopMovement();
  }

  function finish() {
    const done = flight;
    const holdLook = done?.freeLook ?? false;
    flight = null;

    if (holdLook) setStationLook(true);
    else handOver();

    done?.resolve();
  }

  function fly(keys: PathKey[], options: FlightOptions = {}): Promise<void> {
    if (keys.length === 0) return Promise.resolve();

    if (flight) {
      const previous = flight;
      flight = null;
      previous.resolve();
    }

    const last = keys.at(-1)!;
    if (options.instant || keys.length === 1) {
      camera.position.set(...last.at);
      controls.target.set(...last.look);
      camera.lookAt(controls.target);
      controls.enabled = true;
      handOver();
      return Promise.resolve();
    }

    controls.enabled = false;
    stopMovement();
    lookTaken = false;
    dragging = false;
    lift = 0;
    liftSpeed = 0;

    return new Promise<void>((resolve) => {
      flight = {
        keys,
        durationMs: options.durationMs ?? flightDuration(keys),
        elapsed: 0,
        settleFrom: null,
        settleElapsed: 0,
        freeLook: options.freeLook ?? false,
        resolve,
      };
    });
  }

  function cancel() {
    if (!flight) return;

    if (!flight.settleFrom) {
      flight.settleFrom = {
        position: camera.position.clone(),
        look: controls.target.clone(),
      };
      flight.settleElapsed = 0;
      return;
    }

    finish();
  }

  function advanceFlight(delta: number) {
    if (!flight) return;

    const target = flight.keys.at(-1)!;

    if (flight.settleFrom) {
      flight.settleElapsed += delta * 1000;
      const t = Math.min(flight.settleElapsed / SETTLE_MS, 1);
      const eased = easeSettle(t);

      camera.position.lerpVectors(
        flight.settleFrom.position,
        scratch.set(...target.at),
        eased,
      );
      controls.target.lerpVectors(
        flight.settleFrom.look,
        scratch.set(...target.look),
        eased,
      );
      camera.lookAt(controls.target);

      if (t >= 1) finish();
      return;
    }

    flight.elapsed += delta * 1000;
    const t = Math.min(flight.elapsed / flight.durationMs, 1);
    const pose = samplePath(flight.keys, easeFlight(t));

    camera.position.set(...pose.position);

    /** Сколько не хватает высоты в точке: пол над водой и купол над рельефом. */
    const shortfall = (point: Point3) => {
      const ceiling = collisions ? shellHeightAt(point[0], point[2]) : null;
      const limit = Math.max(CAMERA_FLOOR, ceiling ?? -Infinity);

      return Math.max(liftAbove(point[1], limit) - point[1], 0);
    };

    const here = shortfall(pose.position);

    const total = pathLengths(flight.keys).total;
    const walked = easeFlight(t);
    const window = total > 0 ? LOOK_AHEAD_UNITS / total : 0;

    let need = here;
    for (let ahead = 1; ahead <= LOOK_AHEAD_STEPS; ahead++) {
      const at = Math.min(walked + (window * ahead) / LOOK_AHEAD_STEPS, 1);
      need = Math.max(need, shortfall(samplePath(flight.keys, at).position));
      if (at >= 1) break;
    }

    if (need < lift) {
      lift = Math.max(need, lift - RELEASE_RATE * delta);
      liftSpeed = 0;
    } else {
      const rate = 2 / LIFT_SETTLE;
      liftSpeed += (rate * rate * (need - lift) - 2 * rate * liftSpeed) * delta;
      lift += liftSpeed * delta;
    }

    if (here > lift) {
      lift = here;
      liftSpeed = 0;
    }

    camera.position.y += lift;

    if (flight.freeLook && lookTaken) {
      aimByAngles();
    } else {
      controls.target.set(...pose.look);
      camera.lookAt(controls.target);
    }

    if (t >= 1) finish();
  }

  function advanceManual(delta: number) {
    if (fps) {
      moveDirection.set(0, 0, 0);
      moveDirection.z += keys.up ? -1 : 0;
      moveDirection.z += keys.down ? 1 : 0;
      moveDirection.x += keys.left ? -1 : 0;
      moveDirection.x += keys.right ? 1 : 0;
      moveDirection.x += stick.x;
      moveDirection.z += stick.z;
      if (moveDirection.length() > 1) moveDirection.normalize();
    }

    desiredVelocity.copy(moveDirection).applyEuler(camera.rotation);
    desiredVelocity.multiplyScalar(delta * moveSpeed);

    if (moving !== (moveDirection.length() === 0)) smoothing = 0;
    smoothing = Math.min(smoothing + delta * 3, 1);
    velocity.lerp(desiredVelocity, smoothing);

    if (collisions) clampMovementToShell(camera, velocity);

    controls.update(delta);
    controls.target.add(velocity);
    camera.position.add(velocity);

    if (collisions) {
      clampCameraToShell(camera, controls.target);
      if (camera.position.y < CAMERA_FLOOR) {
        const lift = CAMERA_FLOOR - camera.position.y;
        camera.position.y += lift;
        controls.target.y += lift;
      }
    }

    moving = moveDirection.length() === 0;
  }

  /** Не пускает камеру за границы карты. */
  function keepInsideBounds(camera: THREE.Camera, target: THREE.Vector3) {
    const x = Math.min(
      Math.max(camera.position.x, CAMERA_BOUNDS.minX),
      CAMERA_BOUNDS.maxX,
    );
    const z = Math.min(
      Math.max(camera.position.z, CAMERA_BOUNDS.minZ),
      CAMERA_BOUNDS.maxZ,
    );
    if (x === camera.position.x && z === camera.position.z) return;

    target.x += x - camera.position.x;
    target.z += z - camera.position.z;
    camera.position.x = x;
    camera.position.z = z;
  }

  function update(delta: number) {
    if (flight) {
      advanceFlight(delta);
    } else if (stationLook) {
      aimByAngles();
    } else {
      advanceManual(delta);
    }

    keepInsideBounds(camera, controls.target);
  }

  /**
   * Экранный стик. Выводит из осмотра ровно так же, как шаг клавишей: раз
   * посетитель пошёл сам, держать его на станции незачем.
   */
  function setMove(x: number, z: number) {
    if (!fps) return;
    if (stationLook && (x !== 0 || z !== 0)) setStationLook(false);
    if (flight && (x !== 0 || z !== 0)) cancel();

    stick.x = Math.min(Math.max(x, -1), 1);
    stick.z = Math.min(Math.max(z, -1), 1);
  }

  function setControlMode(mode: ControlMode) {
    if (stationLook) setStationLook(false);

    fps = mode === 'fps';

    const forward = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize()
      .multiplyScalar(fps ? 0.1 : 20);
    controls.target.subVectors(camera.position, forward);

    controls.enablePan = !fps;
    controls.minDistance = fps ? 0 : 0.5;
    controls.maxDistance = fps ? 0.01 : 60;
    controls.maxPolarAngle = fps ? Math.PI : ORBIT_MAX_POLAR;

    if (!fps) stopMovement();
  }

  const onKey = (event: KeyboardEvent, pressed: boolean) => {
    if (!fps || event.shiftKey) return;
    const key = MOVEMENT_KEYS[event.code];
    if (key) keys[key] = pressed;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (flight) cancel();

    if (stationLook && !event.shiftKey && MOVEMENT_KEYS[event.code]) {
      setStationLook(false);
    }

    onKey(event, true);
  };
  const onKeyUp = (event: KeyboardEvent) => onKey(event, false);

  /**
   * Мышь во время пролёта: на свободном взгляде она правит направлением, иначе
   * читается как просьба прекратить кино.
   */
  const onPointerDown = (event: PointerEvent) => {
    if (!flight && !stationLook) return;

    if (flight && !flight.freeLook) {
      cancel();
      return;
    }

    dragging = true;
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
    if (!lookTaken) takeLook();
    element.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const aiming = stationLook || flight?.freeLook;
    if (!aiming || !dragging) return;

    const deltaX = event.clientX - lastPointer.x;
    const deltaY = event.clientY - lastPointer.y;
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;

    lookYaw -= deltaX * LOOK_SENSITIVITY;
    lookPitch = Math.min(
      Math.max(lookPitch - deltaY * LOOK_SENSITIVITY, -LOOK_PITCH_LIMIT),
      LOOK_PITCH_LIMIT,
    );
  };

  const onPointerUp = (event: PointerEvent) => {
    dragging = false;
    element.releasePointerCapture?.(event.pointerId);
  };

  const onWheel = () => {
    if (flight && !flight.freeLook) cancel();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerUp);
  element.addEventListener('wheel', onWheel, { passive: true });

  /** Всё, что мешает камере в точке: рельеф с оболочкой и стоящие на нём объекты. */
  function ceilingAt(x: number, z: number): number | null {
    const shell = shellHeightAt(x, z);
    const obstacle = obstacleHeightAt(x, z);

    if (shell === null) return obstacle;
    if (obstacle === null) return shell;
    return Math.max(shell, obstacle);
  }

  /** Перелёт от текущего положения к одной точке. */
  function flyTo(key: PathKey, options: FlightOptions = {}): Promise<void> {
    const from: PathKey = {
      at: [camera.position.x, camera.position.y, camera.position.z],
      look: [controls.target.x, controls.target.y, controls.target.z],
    };

    return fly(planFlight(from, key, ceilingAt), options);
  }

  return {
    controls,
    get flying() {
      return flight !== null;
    },
    update,
    fly,
    flyTo,
    setStationLook,
    get stationLook() {
      return stationLook;
    },
    cancel,
    nudgeLook: (yaw: number) => {
      if (!stationLook || flight) return;

      lookYaw += yaw;
    },
    setControlMode,
    setMove,
    setMoveSpeed: (speed: number) => {
      moveSpeed = speed;
    },
    setCollisions: (enabled: boolean) => {
      collisions = enabled;
    },
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('wheel', onWheel);
      controls.dispose();
    },
  };
}
