/**
 * Риг: единственный владелец камеры.
 *
 * До него камерой распоряжались трое разом — OrbitControls писал в позицию,
 * цикл сцены двигал её на вектор скорости, оболочка выталкивала вверх. Любая
 * попытка поставить камеру программно откатывалась к следующему кадру, а в
 * режиме «от первого лица» и вовсе схлопывалась в точку взгляда. Планов камеры
 * в такой постановке быть не может.
 *
 * Теперь порядок такой: OrbitControls только **поставляет ввод**, а решает, где
 * окажется камера, риг. На время пролёта контрол выключается целиком, после —
 * получает обратно уже свершившееся положение через `update()`, иначе он
 * вернёт камеру в свои прежние сферические координаты.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { CAMERA_FLOOR } from './bounds';
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
  /**
   * Отдать направление взгляда мыши, оставив ригу только траекторию.
   *
   * Пролёт перестаёт быть роликом: посетитель летит по заданному пути, но
   * смотрит куда хочет — и потому не выключается из происходящего, как это
   * бывает на неотменяемой заставке. Пока мышь не тронули, взглядом правит
   * план; первое же движение передаёт его человеку до конца пролёта.
   */
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
  /**
   * Осмотр с места: камера стоит, вращается только взгляд.
   *
   * Орбита для этого не годится — она вращает камеру вокруг точки впереди, и
   * подобранный ракурс уплывает при первом же движении мыши.
   */
  setStationLook: (enabled: boolean) => void;
  /** Стоит ли камера в режиме осмотра. */
  readonly stationLook: boolean;
  /**
   * Доворачивает взгляд на месте — для покоя мира (`idle.ts`).
   *
   * Через риг, а не поворотом камеры снаружи: камера принадлежит ему одному
   * (D3), и второй хозяин у неё однажды подрался бы с пролётом за тот же кадр.
   * Работает только в осмотре с места и молчит в остальных режимах: у орбиты
   * свой угол, а на пролёте камеру ведут опоры.
   */
  nudgeLook: (yaw: number) => void;
  setControlMode: (mode: ControlMode) => void;
  setMoveSpeed: (speed: number) => void;
  /** Преграды: купол над рельефом и нижний предел над водой. */
  setCollisions: (enabled: boolean) => void;
  dispose: () => void;
};

/**
 * Предел наклона орбиты.
 *
 * В форке было 0.45π — камера всегда выше точки взгляда, чтобы не показывать
 * изнанку дна. Но половина подобранных ракурсов смотрит снизу вверх: у Древа,
 * у благодати Flexy — и там взгляд задран на десяток градусов. При старом
 * лимите контрол, получая управление после пролёта, честно восстанавливал свой
 * инвариант и подбрасывал камеру на четыре юнита вверх от точки прибытия.
 *
 * 0.62π разрешает смотреть примерно на двадцать градусов выше горизонта. Уйти
 * под рельеф это не даёт: там своя преграда — купол.
 */
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

/**
 * Как быстро камера возвращается на план, когда преграда кончилась.
 *
 * Мгновенно нельзя. Замер по перелёту к берегу: камера полсекунды ехала по
 * куполу, обрыв кончился — и она за один кадр падала обратно к плану, разгон
 * доходил до 1607 юнитов в секунду за секунду при обычных пятнадцати.
 */
const RELEASE_RATE = 2.5;

/**
 * За сколько подъём догоняет преграду.
 *
 * Пружиной, а не пределом скорости: предел скорости сам по себе даёт скачок —
 * подъём мгновенно трогается с места на восьми юнитах в секунду, и это те же
 * 529 юнитов в секунду за секунду, только в профиль. Критическое затухание
 * трогается с нуля и без перелёта через цель.
 */
const LIFT_SETTLE = 0.34;

/**
 * На сколько вперёд по пути камера смотрит на преграду.
 *
 * Скала поднималась навстречу по три юнита за кадр, и предел включался тем
 * кадром, которым до неё оставалось полметра: скорость подскакивала вчетверо.
 * Потолок берётся наибольшим из «под собой» и «где буду»: подъём тогда
 * начинается заранее и успевает пройти плавно.
 *
 * Мерится юнитами пути, а не временем: преграда — вещь геометрическая, а
 * скорость по пути гуляет впятеро. На медленном участке та же четверть секунды
 * давала меньше юнита предупреждения — упреждения не хватало ровно там, где
 * оно нужнее всего.
 */
const LOOK_AHEAD_UNITS = 3;

/**
 * Сколько точек смотрим на этом отрезке.
 *
 * Одной конечной не хватает: план к ней уже поднимается, и худшее место
 * остаётся посередине. Замер по перелёту на восток — упреждение обещало 0.06
 * юнита подъёма там, где через три кадра требовалось 0.19. Восемь точек дают
 * шаг чуть меньше полуюнита: провалы там бывают и такой ширины.
 */
const LOOK_AHEAD_STEPS = 8;

/**
 * Мягкий предел снизу: выше полосы значение не трогается, ниже — упирается.
 *
 * Жёсткое `if (y < limit) y = limit` рвёт скорость: кадр камера летела по
 * плану, следующий — ползёт по куполу. Плавный переход стоит долей юнита
 * запаса и не даёт излома. Ниже предела не опускает никогда.
 */
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
  const moveDirection = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const desiredVelocity = new THREE.Vector3();
  let smoothing = 0;
  let moving = true;

  // --- Пролёт ---------------------------------------------------------------

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

  /** Осмотр с места: между шагами камера никуда не едет. */
  let stationLook = false;

  let flight: Flight | null = null;
  const scratch = new THREE.Vector3();

  /** Насколько камера сейчас поднята над плановой высотой преградами. */
  let lift = 0;
  let liftSpeed = 0;

  function stopMovement() {
    keys.up = keys.down = keys.left = keys.right = false;
    moveDirection.set(0, 0, 0);
    velocity.set(0, 0, 0);
  }

  /**
   * Возвращает управление контролу.
   *
   * Точка взгляда отставляется вперёд по направлению камеры: в конце пролёта
   * она может оказаться в сотне юнитов, и орбита вращалась бы вокруг горизонта
   * вместо того, что перед глазами.
   */
  function handOver() {
    const forward = scratch.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const distance = fps ? 0.01 : HANDOVER_DISTANCE;

    controls.target.copy(camera.position).addScaledVector(forward, distance);
    controls.enabled = true;

    /*
     * Сглаживание гасим на один кадр.
     *
     * OrbitControls копит непогашенный поворот и сдвиг, а при включённом
     * демпфировании только уменьшает их на долю за кадр. На передаче управления
     * этот остаток доигрывался поверх прибытия и уводил камеру на четыре юнита
     * вверх от точки, которую подбирали вживую. Один `update()` без
     * демпфирования обнуляет накопленное, дальше плавность возвращается.
     */
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

    // Углы берём из текущего направления: осмотр начинается с того кадра, на
    // котором камера остановилась, а не с произвольного севера.
    takeLook();
    controls.enabled = false;
    stopMovement();
  }

  function finish() {
    const done = flight;
    const holdLook = done?.freeLook ?? false;
    flight = null;

    /*
     * После шага камера остаётся на станции и осматривается, а не отдаётся
     * орбите. Иначе первое же движение мыши уводило бы её с точки, которую
     * подбирали вживую, — а пошаговый режим ровно об этом: стоишь и смотришь.
     */
    if (holdLook) setStationLook(true);
    else handOver();

    done?.resolve();
  }

  function fly(keys: PathKey[], options: FlightOptions = {}): Promise<void> {
    if (keys.length === 0) return Promise.resolve();

    /*
     * Прежний пролёт завершается, а не встаёт в очередь: два плана камеры
     * одновременно — это всегда ошибка вызова, а не замысел.
     *
     * Именно завершается, с вызовом `resolve`. `cancel()` здесь не годится: он
     * начинает мягкую доводку, а её тут же затирает новый пролёт — и обещание
     * старого висит незакрытым, вместе с ним и признак «летим» у вызвавшего.
     */
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
    // Новый пролёт начинается с нуля: подъём прошлого к его преградам и относился.
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

    // Пропуск не телепорт: резкая склейка читается как поломка, а не как «я
    // нажал». Дальше доводим камеру в конец пути за долю секунды.
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

    /*
     * Преграды: пол над водой и купол над рельефом.
     *
     * Пол соблюдается даже в пролёте — план может задеть склон, но нырять под
     * воду камере нельзя нигде и никогда. Купол тоже: замер по входу показывал
     * заход под рельеф на 1.29 юнита, то есть пролёт сквозь скалу.
     *
     * Поднимается только высота, точка взгляда остаётся плановой: план решает,
     * что показать, оболочка — где при этом можно находиться.
     *
     * Подъём держится состоянием и опадает со скоростью `RELEASE_RATE`. Без
     * этого камера возвращалась на план тем же кадром, которым кончалась
     * преграда, — а кончается она резко, обрывом.
     */
    /** Сколько не хватает высоты в точке: пол над водой и купол над рельефом. */
    const shortfall = (point: Point3) => {
      const ceiling = collisions ? shellHeightAt(point[0], point[2]) : null;
      const limit = Math.max(CAMERA_FLOOR, ceiling ?? -Infinity);

      return Math.max(liftAbove(point[1], limit) - point[1], 0);
    };

    const here = shortfall(pose.position);

    /*
     * Заглядываем вперёд — и сравниваем будущую преграду с будущей плановой
     * высотой, а не с нынешней. Иначе камера лезет вверх там, где план и сам
     * успевает подняться: замер после первой попытки дал 529 юнитов в секунду
     * за секунду ровно на таких участках.
     */
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
      // Преграда кончилась — опадаем медленно, обрыв кончается резко.
      lift = Math.max(need, lift - RELEASE_RATE * delta);
      liftSpeed = 0;
    } else {
      // Пружина с критическим затуханием: трогается с нуля, цель не проскакивает.
      const rate = 2 / LIFT_SETTLE;
      liftSpeed += (rate * rate * (need - lift) - 2 * rate * liftSpeed) * delta;
      lift += liftSpeed * delta;
    }

    /*
     * Нижняя граница самого подъёма, а не отдельная проверка поверх него.
     * Проверкой поверх камера ехала по куполу мимо `lift`, а когда обрыв
     * кончался — падала на план тем же кадром: замер давал 1198 юнитов в
     * секунду за секунду. Так подъём остаётся тем, что есть, и опадает сам.
     */
    if (here > lift) {
      lift = here;
      liftSpeed = 0;
    }

    camera.position.y += lift;

    if (flight.freeLook && lookTaken) {
      aimByAngles();
    } else {
      controls.target.set(...pose.look);
      // Поворот на ригe: контрол выключен, и без этого камера летит, не меняя
      // направления взгляда, — путь идёт мимо кадра.
      camera.lookAt(controls.target);
    }

    if (t >= 1) finish();
  }

  // --- Ручное управление ----------------------------------------------------

  function advanceManual(delta: number) {
    if (fps) {
      moveDirection.set(0, 0, 0);
      moveDirection.z += keys.up ? -1 : 0;
      moveDirection.z += keys.down ? 1 : 0;
      moveDirection.x += keys.left ? -1 : 0;
      moveDirection.x += keys.right ? 1 : 0;
      moveDirection.normalize();
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

  function update(delta: number) {
    if (flight) {
      advanceFlight(delta);
      return;
    }

    if (stationLook) {
      // Позиция не меняется: камера стоит там, куда её привёл шаг.
      aimByAngles();
      return;
    }

    advanceManual(delta);
  }

  function setControlMode(mode: ControlMode) {
    // Переключатель камеры — это просьба управлять самому: осмотр уступает.
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
    // В FPS взгляд по горизонту — ровно 90°, лимит орбиты заблокировал бы мышь.
    controls.maxPolarAngle = fps ? Math.PI : ORBIT_MAX_POLAR;

    if (!fps) stopMovement();
  }

  // --- Ввод -----------------------------------------------------------------

  const onKey = (event: KeyboardEvent, pressed: boolean) => {
    if (!fps || event.shiftKey) return;
    const key = MOVEMENT_KEYS[event.code];
    if (key) keys[key] = pressed;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Любая клавиша прерывает пролёт: ждать, пока кино доиграет, никто не обязан.
    if (flight) cancel();

    /*
     * Шаг вперёд ногами выводит из осмотра: раз посетитель пошёл сам, держать
     * его на станции незачем. Возврат на маршрут — кнопками панели.
     */
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
    if (!lookTaken) takeLook();
    element.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    const aiming = stationLook || flight?.freeLook;
    if (!aiming || !dragging) return;

    lookYaw -= event.movementX * LOOK_SENSITIVITY;
    lookPitch = Math.min(
      Math.max(lookPitch - event.movementY * LOOK_SENSITIVITY, -LOOK_PITCH_LIMIT),
      LOOK_PITCH_LIMIT,
    );
  };

  const onPointerUp = (event: PointerEvent) => {
    dragging = false;
    element.releasePointerCapture?.(event.pointerId);
  };

  const onWheel = () => {
    // Колесо на свободном взгляде ничего не значит: дистанции нет, менять
    // нечего — а прерывать пролёт случайной прокруткой обидно.
    if (flight && !flight.freeLook) cancel();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerUp);
  element.addEventListener('wheel', onWheel, { passive: true });

  /**
   * Всё, что мешает камере в точке: рельеф с оболочкой и стоящие на нём объекты.
   *
   * Оболочка знает только рельеф, поэтому деревья и башни спрашиваем отдельно —
   * без этого путь шёл сквозь них.
   */
  function ceilingAt(x: number, z: number): number | null {
    const shell = shellHeightAt(x, z);
    const obstacle = obstacleHeightAt(x, z);

    if (shell === null) return obstacle;
    if (obstacle === null) return shell;
    return Math.max(shell, obstacle);
  }

  /**
   * Перелёт от текущего положения к одной точке.
   *
   * Первая опора — то, где камера уже стоит, поэтому шаг между станциями
   * начинается без рывка, откуда бы посетитель ни смотрел. Путь между ними
   * планируется: прямая почти всегда во что-нибудь упирается.
   */
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
