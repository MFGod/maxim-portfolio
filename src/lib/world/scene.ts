/**
 * Сцена мира. Порт `scene.js` из форка lands-between с четырьмя отличиями,
 * без которых он не может жить в этом проекте:
 */

import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { worldFigures } from '@/data/world-figures';
import { worldBattles } from '@/data/world-battles';
import { worldPatrols } from '@/data/world-patrols';
import type { Locale, ResolvedTheme } from '@/lib/settings/types';

import { TILES, WORLD_ASSETS } from './assets';
import { createBook, type Book } from './book';
import { BOOK_FOV } from './book/metrics';
import { MAP_BOUNDS } from './bounds';
import type { WorldQuality } from './capability';
import { createCameraRig, type CameraRig, type ControlMode } from './camera-rig';
import { clipToBounds } from './clip-map';
import { attachClouds, CLOUD_MODELS, type Clouds } from './clouds';
import type { WorldDevDrafts, WorldDevTools } from './dev-console';
import { createFigures, type Figures } from './figures';
import { DAY, daylightFor, mixDaylight, type Daylight } from './daylight';
import { loadWaves } from './loading';
import { frameDelta } from './frame';
import { driftYaw, idlePhase, type IdlePhase } from './idle';
import { createErdlight } from './erdlight';
import { createFallen, waterSurface, type Fallen } from './fallen';
import { createLeaves, crownsOf, treesOf } from './leaves';
import { createMoon, type Moon } from './moon';
import {
  applySpread,
  buildMapShell,
  buildShellMesh,
  groundField,
  setShellPockets,
  shellHeightAt,
  shellSettings,
} from './map-shell';
import { buildObstacleField, clearObstacleField, obstacleHeightAt } from './obstacles';
import { attachPots, type Pots } from './pots';
import { flightPath, worldPockets } from './shots';
import { createStars } from './stars';
import { attachTornado, type Tornado } from './tornado';
import { createWater } from './water';
import { createWind, isWindy } from './wind';

export type { ControlMode };

/** Вехи загрузки в миллисекундах от создания мира. `null` — веха не пройдена. */
export type WorldTiming = {
  /** Рельеф разобран и стоит в сцене. */
  map: number | null;
  /** Ориентиры на местах: башня, замки, благодати. */
  landmarks: number | null;
  /** Мир отдан наружу — по нему можно идти. */
  ready: number | null;
  /** Приехала и расставлена россыпь: деревья, кусты, утварь. */
  full: number | null;
};

export type WorldOptions = {
  /** Доля загруженного, от 0 до 1. */
  onProgress?: (value: number) => void;
  onLoaded?: () => void;
  /** Постобработка: свечение крон. Выключается на слабых машинах. */
  postProcessing?: boolean;
  /** Уровень отрисовки. `light` снимает тени и сглаживание с первого кадра. */
  quality?: WorldQuality;
  /** Просьба о покое: переходы книги становятся мгновенными. */
  reducedMotion?: () => boolean;
  /** Язык хрома книги. Текст резюме остаётся русским при любом. */
  locale?: () => Locale;
  /** Тема портфолио: под неё идёт свет мира. */
  theme?: () => ResolvedTheme;
  /** Книгу раскрыли или закрыли. */
  onBook?: (opened: boolean) => void;
  /** Книга легла на другой разворот. */
  onSpread?: (spread: number) => void;
  /** Мир ушёл в облёт или вернулся из него. */
  onRest?: (resting: boolean) => void;
  /** Мир не собрался: не приехала геометрия, без которой показывать нечего. */
  onFailed?: (error: unknown) => void;
};

export type World = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: CameraRig['controls'];
  /** Владелец камеры: пролёты, ручное управление, преграды. */
  rig: CameraRig;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  /** Книга-резюме: носимый предмет, а не объект ландшафта. */
  book: Book;
  /** Вехи загрузки: чем занята была каждая секунда до первого кадра. */
  readonly timing: WorldTiming;
  /** Путь по главам: что пройдено и куда вести дальше. */
  /** Перекладывает свет под текущую тему портфолио. */
  relight: () => void;
  setControlMode: (mode: ControlMode) => void;
  /** Скорость хода по WASD, юнитов в секунду. */
  setMoveSpeed: (speed: number) => void;
  /** Показ и подбор невидимого купола. Инструмент, а не часть мира. */
  shell: {
    settings: typeof shellSettings;
    setVisible: (visible: boolean) => void;
    setPadding: (padding: number) => void;
    setSpread: (spread: number) => void;
    /** Высота купола в точке: замер без кадра и без луча. */
    heightAt: (x: number, z: number) => number | null;
    /** Преграды камеры целиком: купол и нижний предел над водой. */
    setCollisions: (enabled: boolean) => void;
  };
  /**
   * Фаза ветра. Ручка на подбор: остановить время и посмотреть кроны в крайнем
   * положении иначе нельзя — качание живёт только в вершинном шейдере.
   */
  wind: { value: number };
  /**
   * Инструменты подбора: пометки, расстановка, заселение, дозоры, стычки,
   * ракурсы. `null`, пока их не подключили, и всегда `null` в прод-сборке.
   */
  readonly dev: WorldDevTools | null;
  /** Подключает инструменты подбора к живому миру. */
  attachDevTools: (make: (context: WorldDevContext) => WorldDevTools) => WorldDevTools;
  /**
   * Прокрутить мир на столько-то секунд кадрами по `stride`. Дев-ручка: без
   * окна `requestAnimationFrame` не поднимается, и сцена стоит на первом кадре.
   */
  step: (seconds: number, stride?: number) => void;
  /**
   * Замереть или продолжить. Замерший мир не рисует и не считает движение, но
   * остаётся в памяти: пересобрать сцену стоит секунды разбора геометрии.
   */
  setRunning: (running: boolean) => void;
  dispose: () => void;
};

/** Внутренности мира, которые нужны инструментам подбора. */
export type WorldDevContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: CameraRig['controls'];
  rig: CameraRig;
  /** Живые фигуры мира: расстановка, дозоры, стычки. */
  figures: Figures;
  /** Один луч на все опросы: его переиспользуют, а не создают на каждый замер. */
  raycaster: THREE.Raycaster;
  /** Наводит луч по доле канваса от 0 до 1. */
  aimAt: (x: number, y: number) => void;
  /** Высота поверхности в точке — лучом сверху по геометрии карты. */
  surfaceAt: (
    x: number,
    z: number,
    onto?: 'ground' | 'props' | 'road' | 'top',
  ) => number | null;
  /** Высота купола в точке: замер без кадра и без луча. */
  shellHeightAt: (x: number, z: number) => number | null;
  /** Текущий отступ купола от рельефа. */
  shellPadding: () => number;
  /** Верхушка препятствия в точке или `null`, если там чисто. */
  obstacleHeightAt: (x: number, z: number) => number | null;
  /** Пересобрать расстановку: данные плюс черновик. */
  refreshFigures: () => Promise<void>;
  /** Пересчитать карманы купола: данные плюс черновик. */
  applyPockets: () => void;
};

/** Откуда пускается луч вниз при расстановке: выше самой высокой горы карты. */
export const DROP_HEIGHT = 40;

/** Кадр фиксированной длительности, как в форке. */
const FRAME_MS = 1000 / 60;

/** Через столько кадров решаем, тянет ли машина тени и полную постобработку. */
const PROBE_FRAMES = 100;

/** Сколько первых кадров проба пропускает. */
const PROBE_WARMUP = 40;

/** Средний кадр дольше этого — машина не тянет, снижаем качество AO. */
const SLOW_FRAME_SECONDS = 0.025;

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  const list = Array.isArray(material) ? material : [material];
  for (const item of list) {
    for (const value of Object.values(item)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    item.dispose();
  }
}

export function createWorld(
  canvas: HTMLCanvasElement,
  options: WorldOptions = {},
): World {
  const {
    onProgress,
    onLoaded,
    postProcessing = true,
    quality = 'full',
    reducedMotion,
    locale,
    theme,
    onBook,
    onSpread,
    onRest,
    onFailed,
  } = options;

  const manager = new THREE.LoadingManager();
  const loader = new GLTFLoader(manager);
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${WORLD_ASSETS}/draco/`);
  draco.preload();
  loader.setDRACOLoader(draco);

  const textureLoader = new THREE.TextureLoader(manager);
  const envmap = textureLoader.load(`${WORLD_ASSETS}/envmap.png`);
  envmap.mapping = THREE.EquirectangularReflectionMapping;
  envmap.colorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const size = () => ({
    width: Math.max(canvas.clientWidth, 1),
    height: Math.max(canvas.clientHeight, 1),
  });

  const camera = new THREE.PerspectiveCamera(
    65,
    size().width / size().height,
    0.1,
    250,
  );
  camera.position.set(5, 22, 22);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    depth: true,
    canvas,
  });
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.setClearColor(0x000000);
  renderer.info.autoReset = false;

  /** Потолок площади кадра в пикселях. */
  const PIXEL_BUDGET = quality === 'full' ? 2_400_000 : 1_300_000;

  /** Потолок множителя и площади, пока раскрыт разворот книги. */
  const READING_RATIO = 2;
  const READING_BUDGET = PIXEL_BUDGET * 2;

  /** Раскрыт ли разворот. Держит плотность кадра, больше ни на что не влияет. */
  let reading = false;

  const applySize = () => {
    const { width, height } = size();
    const dense = reading && quality === 'full';
    const budget = Math.sqrt(
      (dense ? READING_BUDGET : PIXEL_BUDGET) / (width * height),
    );
    const ceiling = dense ? READING_RATIO : 1.5;
    const ratio = Math.max(Math.min(window.devicePixelRatio, ceiling, budget), 1);

    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);

    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    bookCamera.aspect = width / height;
    bookCamera.updateProjectionMatrix();
  };

  const waterMaterial = new THREE.MeshStandardMaterial();
  const minorErdtree = new THREE.MeshStandardMaterial();
  const fire = new THREE.MeshStandardMaterial();
  const grace = new THREE.MeshStandardMaterial();

  const water = createWater();
  water.apply(waterMaterial, envmap);

  minorErdtree.color = new THREE.Color(0xfffeb6);
  minorErdtree.emissive = new THREE.Color(0xffa51d);
  minorErdtree.emissiveIntensity = 0.8;

  fire.color = new THREE.Color(0x170a02);
  fire.emissive = new THREE.Color(0xff813b);
  fire.emissiveIntensity = 4;

  grace.color = new THREE.Color(0xfad57b);
  grace.emissive = new THREE.Color(0xe7b962);
  grace.emissiveIntensity = 2;

  const ownMaterials = [waterMaterial, minorErdtree, fire, grace];

  function setShadow(object: THREE.Object3D, cast = false, receive = false) {
    object.castShadow = cast;
    object.receiveShadow = receive;
    for (const child of object.children) setShadow(child, cast, receive);
  }

  /** Авторские материалы карты подменяются нашими по имени. */
  function modifyMaterials(object: THREE.Object3D) {
    for (const child of object.children) {
      const mesh = child as THREE.Mesh;
      const name = (mesh.material as THREE.Material | undefined)?.name;

      if (name === 'Erdtree Minor Leaves') mesh.material = minorErdtree;
      else if (name === 'Water') {
        mesh.receiveShadow = false;
        mesh.castShadow = false;
        mesh.material = waterMaterial;
      } else if (name === 'Fire') mesh.material = fire;
      else if (name === 'Grace Light') mesh.material = grace;

      modifyMaterials(child);
    }
  }

  const ambient = new THREE.AmbientLight(DAY.ambient.color, DAY.ambient.intensity);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(DAY.moon.color, DAY.moon.intensity);
  dirLight.castShadow = true;
  dirLight.shadow.radius = 5;
  dirLight.shadow.blurSamples = 8;
  dirLight.shadow.autoUpdate = false;
  dirLight.shadow.needsUpdate = true;
  dirLight.shadow.bias = -0.0004;
  dirLight.shadow.normalBias = 0.12;
  const shadowMapSize = postProcessing ? 8192 : 4096;
  dirLight.shadow.mapSize.width = shadowMapSize;
  dirLight.shadow.mapSize.height = shadowMapSize;
  dirLight.position.set(18, 40, 10);
  dirLight.target.position.set(-20, 0, -20);
  dirLight.frustumCulled = false;
  scene.add(dirLight);
  scene.add(dirLight.target);

  /** Высоты, между которыми лежит всё, что отбрасывает тень. */
  const SHADOW_SPAN = { low: -6, high: 30 };

  /** Подгоняет окно карты теней под весь мир. */
  const fitShadowToWorld = () => {
    const camera = dirLight.shadow.camera;

    const orientation = new THREE.Matrix4().lookAt(
      dirLight.position,
      dirLight.target.position,
      new THREE.Vector3(0, 1, 0),
    );
    const toWorld = new THREE.Matrix4()
      .makeRotationFromQuaternion(
        new THREE.Quaternion().setFromRotationMatrix(orientation),
      )
      .setPosition(dirLight.position);
    const toLight = toWorld.clone().invert();

    const corner = new THREE.Vector3();
    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    let near = Infinity;
    let far = -Infinity;

    for (const x of [MAP_BOUNDS.minX, MAP_BOUNDS.maxX]) {
      for (const y of [SHADOW_SPAN.low, SHADOW_SPAN.high]) {
        for (const z of [MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ]) {
          corner.set(x, y, z).applyMatrix4(toLight);

          left = Math.min(left, corner.x);
          right = Math.max(right, corner.x);
          bottom = Math.min(bottom, corner.y);
          top = Math.max(top, corner.y);
          near = Math.min(near, -corner.z);
          far = Math.max(far, -corner.z);
        }
      }
    }

    const PAD = 2;

    camera.left = left - PAD;
    camera.right = right + PAD;
    camera.bottom = bottom - PAD;
    camera.top = top + PAD;
    camera.near = Math.max(0.5, near - 1);
    camera.far = far + 1;
    camera.updateProjectionMatrix();
  };

  fitShadowToWorld();

  const hemiLight = new THREE.HemisphereLight(
    DAY.hemisphere.sky,
    DAY.hemisphere.ground,
    DAY.hemisphere.intensity,
  );
  hemiLight.frustumCulled = false;
  scene.add(hemiLight);

  const bookScene = new THREE.Scene();

  const bookCamera = new THREE.PerspectiveCamera(
    BOOK_FOV,
    size().width / size().height,
    0.1,
    50,
  );
  bookCamera.matrixAutoUpdate = false;

  const bookAmbient = new THREE.AmbientLight(0xffffff, 1);
  const bookHemi = new THREE.HemisphereLight(0x7c7a90, 0x5f5b4f, 7);
  const bookKey = new THREE.DirectionalLight(0xffffff, 1);
  bookKey.position.copy(dirLight.position);
  bookKey.target.position.copy(dirLight.target.position);
  bookKey.frustumCulled = false;
  bookScene.add(bookAmbient, bookHemi, bookKey, bookKey.target);

  scene.background = new THREE.Color(DAY.sky);
  scene.fog = new THREE.Fog(DAY.sky, DAY.fog.near, DAY.fog.far);

  /**
   * Диск луны. Заводится ниже, вместе с подписями, но объявлен здесь: набор
   * освещения перекрашивает его, а первый набор ставится раньше, чем диск
   * появляется, — обращение к ещё не созданной `const` уронило бы сцену.
   */
  let moon: Moon | null = null;
  /** Гряда по кромке воды. `null`, если файлов облаков на хостинге ещё нет. */
  let clouds: Clouds | null = null;

  const stars = createStars(scene);

  const erdlight = createErdlight(scene);

  /** Ставит набор освещения целиком. */
  const applyDaylight = (value: Daylight) => {
    (scene.background as THREE.Color).setHex(value.sky);
    scene.fog!.color.setHex(value.sky);
    (scene.fog as THREE.Fog).near = value.fog.near;
    (scene.fog as THREE.Fog).far = value.fog.far;

    ambient.color.setHex(value.ambient.color);
    ambient.intensity = value.ambient.intensity;

    hemiLight.color.setHex(value.hemisphere.sky);
    hemiLight.groundColor.setHex(value.hemisphere.ground);
    hemiLight.intensity = value.hemisphere.intensity;

    dirLight.color.setHex(value.moon.color);
    dirLight.intensity = value.moon.intensity;
    moon?.setColor(value.moon.disc);
    stars.setLight(value.stars);
    clouds?.setLight(value.moon.disc, value.sky);

    minorErdtree.emissiveIntensity = value.emissive.erdtree;
    erdlight.setLight(value.emissive.erdtree);
    fire.emissiveIntensity = value.emissive.fire;
    grace.emissiveIntensity = value.emissive.grace;
  };

  /** Переход между наборами. */
  const LIGHT_FADE = 1.1;
  let lightFrom = DAY;
  let lightTo = daylightFor(theme?.() ?? 'light');
  let lightShare = 1;

  applyDaylight(lightTo);

  const relight = () => {
    const next = daylightFor(theme?.() ?? 'light');
    if (next === lightTo) return;

    lightFrom = mixDaylight(lightFrom, lightTo, lightShare);
    lightTo = next;
    lightShare = 0;
  };

  const advanceLight = (delta: number) => {
    if (lightShare >= 1) return;

    lightShare = Math.min(1, lightShare + delta / LIGHT_FADE);
    applyDaylight(mixDaylight(lightFrom, lightTo, lightShare));
  };

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size().width, size().height),
    1.5,
    0.4,
    0.85,
  );
  bloomPass.threshold = 1;
  bloomPass.strength = 0.12;
  bloomPass.radius = 0.8;

  renderer.shadowMap.enabled = quality === 'full';

  const wind = createWind();

  if (postProcessing) composer.addPass(bloomPass);

  const bookPass = new RenderPass(bookScene, bookCamera);
  bookPass.clear = false;
  bookPass.clearDepth = true;
  composer.addPass(bookPass);

  composer.addPass(new OutputPass());

  /** Сглаживание краёв. */
  if (quality === 'full') {
    composer.addPass(new SMAAPass());
  }

  applySize();

  /** Камерой владеет риг. Сцена к ней не прикасается. */
  const rig = createCameraRig(camera, canvas);
  const controls = rig.controls;

  /**
   * Купол виден только на подборе отступа. Материал живёт отдельно от меша:
   * меш пересобирается на каждую правку, материал переживает пересборку.
   */
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0xff5ec4,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });

  let shellMesh: THREE.Mesh | null = null;

  function refreshShellMesh() {
    if (shellMesh) {
      scene.remove(shellMesh);
      shellMesh.geometry.dispose();
      shellMesh = null;
    }

    if (!shellSettings.visible) return;

    const geometry = buildShellMesh();
    if (!geometry) return;

    shellMesh = new THREE.Mesh(geometry, shellMaterial);
    shellMesh.name = '__shell';
    shellMesh.frustumCulled = false;
    scene.add(shellMesh);
  }

  /**
   * Карманы оболочки. Пока точки подбираются, источник — сохранённые ракурсы;
   * когда они лягут в `src/data`, источник сменится, а правило останется тем
   * же: где стоит утверждённый вид, туда камеру пускают.
   */
  function applyPockets() {
    const tuning = drafts?.pockets() ?? [];
    setShellPockets([...worldPockets(), ...tuning]);
  }

  /** Замер загрузки: сколько прошло от создания мира до каждой вехи. */
  const started = performance.now();
  const timing: WorldTiming = { map: null, landmarks: null, ready: null, full: null };
  const mark = (stage: keyof WorldTiming) => {
    timing[stage] = Math.round(performance.now() - started);
  };

  let loaded = false;
  /** Появляется после загрузки: до неё смерча в сцене нет. */
  let tornado: Tornado | null = null;
  /** Опавшая листва: появляется вместе с кронами, когда придёт карта. */
  let fallen: Fallen | null = null;
  /** То же и с горшками: их инстанс-меш собирается по приходу матриц. */
  let pots: Pots | null = null;
  manager.onProgress = (_url, done, total) => {
    onProgress?.(total > 0 ? done / total : 0);
  };

  /** Ставит разобранный тайл карты в сцену. */
  const addTile = (gltf: { scene: THREE.Group }) => {
    scene.add(gltf.scene);
    clipToBounds(gltf.scene, MAP_BOUNDS);
    buildMapShell(gltf.scene, MAP_BOUNDS);
    setShadow(gltf.scene, true, true);
    modifyMaterials(gltf.scene);

    const root = gltf.scene.children[0];
    for (const child of root?.children ?? []) {
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (material?.name === 'Sand Global') {
        setShadow(mesh, false, false);
        material.color = new THREE.Color(0x719d4e);
      }
    }
  };

  /** Собирает инстанс-меш из пары «геометрия + матрицы». */
  const addInstanced = (
    name: string,
    instance: { scene: THREE.Group },
    data: { scene: THREE.Group },
  ) => {
    const source = instance.scene.children[0] as THREE.Mesh | undefined;
    if (!source) return;

    const transforms = data.scene.children;
    const mesh = new THREE.InstancedMesh(
      source.geometry,
      source.material,
      transforms.length,
    );
    mesh.name = name;
    for (let i = 0; i < transforms.length; i++) {
      mesh.setMatrixAt(i, transforms[i]!.matrixWorld);
    }
    setShadow(mesh, true, false);
    if (isWindy(name)) wind.apply(mesh);
    scene.add(mesh);
  };

  /** Грузит волну инстансов целиком: пары файлов идут параллельно. */
  const loadInstanced = async (names: readonly string[]) => {
    await Promise.all(
      names.map(async (name) => {
        const [instance, data] = await Promise.all([
          loader.loadAsync(`${WORLD_ASSETS}/instanced/${name}.glb`),
          loader.loadAsync(`${WORLD_ASSETS}/instanced_data/${name}.glb`),
        ]);

        addInstanced(name, instance, data);
      }),
    );
  };

  const leaves = createLeaves(scene, textureLoader, minorErdtree);

  /** Дошла ли загрузка до показа мира: после этого отказ уже не фатален. */
  let shown = false;

  void (async () => {
    for (const tile of TILES) {
      addTile(await loader.loadAsync(`${WORLD_ASSETS}/${tile}.glb`));
    }

    mark('map');

    try {
      const models = await Promise.all(
        CLOUD_MODELS.map((model) =>
          loader.loadAsync(`${WORLD_ASSETS}/${model.name}.glb`),
        ),
      );
      clouds = attachClouds(scene, models, MAP_BOUNDS, quality === 'full');
      clouds.setLight(lightTo.moon.disc, lightTo.sky);
    } catch (error) {
      console.warn('мир: гряда облаков не загрузилась', error);
    }

    dirLight.shadow.needsUpdate = true;

    applyPockets();
    refreshShellMesh();

    const crowns = crownsOf(scene);
    leaves.seed(crowns);
    erdlight.seed(treesOf(scene));

    fallen = createFallen(scene, leaves.texture, crowns, scene, waterSurface(scene));

    const ground = groundField(2);
    if (ground) leaves.useGround(ground);

    const waves = loadWaves();
    await loadInstanced(waves.landmarks);
    mark('landmarks');

    renderer.compile(scene, camera);
    mark('ready');
    onLoaded?.();
    shown = true;

    await loadInstanced(waves.scatter);

    buildObstacleField(scene, MAP_BOUNDS);

    tornado = attachTornado(scene);

    pots = attachPots(scene, { reducedMotion });

    renderer.compile(scene, camera);

    dirLight.shadow.needsUpdate = true;

    loaded = true;
    mark('full');
  })().catch((error: unknown) => {
    if (shown) {
      console.error('вторая волна мира не приехала', error);
      return;
    }

    console.error('мир не загрузился', error);
    onFailed?.(error);
  });

  const book = createBook({
    renderer,
    canvas,
    reducedMotion,
    locale,
    onOpened: (open) => {
      reading = open;
      applySize();
      onBook?.(open);
    },
    onSpread: (index) => onSpread?.(index),
  });
  bookScene.add(book.object);

  moon = createMoon(scene, dirLight.position.clone().sub(dirLight.target.position));
  moon.setColor(lightTo.moon.disc);

  /** Сколько секунд мир не трогали. */
  let idle = 0;
  let phase: IdlePhase = 'active';

  /** Любое касание возвращает мир посетителю. */
  const wakeUp = () => {
    idle = 0;
    if (phase !== 'rest') return;

    phase = 'active';
    rig.cancel();
    onRest?.(false);
  };

  for (const event of ['pointerdown', 'pointermove', 'wheel', 'keydown'] as const) {
    window.addEventListener(event, wakeUp, { passive: true });
  }

  /** Ведёт покой: поворот взгляда, уход в облёт и его продление. */
  const advanceIdle = (delta: number) => {
    if (reducedMotion?.()) return;

    idle += delta;
    const next = idlePhase(idle);

    if (next === 'drift') rig.nudgeLook(driftYaw(idle, delta));

    if (next === phase) {
      if (next === 'rest' && !rig.flying) void rig.fly(restPath(), { freeLook: false });
      return;
    }

    phase = next;
    if (next !== 'rest') return;

    onRest?.(true);
    void rig.fly(restPath(), { freeLook: false });
  };

  /** Круг хранителя экрана: тот же путь по главам, что и у пролёта. */
  const restPath = () => flightPath().map((point) => point.shot);

  const figureLoader = new GLTFLoader();
  figureLoader.setDRACOLoader(draco);

  const figures = createFigures({ loader: figureLoader, reducedMotion });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  /** Направление замера: луч всегда идёт сверху вниз. */
  const DOWN = new THREE.Vector3(0, -1, 0);

  /**
   * Инструменты подбора и их черновики. Подключаются снаружи и только в
   * разработке — см. `attachDevTools`. В прод-сборке остаются `null`, и обе
   * пересборки, расстановки и купола, читают одни данные.
   */
  let devTools: WorldDevTools | null = null;
  let drafts: WorldDevDrafts | null = null;

  /** Наводит луч по доле канваса. */
  /** Высота поверхности в точке — лучом сверху по геометрии карты. */
  function surfaceAt(
    x: number,
    z: number,
    onto: 'ground' | 'props' | 'road' | 'top' = 'ground',
  ): number | null {
    raycaster.set(new THREE.Vector3(x, DROP_HEIGHT, z), DOWN);

    const targets = scene.children.filter(
      (child) =>
        !child.name.startsWith('__') &&
        child !== figures.object &&
        child.userData.notSurface !== true &&
        (onto === 'props' || !(child as THREE.InstancedMesh).isInstancedMesh),
    );

    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) return null;

    if (onto === 'road') {
      const road = hits.find((hit) => {
        const mesh = hit.object as THREE.Mesh;
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        const name = Array.isArray(material) ? material[0]?.name : material?.name;
        return name === 'Path';
      });
      if (road) return +road.point.y.toFixed(3);
    }

    if (onto === 'props') return +hits[0]!.point.y.toFixed(3);

    if (onto === 'top') return +hits[0]!.point.y.toFixed(3);

    const ceiling = shellHeightAt(x, z);
    if (ceiling === null) return +hits[0]!.point.y.toFixed(3);

    const expected = ceiling - shellSettings.padding;
    let best = hits[0]!;
    for (const hit of hits) {
      if (Math.abs(hit.point.y - expected) < Math.abs(best.point.y - expected))
        best = hit;
    }

    return +best.point.y.toFixed(3);
  }

  function aimAt(x: number, y: number) {
    camera.updateMatrixWorld();
    pointer.set(x * 2 - 1, 1 - y * 2);
    raycaster.setFromCamera(pointer, camera);
  }
  scene.add(figures.object);

  /**
   * Что показывать: утверждённая расстановка из данных плюс то, что подбирается
   * прямо сейчас. Подобранное перебивает данные по `id` — иначе выгруженная и
   * вставленная в данные фигура двоилась бы со своей же черновой записью.
   */
  function refreshFigures() {
    const tuning = drafts?.figures() ?? [];
    const dropped = new Set(drafts?.dropped() ?? []);

    const byId = new Map(worldFigures.map((figure) => [figure.id, figure]));
    for (const figure of tuning) byId.set(figure.id, figure);
    for (const id of dropped) byId.delete(id);

    return figures.show([...byId.values()]);
  }

  void refreshFigures();
  void figures.walk(worldPatrols);
  void figures.fight(worldBattles);

  const clock = new THREE.Clock();
  const probeClock = new THREE.Clock();
  let frame = 0;
  let timeTarget = 0;
  let frames = 0;
  let frameSeconds = 0;
  let running = true;

  /** Один кадр мира: движение на заданную дельту и отрисовка. */
  function frameOf(delta: number) {
    rig.update(delta);
    tornado?.update(delta);
    pots?.update(delta);
    figures.update(delta, camera);
    wind.advance(delta);
    water.advance(delta);
    leaves.advance(delta);

    moon?.update(camera);
    stars.update(camera, delta);
    erdlight.update(camera, delta);

    advanceIdle(delta);
    advanceLight(delta);

    bookCamera.matrix.copy(camera.matrixWorld);
    bookCamera.matrixWorldNeedsUpdate = true;
    bookCamera.updateMatrixWorld();
    book.update(bookCamera);
    composer.render();
  }

  function tick() {
    frame = requestAnimationFrame(tick);

    if (!running) return;

    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;

    if (Date.now() >= timeTarget) {
      frameOf(frameDelta(clock.getDelta()));

      timeTarget += FRAME_MS;
      if (Date.now() >= timeTarget) timeTarget = Date.now();
    }

    const probe = probeClock.getDelta();
    if (frames < PROBE_WARMUP + PROBE_FRAMES && loaded) {
      frames++;
      if (frames > PROBE_WARMUP) frameSeconds += probe;

      const measured = frameSeconds / PROBE_FRAMES;
      if (frames >= PROBE_WARMUP + PROBE_FRAMES && measured > SLOW_FRAME_SECONDS) {
        if (measured > SLOW_FRAME_SECONDS * 1.6) {
          renderer.shadowMap.enabled = false;
        }
      }
    }

    renderer.info.reset();
  }

  tick();

  const observer = new ResizeObserver(() => applySize());
  observer.observe(canvas);

  function dispose() {
    book.dispose();

    for (const event of ['pointerdown', 'wheel', 'keydown'] as const) {
      window.removeEventListener(event, wakeUp);
    }

    leaves.dispose();
    fallen?.dispose();
    fallen = null;
    clouds?.dispose();
    clouds = null;
    moon?.dispose();
    moon = null;
    stars.dispose();
    erdlight.dispose();

    tornado?.dispose();
    tornado = null;
    pots?.dispose();
    pots = null;
    figures.dispose();
    clearObstacleField();
    devTools?.dispose();
    devTools = null;
    drafts = null;
    cancelAnimationFrame(frame);
    observer.disconnect();

    rig.dispose();

    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) disposeMaterial(mesh.material);
    });
    scene.clear();

    bookScene.clear();

    for (const material of ownMaterials) material.dispose();
    shellMaterial.dispose();
    envmap.dispose();

    composer.dispose();
    draco.dispose();
    renderer.dispose();
  }

  return {
    scene,
    camera,
    controls,
    renderer,
    composer,
    rig,
    book,
    relight,
    get timing() {
      return timing;
    },
    setControlMode: rig.setControlMode,
    setMoveSpeed: rig.setMoveSpeed,
    shell: {
      settings: shellSettings,
      setVisible: (visible: boolean) => {
        shellSettings.visible = visible;
        refreshShellMesh();
      },
      setPadding: (padding: number) => {
        shellSettings.padding = padding;
        refreshShellMesh();
      },
      setSpread: (spread: number) => {
        shellSettings.spread = spread;
        applySpread();
        refreshShellMesh();
      },
      heightAt: shellHeightAt,
      setCollisions: (enabled: boolean) => {
        rig.setCollisions(enabled);
        shellSettings.enabled = enabled;
      },
    },
    wind: wind.time,
    get dev() {
      return devTools;
    },
    attachDevTools: (make) => {
      if (devTools) return devTools;

      devTools = make({
        scene,
        camera,
        controls,
        rig,
        figures,
        raycaster,
        aimAt,
        surfaceAt,
        shellHeightAt,
        shellPadding: () => shellSettings.padding,
        obstacleHeightAt,
        refreshFigures,
        applyPockets,
      });
      drafts = devTools.drafts;

      void refreshFigures();
      applyPockets();

      return devTools;
    },
    /** Прокрутить мир вручную: столько-то секунд подряд кадрами по `stride`. */
    step: (seconds: number, stride = 1 / 30) => {
      for (let done = 0; done < seconds; done += stride) {
        frameOf(Math.min(stride, seconds - done));
      }
      clock.getDelta();
    },
    setRunning: (next: boolean) => {
      if (next === running) return;
      running = next;
      if (next) clock.getDelta();
    },
    dispose,
  };
}

export { shellSettings };
