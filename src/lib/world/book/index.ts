/** Книга-резюме: носимый предмет мира. */

import { animate } from 'motion';
import * as THREE from 'three';

import { translator } from '@/lib/i18n';
import type { Locale } from '@/lib/settings/types';

import { drawPage, fontsReady, type PageHotspot, type PageSide } from './draw';
import { createBody, createPageMaterial } from './body';
import { CLOSED_RADIUS } from './cover';
import { createBookDebug, type BookDebug } from './debug';
import { spreadFaces } from './faces';
import { pickAction, type PickTarget } from './input';
import { hotspotAt, openLink } from './links';
import { createPagePool, PAGE_HEIGHT_PX, PAGE_WIDTH_PX, type PagePool } from './pages';
import { guideSpread, spreads, type BookSpread } from './plan';
import { rifflePlan } from './riffle';
import {
  CALM_FACTOR,
  CALM_FLOOR,
  CARRY_SECONDS,
  COVER_HOLD,
  FLIP_SECONDS,
  GUTTER_DIP,
  OPEN_SECONDS,
  OPEN_TILT,
  PAGE_H,
  PAGE_INSET,
  PAGE_W,
  PAPER_LIFT,
  READING,
  SHEET_CLEARANCE,
  READING_SCALE,
  STOWED,
  STOWED_FLATTEN,
  STOWED_MARGIN_BOTTOM,
  STOWED_MARGIN_SIDE,
  STOWED_SCALE,
} from './metrics';
import {
  frameHalf,
  keptInFrame,
  stowedCorner,
  worldPerPixel,
  type FrameHalf,
  type StowedEdges,
} from './placement';
import { createBookPointer } from './pointer';
import { createSheet } from './sheet';
import { spinStep, unwound } from './spin';

export type BookOptions = {
  renderer: THREE.WebGLRenderer;
  /**
   * Канвас мира. Книга сама забирает указатель, когда в неё попали, — режима
   * чтения нет: мышь над книгой листает, мышь над миром вертит камеру.
   */
  canvas: HTMLCanvasElement;
  /** Просьба о покое: переходы становятся мгновенными. */
  reducedMotion?: () => boolean;
  /**
   * Язык хрома книги. Через функцию, как и покой: смена языка не должна
   * пересобирать мир на 27 МБ, а страницы перерисуются сами.
   */
  locale?: () => Locale;
  /** Книгу раскрыли или закрыли. */
  onOpened?: (opened: boolean) => void;
  /** Разворот сменился. */
  onSpread?: (spread: number) => void;
};

export type Book = {
  /** Корень книги. Добавляется в сцену, не в камеру. */
  object: THREE.Object3D;
  open: () => void;
  close: () => void;
  toggle: () => void;
  readonly opened: boolean;
  next: () => void;
  previous: () => void;
  /** Пролистывает книгу до разворота подсказок, раскрывая её при нужде. */
  guide: () => void;
  /** Перерисовывает страницы после смены языка. */
  relabel: () => void;
  /** Индекс текущего разворота. */
  readonly spread: number;
  readonly spreadCount: number;
  /** Идёт ли переворот. */
  readonly turning: boolean;
  /** Двигает книгу. Зовётся из цикла сцены рядом с `rig.update`. */
  update: (camera: THREE.Camera) => void;
  /** Сколько слотов текстур создано. Для замера в приёмке. */
  readonly textureSlots: number;
  /** Строительные леса: заморозка переворота и замер проекций. */
  debug?: BookDebug;
  dispose: () => void;
};

/** Габарит закрытого тома в его собственных осях. */
type ClosedBounds = {
  /** Середина тома по ширине: начало координат книги стоит у корешка. */
  middle: number;
  /** Габарит целиком. По его углам считается силуэт тома на экране. */
  box: THREE.Box3;
};

/** Габарит закрытого тома в его собственных осях. */
function closedBounds(book: THREE.Object3D): ClosedBounds {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const toLocal = new THREE.Matrix4().copy(book.matrixWorld).invert();
  const relative = new THREE.Matrix4();

  book.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.geometry || !mesh.visible) return;

    mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox;
    if (!local) return;

    relative.multiplyMatrices(toLocal, mesh.matrixWorld);
    box.union(part.copy(local).applyMatrix4(relative));
  });

  if (box.isEmpty()) return { middle: 0, box };

  return { middle: (box.min.x + box.max.x) / 2, box };
}

export function createBook({
  renderer,
  canvas,
  reducedMotion,
  locale,
  onOpened,
  onSpread,
}: BookOptions): Book {
  const layout = spreads();
  const pool: PagePool = createPagePool(renderer);

  const object = new THREE.Object3D();
  object.name = 'book';
  object.matrixAutoUpdate = false;

  const body = createBody(object);
  const { left, right, seam } = body;

  const guide = guideSpread(layout);

  const frontMaterial = createPageMaterial(THREE.FrontSide);
  const backMaterial = createPageMaterial(THREE.BackSide);

  for (const material of [frontMaterial, backMaterial]) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 0;
    material.polygonOffsetUnits = -4;
  }

  const sheet = createSheet({
    width: PAGE_W,
    height: PAGE_H,
    lift: PAPER_LIFT,
    dip: GUTTER_DIP,
    inset: PAGE_INSET,
    clearance: SHEET_CLEARANCE,
    tilt: OPEN_TILT,
    front: frontMaterial,
    back: backMaterial,
  });
  object.add(sheet.root);

  /** Доля переноса: книга едет из угла кадра в позу чтения, не раскрываясь. */
  const travel = { carried: 0 };

  /**
   * Доля раскрытия крышек. Её ведёт только `motion`, прямых записей сюда нет —
   * и это обязательное условие, а не стиль. См. `flip` ниже.
   */
  const opening = { raised: 0 };

  /** Доля текущего переворота. Объект создаётся заново на каждый переворот. */
  let flip: { value: number } | null = null;

  let spread = 0;
  let direction: 1 | -1 = 1;
  let turning = false;
  /** Доля, на которой переворот замер по просьбе отладки. */
  let frozen: number | null = null;
  let opened = false;
  let fonts = false;

  const running: { stop: () => void }[] = [];
  const seconds = (value: number) =>
    reducedMotion?.() ? Math.max(value * CALM_FACTOR, CALM_FLOOR) : value;

  const run = <T extends object>(
    subject: T,
    to: Partial<T>,
    duration: number,
    ease: 'easeOut' | 'easeInOut',
    delay = 0,
  ) => {
    const control = animate(subject, to, { duration, ease, delay });
    running.push(control);

    void control.then(() => {
      const index = running.indexOf(control);
      if (index >= 0) running.splice(index, 1);
    });

    return control;
  };

  /** Разворот по индексу с зажимом: за края книги выходить некуда. */
  const spreadAt = (index: number): BookSpread =>
    layout[Math.min(Math.max(index, 0), layout.length - 1)]!;

  /** Нарисованная страница разворота. */
  const facePage = (index: number, side: PageSide) => {
    const page = spreadAt(index);
    const language = locale?.() ?? 'ru';
    const number = index * 2 + (side === 'left' ? 1 : 2);
    return pool.acquire(`${language}:${index}:${side}`, (context) =>
      drawPage(context, { spread: page, side }, number, translator(language)),
    );
  };

  /** Места ссылок на страницах разворота, лежащих перед посетителем. */
  const hotspots: Record<PageSide, readonly PageHotspot[]> = { left: [], right: [] };

  /** Размер холста страницы: по нему координаты текстуры переводятся в пиксели. */
  const PAGE_SIZE = { width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX };

  /** Раскладывает текстуры по четырём видимым сторонам. */
  const assign = () => {
    if (!fonts) return;

    const faces = spreadFaces({ spread, turning, direction });

    const put = (material: THREE.MeshStandardMaterial, texture: THREE.Texture) => {
      if (material.emissiveMap === texture) return;

      const wasEmpty = material.emissiveMap === null;
      material.emissiveMap = texture;
      if (wasEmpty) material.needsUpdate = true;
    };

    const leftPage = facePage(faces.left, 'left');
    const rightPage = facePage(faces.right, 'right');

    put(left.pageMaterial, leftPage.texture);
    put(right.pageMaterial, rightPage.texture);

    hotspots.left = leftPage.hotspots;
    hotspots.right = rightPage.hotspots;

    if (faces.sheetFront === null || faces.sheetBack === null) return;

    put(frontMaterial, facePage(faces.sheetFront, 'right').texture);
    put(backMaterial, facePage(faces.sheetBack, 'left').texture);
  };

  /** Шрифты грузятся один раз, при первом раскрытии. */
  const prepare = () => {
    if (fonts) return;
    void fontsReady().then(() => {
      fonts = true;
      assign();
    });
  };

  /** Пара «перенос + раскрытие» текущего хода. */
  let course: { stop: () => void }[] = [];

  const take = (...controls: { stop: () => void }[]) => {
    for (const control of course) control.stop();
    course = controls;
  };

  /** Распрямление накрученного поворота. */
  let straighten: { share: number } | null = null;

  /** Пускает книгу распрямляться с того поворота, где её оставили. */
  const straightenOut = () => {
    const share = { share: 1 };
    straighten = share;
    unwindFrom.copy(spin);

    const control = run(share, { share: 0 }, seconds(CARRY_SECONDS), 'easeOut');

    void control.then(() => {
      if (straighten !== share) return;
      straighten = null;
      spin.identity();
    });

    return control;
  };

  /** Раскрывает книгу и обещает раскрытие. */
  const open = (): Promise<void> => {
    if (opened) return Promise.resolve();
    opened = true;
    onOpened?.(true);
    prepare();

    const raise = run(
      opening,
      { raised: 1 },
      seconds(OPEN_SECONDS),
      'easeOut',
      seconds(CARRY_SECONDS + COVER_HOLD),
    );

    take(
      run(travel, { carried: 1 }, seconds(CARRY_SECONDS), 'easeOut'),
      straightenOut(),
      raise,
    );

    return raise.then(() => undefined);
  };

  const close = () => {
    if (!opened) return;
    opened = false;
    onOpened?.(false);

    take(
      run(opening, { raised: 0 }, seconds(OPEN_SECONDS), 'easeOut'),
      straightenOut(),
      run(
        travel,
        { carried: 0 },
        seconds(CARRY_SECONDS),
        'easeOut',
        seconds(OPEN_SECONDS),
      ),
    );
  };

  /** Переворачивает один лист и обещает конец перехода. */
  const turn = (next: 1 | -1, duration = FLIP_SECONDS): Promise<void> => {
    if (turning || !opened) return Promise.resolve();

    const target = spread + next;
    if (target < 0 || target >= layout.length) return Promise.resolve();

    direction = next;
    turning = true;

    const progress = { value: next === 1 ? 0 : 1 };
    flip = progress;
    assign();

    return run(
      progress,
      { value: next === 1 ? 1 : 0 },
      seconds(duration),
      'easeInOut',
    ).then(() => {
      if (flip !== progress) return;

      spread = target;
      turning = false;
      flip = null;
      assign();
      onSpread?.(spread);
    });
  };

  /** Идёт ли пролистывание пачкой. */
  let riffling = false;

  /** Пролистывает книгу до нужного разворота. */
  const riffleTo = async (index: number): Promise<void> => {
    if (riffling || turning) return;

    const target = Math.min(Math.max(index, 0), layout.length - 1);
    riffling = true;

    try {
      await open();

      const plan = rifflePlan(Math.abs(target - spread));
      const step: 1 | -1 = target > spread ? 1 : -1;

      while (spread !== target) {
        const from = spread;
        const last = Math.abs(target - spread) === 1;
        await turn(step, last ? plan.settle : plan.pace);

        if (spread === from) break;
      }
    } finally {
      riffling = false;
    }
  };

  const pose = new THREE.Matrix4();
  const to = new THREE.Quaternion().setFromEuler(READING.rotation);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const size = new THREE.Vector3();

  /** Середина закрытого тома в его собственных осях. */
  let closed: ClosedBounds | null = null;

  /** Сдвиг начала координат к середине тома — гаснет по мере переноса. */
  const offset = new THREE.Matrix4();

  /** Поворот убранного тома. Единичный: том лежит в плоскости кадра. */
  const stowed = new THREE.Quaternion();

  /** Поворот, накрученный посетителем поверх позы. */
  const spin = new THREE.Quaternion();

  /** С какого поворота книга распрямляется при раскрытии. */
  const unwindFrom = new THREE.Quaternion();

  /** Угол габарита при замере силуэта. Переиспользуется на все восемь. */
  const corner = new THREE.Vector3();

  /** Кромки силуэта убранного тома, в юнитах на его глубине. */
  const stowedEdges = (
    camera: THREE.PerspectiveCamera,
    frame: FrameHalf,
  ): StowedEdges | null => {
    if (!closed || travel.carried > 0) return null;

    const { min, max } = closed.box;
    let right = -Infinity;
    let bottom = Infinity;

    for (let index = 0; index < 8; index++) {
      corner
        .set(
          index & 1 ? max.x : min.x,
          index & 2 ? max.y : min.y,
          index & 4 ? max.z : min.z,
        )
        .applyMatrix4(pose)
        .applyMatrix4(camera.projectionMatrix);

      right = Math.max(right, corner.x * frame.width);
      bottom = Math.min(bottom, corner.y * frame.height);
    }

    return { right, bottom };
  };

  /** Где книга лежит в углу кадра. Поначалу — там, куда её поставила `STOWED`. */
  const placed = new THREE.Vector3().copy(STOWED.position);

  /** Переставлял ли книгу посетитель. */
  let moved = false;

  /** Камера последнего кадра: по ней стреляют лучом указателя и леса. */
  let aim: THREE.Camera | null = null;

  const update = (camera: THREE.Camera) => {
    aim = camera;

    keepStowedInFrame(camera);

    position.lerpVectors(placed, READING.position, travel.carried);

    rotation.slerpQuaternions(stowed, to, travel.carried);

    const scale = STOWED_SCALE + (READING_SCALE - STOWED_SCALE) * travel.carried;
    size.set(
      scale,
      scale,
      scale * (STOWED_FLATTEN + (1 - STOWED_FLATTEN) * travel.carried),
    );

    if (straighten) spin.copy(unwound(unwindFrom, straighten.share));

    rotation.premultiply(spin);
    pose.compose(position, rotation, size);

    offset.makeTranslation(-(closed?.middle ?? 0) * (1 - travel.carried), 0, 0);
    pose.multiply(offset);

    object.matrix.multiplyMatrices(camera.matrixWorld, pose);

    body.pose(opening.raised);

    if (frozen !== null) {
      sheet.setProgress(frozen);
    } else if (turning && flip) {
      sheet.setProgress(flip.value);
    }

    sheet.setVisible(frozen !== null || turning);

    object.updateMatrixWorld(true);

    if (closed === null && !opened) closed = closedBounds(object);

    if (turning) sheet.refreshBounds();
  };

  /** Камера с перспективой — или `null`, если камера в сцене иная. */
  const lens = (camera: THREE.Camera): THREE.PerspectiveCamera | null =>
    'isPerspectiveCamera' in camera ? (camera as THREE.PerspectiveCamera) : null;

  /** Возвращает убранный том в кадр, если тот в него не помещается. */
  const keepStowedInFrame = (camera: THREE.Camera) => {
    const perspective = lens(camera);
    if (!perspective) return;

    const depth = -placed.z;
    const frame = frameHalf(depth, perspective.fov, perspective.aspect);

    if (!moved) {
      const edges = stowedEdges(perspective, frame);
      if (!edges) return;

      const pixel = worldPerPixel(depth, perspective.fov, canvas.clientHeight);
      const corner = stowedCorner(placed, edges, frame, {
        side: pixel * STOWED_MARGIN_SIDE,
        bottom: pixel * STOWED_MARGIN_BOTTOM,
      });

      placed.set(corner.x, corner.y, placed.z);
      return;
    }

    const inside = keptInFrame(placed, frame, CLOSED_RADIUS);

    placed.set(inside.x, inside.y, placed.z);
  };

  /** Переставляет книгу в плоскости кадра. */
  const shift = (dx: number, dy: number) => {
    const camera = aim && lens(aim);
    const height = canvas.clientHeight;
    if (!camera || height === 0) return;

    const depth = -placed.z;
    const step = worldPerPixel(depth, camera.fov, height);

    moved = true;

    const wanted = { x: placed.x + dx * step, y: placed.y - dy * step };
    const inside = keptInFrame(
      wanted,
      frameHalf(depth, camera.fov, camera.aspect),
      CLOSED_RADIUS,
    );

    placed.set(inside.x, inside.y, placed.z);
  };

  const pointer = createBookPointer({
    canvas,
    camera: () => aim,
    targets: body.targets,
    ready: () => !turning && !riffling,
    draggable: () => !opened && straighten === null,
    drag: (dx, dy, moving) => {
      if (moving) shift(dx, dy);
      else spin.premultiply(spinStep(dx, dy));
    },
    pick: (part, uv) => {
      const target: PickTarget = body.isSeam(part)
        ? 'spine'
        : body.isLeft(part)
          ? 'left'
          : 'right';

      const hotspot =
        uv && body.isPage(part) && target !== 'spine'
          ? hotspotAt(hotspots[target], { u: uv.x, v: uv.y }, PAGE_SIZE)
          : null;

      const action = pickAction(
        { opened, spread, hotspot: hotspot?.kind ?? null },
        target,
      );

      switch (action) {
        case 'open':
          open();
          return;
        case 'close':
          close();
          return;
        case 'forward':
          turn(1);
          return;
        case 'back':
          turn(-1);
          return;
        case 'link':
          if (hotspot?.kind === 'link') openLink(hotspot.href);
          return;
      }
    },
  });

  /** Замереть переворот на доле или отпустить. */
  function hold(progress: number | null) {
    frozen = progress === null ? null : Math.min(Math.max(progress, 0), 1);

    if (frozen === null) {
      turning = false;
      assign();
      return;
    }

    direction = 1;
    turning = true;
    assign();
  }

  const debug =
    process.env.NODE_ENV === 'development'
      ? createBookDebug({
          hold,
          isOpen: () => opened,
          progress: () => frozen ?? (turning && flip ? flip.value : null),
          camera: () => aim,
          parts: () => [
            { name: 'left', mesh: left.page },
            { name: 'right', mesh: right.page },
            { name: 'seam', mesh: seam },
            { name: 'sheet', mesh: sheet.front },
          ],
          links: () => hotspots,
        })
      : undefined;

  return {
    object,
    open,
    close,
    toggle: () => (opened ? close() : open()),
    get opened() {
      return opened;
    },
    next: () => turn(1),
    previous: () => turn(-1),
    guide: () => void riffleTo(guide),
    relabel: assign,
    get spread() {
      return spread;
    },
    get spreadCount() {
      return layout.length;
    },
    get turning() {
      return turning;
    },
    update,
    get textureSlots() {
      return pool.size;
    },
    debug,
    dispose: () => {
      pointer.dispose();
      debug?.dispose();

      for (const control of running) control.stop();
      running.length = 0;

      pool.dispose();
      body.dispose();
      sheet.dispose();
      frontMaterial.dispose();
      backMaterial.dispose();

      object.removeFromParent();
      object.clear();
    },
  };
}
