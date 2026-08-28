/**
 * Сцена мира. Порт `scene.js` из форка lands-between с четырьмя отличиями,
 * без которых он не может жить в этом проекте:
 *
 * 1. Всё состояние — внутри экземпляра, а не в модуле. Окно можно закрыть и
 *    открыть снова, и второй мир не должен подбирать обломки первого.
 * 2. Размер берётся у канваса, а не у окна: мир живёт в окне переменного размера.
 * 3. Есть `dispose()`. Без него переключение вида течёт видеопамятью.
 * 4. Камерой сцена не распоряжается: ею владеет `camera-rig`. Здесь остались
 *    загрузка, свет, материалы и цикл — всё, что про мир, а не про взгляд.
 *
 * Убрано при переносе: lil-gui и Stats (инструменты форка), обращения к
 * `document.querySelector`.
 */

import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { worldFigures, type WorldFigure } from '@/data/world-figures';
import { worldBattles } from '@/data/world-battles';
import { battleView } from '@/lib/world/battle';
import { worldPatrols, type WorldPatrol } from '@/data/world-patrols';
import { zoneOf, type WorldShot } from '@/data/world-shots';
import type { WorldBattle } from '@/lib/world/battle';
import type { Locale, ResolvedTheme } from '@/lib/settings/types';

import { TILES, WORLD_ASSETS } from './assets';
import { createBook, type Book } from './book';
import { MAP_BOUNDS } from './bounds';
import { createCameraRig, type CameraRig, type ControlMode } from './camera-rig';
import { clipToBounds } from './clip-map';
import {
  clearMarks,
  clearRoute,
  markInstances,
  markRoute,
  type MarkedInstance,
} from './dev-markers';
import {
  adoptFigure,
  clearFigures,
  droppedFigures,
  formatFigures,
  listFigures,
  placeFigure,
  removeFigure,
  tweakFigure,
  type FigurePatch,
} from './dev-figures';
import {
  applyShot,
  clearShots,
  exportShots,
  listShots,
  pocketsFromShots,
  removeShot,
  saveShot,
  type CameraShot,
} from './dev-shots';
import { figureToolsEnabled, shotToolsEnabled } from './dev-tools';
import { createCrowdTools, type CrowdTools } from './dev-crowd';
import { createBattleTools, type BattleTools } from './dev-battles';
import { createPatrolTools, type PatrolTools } from './dev-patrols';
import { createFigures, traceGround } from './figures';
import { DAY, daylightFor, mixDaylight, type Daylight } from './daylight';
import { loadWaves } from './loading';
import { driftYaw, idlePhase, type IdlePhase } from './idle';
import { createMarkers } from './markers';
import { advanceChapter, pathTarget } from './route';
import {
  applySpread,
  buildMapShell,
  buildShellMesh,
  setShellPockets,
  shellHeightAt,
  shellSettings,
} from './map-shell';
import { buildObstacleField, clearObstacleField, obstacleHeightAt } from './obstacles';
import { attachPots, type Pots } from './pots';
import { flightPath, peakFlight, worldPockets } from './shots';
import { attachTornado, type Tornado } from './tornado';
import { createWater } from './water';
import { createWind, isWindy } from './wind';

export type { ControlMode };

/**
 * Вехи загрузки в миллисекундах от создания мира. `null` — веха не пройдена.
 */
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
  /** Постобработка: bloom и GTAO. Выключается на слабых машинах. */
  postProcessing?: boolean;
  /** Просьба о покое: переходы книги становятся мгновенными. */
  reducedMotion?: () => boolean;
  /** Язык хрома книги. Текст резюме остаётся русским при любом. */
  locale?: () => Locale;
  /** Тема портфолио: под неё идёт свет мира. */
  theme?: () => ResolvedTheme;
  /**
   * Пройдена очередная глава основного пути.
   *
   * Зовётся только на смене: до главы доходят и пешком, минуя нижнюю полосу, и
   * без этого её счётчик показывал бы вход, пока посетитель стоит у Flexy.
   */
  onChapter?: (positionId: string | null) => void;
  /**
   * Мир ушёл в облёт или вернулся из него.
   *
   * Хранителю экрана нужен пустой кадр: панели поверх ролика читаются
   * забытым интерфейсом, а не миром. Убирает их интерфейс сам — сцена только
   * сообщает, что началось.
   */
  onRest?: (resting: boolean) => void;
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
  /**
   * Путь по главам: что пройдено и куда вести дальше.
   *
   * Прогресс считает мир, а не интерфейс: до главы доходят и пешком, минуя
   * нижнюю полосу. Интерфейсу остаётся спросить, куда лететь.
   */
  /**
   * Перекладывает свет под текущую тему портфолио.
   *
   * Отдельной командой, как и `book.relabel`: тему меняют раз в сеанс, а
   * сверять её шестьдесят раз в секунду пришлось бы всегда.
   */
  relight: () => void;
  route: {
    /** `Position.id` последней пройденной главы основного пути. */
    readonly passed: string | null;
    /** Цель кнопки «на путь»: глава и ракурс её прибытия. */
    target: () => { positionId: string; shot: WorldShot } | null;
  };
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
  /** Номера над инстансами: инструмент подбора точек. */
  marks: {
    show: (name: string) => MarkedInstance[];
    clear: () => void;
    /** Схема пролёта: линия, стрелки и подписи остановок. */
    route: () => number;
    clearRoute: () => void;
  };
  /**
   * Расстановка фигур: поставить, поправить, выгрузить в данные. Живёт рядом с
   * `shots` и работает так же — черновик в `localStorage`, итог в `src/data`.
   */
  figures: {
    place: (patch?: FigurePatch) => WorldFigure;
    tweak: (id: string, patch: FigurePatch) => WorldFigure | null;
    list: () => WorldFigure[];
    remove: (id: string) => boolean;
    clear: () => void;
    export: () => string;
    /** Сколько фигур стоит в сцене сейчас. */
    count: () => number;
    /** Всё, что стоит в мире: утверждённое и черновое. */
    placed: () => readonly WorldFigure[];
    /** Фигура по имени: из данных или из черновика. */
    find: (id: string) => WorldFigure | null;
    /** Переносит фигуру из данных в черновик, чтобы её можно было править. */
    adopt: (id: string) => WorldFigure | null;
    /** Подводит камеру к фигуре: со ста двадцати семи иначе её не найти. */
    goTo: (id: string) => boolean;
    /**
     * Подводит камеру к идущей группе.
     *
     * Дозор не стоит на месте, поэтому целью служит не запись в данных, а тот,
     * кто сейчас идёт первым: место берётся у него из сцены.
     */
    goToPatrol: (id: string) => boolean;
    /**
     * Подводит камеру к стычке — сбоку от фронта, чтобы видеть обе шеренги.
     *
     * Без имени берёт следующую по кругу: стычек три, они разбросаны по карте,
     * и обойти их подряд одной командой удобнее, чем вспоминать имена.
     *
     * @returns имя стычки, к которой поехали, или `null`, если стычек нет
     */
    goToBattle: (id?: string) => string | null;
    /** Ходящие дозоры: маршруты для проверки. */
    patrols: () => readonly WorldPatrol[];
    /** Идущие стычки: их площадки и составы. */
    battles: () => readonly WorldBattle[];
    /** Точка земли под курсором. Координаты — доли канваса от 0 до 1. */
    groundAt: (x: number, y: number) => [number, number, number] | null;
    /** Имя фигуры под курсором. Координаты те же. */
    pickAt: (x: number, y: number) => string | null;
    /**
     * Верхушка препятствия в точке или `null`, если там чисто.
     *
     * Та же карта, что держит камеру от столкновений: 8968 инстансов,
     * огрублённых до сфер. Нужна при прокладке маршрутов — без неё дозор
     * проходит сквозь караван, стоящий на дороге.
     */
    blockedAt: (x: number, z: number) => number | null;
    /**
     * Точная высота земли в точке — лучом по геометрии карты.
     *
     * Сетка оболочки для этого не годится: по замеру автора она висит над
     * рельефом (медиана 0,65), и фигура по её высоте идёт по воздуху. Луч
     * стоит около 110 мс, поэтому он только для расстановки и запекания
     * маршрутов, но не для кадра.
     */
    dropAt: (
      x: number,
      z: number,
      onto?: 'ground' | 'props' | 'road' | 'top',
    ) => number | null;
    /**
     * Все высоты ленты дороги в точке, сверху вниз.
     *
     * На мостах лента лежит в два-три слоя, и один ответ здесь врёт: маршрут
     * должен выбирать тот слой, по которому шёл до этого. Выбор — за тем, кто
     * печёт маршрут; здесь только замер.
     */
    dropAll: (x: number, z: number) => number[];
  };
  /**
   * Заселение: замеры и поиск мест под сотни фигур. Дев-инструмент, живёт
   * рядом с расстановкой и в прод не идёт — им пекут содержимое `src/data`.
   */
  crowd: CrowdTools;
  /**
   * Маршруты дозоров: замер по ленте дороги и перепекание. Дев-инструмент того
   * же рода, что и `crowd`, — им пекут `src/data/world-patrols.ts`.
   */
  patrols: PatrolTools;
  /**
   * Площадки стычек: замер поляны и проверка того, что лежит в данных.
   * Дев-инструмент, им пекут `src/data/world-battles.ts`.
   */
  battles: BattleTools;
  /** Сохранённые ракурсы: подбор вживую, выгрузка в данные. */
  shots: {
    save: (name?: string) => CameraShot;
    list: () => CameraShot[];
    go: (name: string) => CameraShot | null;
    remove: (name: string) => boolean;
    clear: () => void;
    export: () => string;
  };
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

/** Откуда пускается луч вниз при расстановке: выше самой высокой горы карты. */
const DROP_HEIGHT = 40;

/** Кадр фиксированной длительности, как в форке. */
const FRAME_MS = 1000 / 60;

/** Через столько кадров решаем, тянет ли машина тени и полную постобработку. */
const PROBE_FRAMES = 100;

/** Средний кадр дольше этого — машина не тянет, снижаем качество AO. */
const SLOW_FRAME_SECONDS = 0.025;

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  const list = Array.isArray(material) ? material : [material];
  for (const item of list) {
    for (const value of Object.values(item)) {
      // Текстуры лежат в произвольных полях материала — обходим по значениям.
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
    reducedMotion,
    locale,
    theme,
    onChapter,
    onRest,
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

  // Размер канваса, а не окна: мир живёт в окне переменного размера.
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
    powerPreference: 'high-performance',
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

  const applySize = () => {
    const { width, height } = size();
    const ratio = Math.min(window.devicePixelRatio, 1.5);

    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);

    // Композеру нужен тот же множитель, иначе его цели остаются в CSS-пикселях
    // и вся постобработка считается на 2/3 разрешения. Для UnrealBloomPass это
    // не просто мягче: он размывает в текселях, и на меньшем буфере ореол
    // расползается в полтора раза шире — деревья начинают полыхать.
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  // --- Материалы ----------------------------------------------------------

  const waterMaterial = new THREE.MeshStandardMaterial();
  const minorErdtree = new THREE.MeshStandardMaterial();
  const fire = new THREE.MeshStandardMaterial();
  const grace = new THREE.MeshStandardMaterial();

  /*
   * Вода собрана отдельным узлом: цвет, отражение и рябь в нормали. Почему
   * рябь именно в нормали — замер геометрии в `water.ts`.
   */
  const water = createWater();
  water.apply(waterMaterial, envmap);

  minorErdtree.color = new THREE.Color(0xfffeb6);
  minorErdtree.emissive = new THREE.Color(0xffa51d);
  // Подобрано вживую 2026-08-21. В форке было 5 — кроны полыхали и съедали
  // половину кадра. Гасим источник, а не только ореол вокруг него.
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

  // --- Свет ---------------------------------------------------------------

  const ambient = new THREE.AmbientLight(DAY.ambient.color, DAY.ambient.intensity);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.castShadow = true;
  dirLight.shadow.radius = 25;
  dirLight.shadow.blurSamples = 25;
  dirLight.shadow.bias = -0.0001;
  dirLight.shadow.mapSize.width = 4096;
  dirLight.shadow.mapSize.height = 4096;
  dirLight.position.set(18, 40, 10);
  dirLight.target.position.set(-20, 0, -20);
  dirLight.shadow.camera.near = 0.2;
  dirLight.shadow.camera.far = 120;
  dirLight.shadow.camera.left = -100;
  dirLight.shadow.camera.bottom = -80;
  dirLight.shadow.camera.right = 80;
  dirLight.shadow.camera.top = 120;
  dirLight.frustumCulled = false;
  scene.add(dirLight);

  const hemiLight = new THREE.HemisphereLight(
    DAY.hemisphere.sky,
    DAY.hemisphere.ground,
    DAY.hemisphere.intensity,
  );
  hemiLight.frustumCulled = false;
  scene.add(hemiLight);

  /*
   * Книга живёт в своей сцене и рисуется отдельным проходом.
   *
   * Причина — глубина. Закрытый том стоит в 0.9 юнита от глаза, а масштаб мира
   * — примерно 1 юнит на 40 метров: крона над головой и склон под ногами
   * оказываются ближе книги честно, по расстоянию, и закрывают её целиком.
   * Подвинуть книгу к самому глазу нельзя — камера заходит внутрь кроны, там
   * ближе неё уже ничего не поставить.
   *
   * Отсюда отдельный проход с очисткой глубины: мир рисуется и затеняется, а
   * книга ложится поверх готового кадра, но до `OutputPass` — значит проходит
   * ту же экспозицию 1.16, под которую подобрана бумага страницы.
   *
   * Своя сцена, а не слой камеры: `GTAOPass` считает нормали, подменяя материал
   * всей сцены своим, и книга в этой сцене снова получила бы затенение по
   * геометрии, которая перед ней. Из чужой сцены её оттуда не видно вовсе.
   */
  const bookScene = new THREE.Scene();

  /*
   * Свет книги повторяет свет мира числом и параметрами.
   *
   * Один и тот же источник в двух сценах не живёт — у объекта один родитель, —
   * а материалы книги подобраны под этот набор: убери один источник, и бумага
   * с крышкой поедут по яркости. Тени сюда не переносятся: книга их не
   * отбрасывает и не принимает, а вторая карта теней стоила бы кадра.
   */
  const bookAmbient = new THREE.AmbientLight(0xffffff, 1);
  const bookHemi = new THREE.HemisphereLight(0x7c7a90, 0x5f5b4f, 7);
  const bookKey = new THREE.DirectionalLight(0xffffff, 1);
  bookKey.position.copy(dirLight.position);
  bookKey.target.position.copy(dirLight.target.position);
  bookKey.frustumCulled = false;
  bookScene.add(bookAmbient, bookHemi, bookKey, bookKey.target);

  /*
   * Небо, туман, свет и эмиссия — одним набором из `daylight.ts`: мир идёт за
   * темой портфолио, и держать её половину здесь числами значило бы однажды
   * поменять небо, забыв про туман.
   */
  scene.background = new THREE.Color(DAY.sky);
  scene.fog = new THREE.Fog(DAY.sky, DAY.fog.near, DAY.fog.far);

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

    dirLight.color.setHex(value.sun.color);
    dirLight.intensity = value.sun.intensity;

    minorErdtree.emissiveIntensity = value.emissive.erdtree;
    fire.emissiveIntensity = value.emissive.fire;
    grace.emissiveIntensity = value.emissive.grace;
  };

  /**
   * Переход между наборами.
   *
   * Своим ходом по кадрам, а не через `motion`: величин здесь двенадцать, и
   * анимировать пришлось бы объект целиком — ровно та ловушка, на которой
   * книга теряла повторные переходы. Доля же считается одним числом.
   */
  const LIGHT_FADE = 1.1;
  let lightFrom = DAY;
  let lightTo = daylightFor(theme?.() ?? 'light');
  let lightShare = 1;

  applyDaylight(lightTo);

  const relight = () => {
    const next = daylightFor(theme?.() ?? 'light');
    if (next === lightTo) return;

    // Переход начинается с того, что на экране сейчас, а не с прежнего конца:
    // тему успевают переключить дважды, пока идёт первая секунда.
    lightFrom = mixDaylight(lightFrom, lightTo, lightShare);
    lightTo = next;
    lightShare = 0;
  };

  const advanceLight = (delta: number) => {
    if (lightShare >= 1) return;

    lightShare = Math.min(1, lightShare + delta / LIGHT_FADE);
    applyDaylight(mixDaylight(lightFrom, lightTo, lightShare));
  };

  // --- Постобработка ------------------------------------------------------

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size().width, size().height),
    1.5,
    0.4,
    0.85,
  );
  // Подобрано вживую 2026-08-21 вместе с эмиссией крон: 0.2 / 1 / 1 из форка
  // давали ореол шире самих деревьев.
  bloomPass.threshold = 1;
  bloomPass.strength = 0.12;
  bloomPass.radius = 0.8;

  const gtaoPass = new GTAOPass(scene, camera, size().width, size().height);
  gtaoPass.output = GTAOPass.OUTPUT.Default;

  /*
   * Буфер нормалей должен видеть и обратные грани.
   *
   * `GTAOPass` считает нормали, подменяя материал всей сцены своим
   * `MeshNormalMaterial`, а у того по умолчанию `FrontSide`. Грань, отвернутая
   * от камеры, из буфера выпадает целиком, и проход считает затенение по тому,
   * что **за** ней, — сквозь поверхность проступает силуэт дальней геометрии.
   *
   * Поймано это было на листающемся листе книги, который после 90° встаёт к
   * камере изнанкой. Книга с тех пор рисуется своей сценой и своим проходом и
   * сюда не попадает, но правка остаётся: материалы мира двусторонние
   * (`doubleSided: true` во всех 148 материалах `map.glb`), и их обратные грани
   * ровно так же обязаны быть в буфере.
   */
  gtaoPass.normalMaterial.side = THREE.DoubleSide;

  const wind = createWind();
  // Проход подменяет материалы всей сцены своим, и без этого патча затемнение
  // считалось бы по неподвижным деревьям — вокруг кроны оставался бы призрак.
  // Карта теней про ветер по-прежнему не знает: её материал глубины тоже своя
  // подмена. Вопрос спящий, пока проба производительности гасит тени после
  // сотни кадров, — если их когда-нибудь оживят, сюда надо вернуться.
  wind.applyToNormalPass(gtaoPass);

  const aoParameters = {
    radius: 0.05,
    distanceExponent: 4,
    thickness: 1,
    scale: 1.1,
    samples: 16,
    distanceFallOff: 0.75,
    screenSpaceRadius: false,
  };
  gtaoPass.updateGtaoMaterial(aoParameters);
  gtaoPass.updatePdMaterial({
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3,
    radius: 2,
    radiusExponent: 1,
    rings: 1,
    samples: 2,
  });

  if (postProcessing) {
    composer.addPass(bloomPass);
    composer.addPass(gtaoPass);
  }

  /*
   * Книга поверх готового мира.
   *
   * `clear` выключен — кадр мира остаётся, — а глубина чистится: после этого
   * книге не с чем спорить, и она рисуется целиком, где бы ни стояла крона.
   * Место прохода выбрано: после свечения и затенения, чтобы ни то, ни другое
   * не считалось по геометрии перед книгой, и до `OutputPass`, чтобы книга
   * прошла общую экспозицию.
   */
  const bookPass = new RenderPass(bookScene, camera);
  bookPass.clear = false;
  bookPass.clearDepth = true;
  composer.addPass(bookPass);

  composer.addPass(new OutputPass());

  applySize();

  // --- Управление ---------------------------------------------------------

  /** Камерой владеет риг. Сцена к ней не прикасается. */
  const rig = createCameraRig(camera, canvas);
  const controls = rig.controls;

  /**
   * Горячие клавиши подбора: Shift+S — снимок, Shift+E — выгрузка всех.
   * Руки при подборе заняты мышью, а лезть в консоль на каждый кадр долго.
   */
  const onDevKey = (event: KeyboardEvent) => {
    if (!event.shiftKey) return;

    /*
     * Обход стычек живёт под флагом расстановки, а не под подбором ракурсов:
     * стычки — часть населения мира, и смотрят их тогда же, когда правят
     * фигур. Своя проверка флага нужна потому, что подбор ракурсов обычно
     * выключен, а посмотреть бой хочется.
     */
    if (event.code === 'KeyB' && figureToolsEnabled()) {
      const id = goToBattle();
      console.info(id ? `стычка «${id}»` : 'стычек в мире нет');
      return;
    }

    if (!shotToolsEnabled()) return;

    if (event.code === 'KeyS') {
      const shot = saveShot(camera, controls.target);
      applyPockets();
      console.info(`снимок «${shot.name}»`, shot.at, '→', shot.look);
      return;
    }

    if (event.code === 'KeyE') {
      const list = listShots();
      if (!list.length) {
        console.info('снимков пока нет');
        return;
      }

      const text = exportShots();
      console.info(`\n${text}`);
      // Нажатие клавиши — жест пользователя, буфер обмена в этот момент открыт.
      navigator.clipboard
        .writeText(text)
        .then(() => console.info(`скопировано в буфер: ${list.length} шт.`))
        .catch(() => console.info('в буфер не отдалось — копируй из вывода выше'));
    }
  };

  window.addEventListener('keydown', onDevKey);

  // --- Оболочка камеры ------------------------------------------------------

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
    // Имя со служебной приставкой: луч расстановки такие узлы пропускает.
    shellMesh.name = '__shell';
    // Купол накрывает весь мир: его габаритная сфера огромна, и отсечение по
    // пирамиде видимости выбрасывает его целиком, стоит отвести взгляд.
    shellMesh.frustumCulled = false;
    scene.add(shellMesh);
  }

  // --- Загрузка -----------------------------------------------------------

  /**
   * Карманы оболочки. Пока точки подбираются, источник — сохранённые ракурсы;
   * когда они лягут в `src/data`, источник сменится, а правило останется тем
   * же: где стоит утверждённый вид, туда камеру пускают.
   */
  function applyPockets() {
    // Утверждённые ракурсы из данных плюс то, что подбирается прямо сейчас.
    // Несохранённые снимки участвуют только при включённом инструменте: иначе
    // чужой `localStorage` пробивал бы дыры в куполе у случайного посетителя.
    const tuning = shotToolsEnabled() ? pocketsFromShots() : [];
    setShellPockets([...worldPockets(), ...tuning]);
  }

  /**
   * Замер загрузки: сколько прошло от создания мира до каждой вехи.
   *
   * Постоянный, а не дев-инструмент: «стало быстрее» — утверждение, которое
   * обязано опираться на число, а не на ощущение от перезагрузки. Стоит он
   * трёх вызовов `performance.now()` за всю жизнь сцены.
   */
  const started = performance.now();
  const timing: WorldTiming = { map: null, landmarks: null, ready: null, full: null };
  const mark = (stage: keyof WorldTiming) => {
    timing[stage] = Math.round(performance.now() - started);
  };

  let loaded = false;
  /** Появляется после загрузки: до неё смерча в сцене нет. */
  let tornado: Tornado | null = null;
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
    setShadow(gltf.scene, false, true);
    modifyMaterials(gltf.scene);

    // Дно красится в зелёный: сквозь полупрозрачную воду оно даёт морю бирюзу.
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
    // Ветер заводится до `renderer.compile`: патч материала меняет шейдер, и
    // прогрев должен собрать уже его, а не переделывать программу в кадре.
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

  /*
   * Мир приходит двумя волнами, а не одним пакетом.
   *
   * Раньше первый кадр ждал последний куст: две сотни файлов инстансов висели
   * в той же очереди, что и рельеф. Теперь после карты и ориентиров мир
   * отдаётся наружу — по нему уже можно идти, — а россыпь достраивается на
   * глазах. Разбиение живёт в `loading.ts`, здесь только порядок.
   *
   * Плата названа честно: пока не приехала вторая волна, карты препятствий
   * ещё нет, и камера в эти секунды проходит сквозь деревья. Посетитель в них
   * не упирается — он стоит на станции у входа и осматривается.
   */
  void (async () => {
    for (const tile of TILES) {
      addTile(await loader.loadAsync(`${WORLD_ASSETS}/${tile}.glb`));
    }
    mark('map');

    // Карманы и купол считаются по рельефу, а не по инстансам: можно сразу.
    applyPockets();
    refreshShellMesh();

    const waves = loadWaves();
    await loadInstanced(waves.landmarks);
    mark('landmarks');

    /*
     * Первый кадр с миллионами треугольников компилирует шейдеры и подвисает
     * на доли секунды. Если начать вход сразу, он начнётся с рывка — поэтому
     * прогреваем до того, как отдать сцену наружу. Второй прогрев ждёт вторую
     * волну: у россыпи свои материалы.
     */
    renderer.compile(scene, camera);
    mark('ready');
    onLoaded?.();

    await loadInstanced(waves.scatter);

    // Карта препятствий строится по инстансам, поэтому только когда пришли все.
    buildObstacleField(scene, MAP_BOUNDS);

    // Смерчу нужны и карта, и обломки: он берёт ось у одной и матрицы у других.
    // После карты препятствий — на нулевом угле обломки стоят там же, где легли.
    tornado = attachTornado(scene);

    // Горшкам нужен только свой инстанс-меш, но заводятся они здесь же: до
    // `renderer.compile` — прогрев должен собрать уже расширенную сферу.
    pots = attachPots(scene, { reducedMotion });

    renderer.compile(scene, camera);
    loaded = true;
    mark('full');
  })();

  // --- Книга ---------------------------------------------------------------

  /*
   * Книга — обычный объект сцены, а не ребёнок камеры: `scene.add(camera)`
   * здесь нет, и дети камеры не попали бы в обход рендерера вовсе. Свою
   * матрицу она собирает из `camera.matrixWorld` каждый кадр, отчего камера
   * остаётся во владении рига (D3), а книгу можно прятать отдельно от мира.
   */
  const book = createBook({ renderer, canvas, reducedMotion, locale });
  bookScene.add(book.object);

  // --- Подписи ---------------------------------------------------------------

  /*
   * Подписи живут в сцене мира, а не в сцене книги. Книга — предмет в руках,
   * она поверх всего; подпись главы стоит в мире, и закрыть её книгой
   * правильно: посетитель читает либо мир, либо резюме.
   */
  const markers = createMarkers(scene);

  /**
   * Пройденная глава основного пути.
   *
   * Живёт здесь, а не в интерфейсе: до главы можно дойти пешком, минуя нижнюю
   * полосу, и прогресс, считаемый по кнопкам, разошёлся бы с тем, что
   * посетитель уже видел своими глазами.
   */
  let passed: string | null = null;

  // --- Покой --------------------------------------------------------------

  /**
   * Сколько секунд мир не трогали.
   *
   * Считается кадрами, а не таймером: замерший мир (`setRunning(false)`) не
   * должен уходить в облёт, пока его никто не видит — а таймер об этом не
   * знает.
   */
  let idle = 0;
  let phase: IdlePhase = 'active';

  /** Любое касание возвращает мир посетителю. */
  const wakeUp = () => {
    idle = 0;
    if (phase !== 'rest') return;

    // Облёт забрал камеру — отдаём сразу, не дожидаясь конца перелёта.
    phase = 'active';
    rig.cancel();
    onRest?.(false);
  };

  for (const event of ['pointerdown', 'wheel', 'keydown'] as const) {
    // На окне, а не на канвасе: клавиши до канваса не доходят, а колесо над
    // панелью — это тоже посетитель, а не покой.
    window.addEventListener(event, wakeUp, { passive: true });
  }

  /**
   * Ведёт покой: поворот взгляда, уход в облёт и его продление.
   *
   * Просьбу о покое уважаем целиком: при `reducedMotion` мир просто стоит.
   * Движение без спроса — ровно то, от чего эта настройка защищает.
   */
  const advanceIdle = (delta: number) => {
    if (reducedMotion?.()) return;

    idle += delta;
    const next = idlePhase(idle);

    if (next === 'drift') rig.nudgeLook(driftYaw(idle, delta));

    if (next === phase) {
      // Облёт кончился сам, а посетителя всё нет: пускаем следующий круг.
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

  // --- Фигуры --------------------------------------------------------------

  /*
   * Свой загрузчик, без общего `manager`: фигуры приходят после `onLoad` —
   * из данных при старте и по одной во время расстановки. Через общий менеджер
   * каждая такая догрузка заново поднимала бы `onLoad` со всем, что за ним
   * стоит: карманы, поле препятствий, смерч, прогрев шейдеров.
   */
  const figureLoader = new GLTFLoader();
  figureLoader.setDRACOLoader(draco);

  const figures = createFigures({ loader: figureLoader, reducedMotion });

  // Один луч на все опросы указателя: инструмент расстановки спрашивает их
  // на каждое движение мыши с зажатой кнопкой.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  /** Какую стычку показали прошлый раз: `goToBattle()` без имени идёт дальше. */
  let battleCursor = -1;
  const DOWN = new THREE.Vector3(0, -1, 0);

  /** Инструменты заселения. Ленивые: см. ниже, где они отдаются наружу. */
  let crowdTools: CrowdTools | null = null;
  const crowd = (): CrowdTools =>
    (crowdTools ??= createCrowdTools({ scene, surfaceAt }));
  let patrolTools: PatrolTools | null = null;
  let battleTools: BattleTools | null = null;

  /**
   * Наводит луч по доле канваса.
   *
   * Матрицу камеры обновляем сами: `setFromCamera` читает `matrixWorld`, а
   * обновляет её отрисовка. Замерший мир (`setRunning(false)`) кадров не
   * рисует — и луч уходил бы из того места, где камера стояла до паузы.
   */
  /**
   * Высота поверхности в точке — лучом сверху по геометрии карты.
   *
   * Сетка оболочки для этого не годится: по замеру автора она висит над
   * рельефом (медиана 0,65), и по её высоте фигура идёт по воздуху. Луч дороже
   * (десятки миллисекунд), поэтому он для расстановки и запекания маршрутов,
   * но не для кадра.
   */
  function surfaceAt(
    x: number,
    z: number,
    onto: 'ground' | 'props' | 'road' | 'top' = 'ground',
  ): number | null {
    raycaster.set(new THREE.Vector3(x, DROP_HEIGHT, z), DOWN);

    /*
     * Землёй считается только рельеф карты. Инстансы — деревья, скалы,
     * постройки — луч встречает первыми, и без этого отбора маршрут
     * укладывался бы по кронам: замер дал точки на высоте 5 юнитов там,
     * где земля на 1,1. Для фигур на башнях отбор снимается: там как раз
     * нужна верхушка постройки.
     */
    const targets = scene.children.filter(
      (child) =>
        !child.name.startsWith('__') &&
        child !== figures.object &&
        (onto === 'props' || !(child as THREE.InstancedMesh).isInstancedMesh),
    );

    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length === 0) return null;

    /*
     * Дозору нужна не земля, а дорога: местами лента идёт мостом над
     * оврагом, и высота рельефа под ней ниже настила на восемь десятых
     * юнита — семь ростов фигуры. Ищем попадание в саму ленту, и только
     * если её здесь нет (лента рваная), падаем на рельеф.
     */
    if (onto === 'road') {
      const road = hits.find((hit) => {
        const mesh = hit.object as THREE.Mesh;
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        const name = Array.isArray(material) ? material[0]?.name : material?.name;
        return name === 'Path';
      });
      if (road) return +road.point.y.toFixed(3);
    }

    /*
     * Первое попадание — не обязательно земля: дорога местами идёт под
     * мостом, и луч сверху ложится на его настил (замер дал 5,0 там, где
     * земля на 1,1). Поэтому из всех попаданий берётся ближайшее к той
     * высоте, которую в этой точке ожидает сетка оболочки.
     */
    // Для построек берётся самое верхнее попадание: там и нужен настил
    // башни, а не земля под ней.
    if (onto === 'props') return +hits[0]!.point.y.toFixed(3);

    /*
     * `top` — верх рельефа, то есть ровно та поверхность, которую видно.
     * Именно она нужна фигуре: правило «ближе к ожиданию сетки» у обрывов
     * промахивается на ярус и сажает скелета по плечи в землю.
     */
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

  /**
   * Подводит камеру к стычке. Без имени — к следующей по кругу.
   *
   * Камеру надо сперва забрать у рига: он держит взгляд на станции и каждый
   * кадр возвращает его туда. Без этого камера доезжает до боя и тут же
   * уплывает обратно.
   */
  function goToBattle(id?: string): string | null {
    const list = figures.battles();
    if (list.length === 0) return null;

    const battle = id
      ? list.find((item) => item.id === id)
      : list[((++battleCursor % list.length) + list.length) % list.length];
    if (!battle) return null;

    const view = battleView(battle);

    /*
     * Купол не пускает камеру вниз: он висит над рельефом примерно на 0,6
     * юнита, и поставленная под него камера тут же выталкивается вверх вместе
     * со своей целью — взгляд сохраняется, а бой уезжает под нижний край
     * кадра. Поэтому камера сразу ставится над куполом, а не под ним.
     */
    const ceiling = shellHeightAt(view.at[0], view.at[2]);
    const y = ceiling === null ? view.at[1] : Math.max(view.at[1], ceiling + 0.01);

    rig.cancel();
    rig.setStationLook(false);
    rig.setControlMode('orbit');

    camera.position.set(view.at[0], y, view.at[2]);
    controls.target.set(view.look[0], view.look[1], view.look[2]);
    controls.update();
    return battle.id;
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
    const дев = process.env.NODE_ENV === 'development';
    const tuning = дев ? listFigures() : [];
    const dropped = дев ? new Set(droppedFigures()) : new Set<string>();

    const byId = new Map(worldFigures.map((figure) => [figure.id, figure]));
    for (const figure of tuning) byId.set(figure.id, figure);
    for (const id of dropped) byId.delete(id);

    return figures.show([...byId.values()]);
  }

  void refreshFigures();
  // Дозоры не подбираются вживую: их маршруты сняты с дорог карты и лежат в
  // данных, поэтому здесь один вызов без черновиков.
  void figures.walk(worldPatrols);
  // Стычки — та же история: площадки замерены инструментом и лежат в данных.
  void figures.fight(worldBattles);

  // --- Цикл ---------------------------------------------------------------

  const clock = new THREE.Clock();
  const probeClock = new THREE.Clock();
  let frame = 0;
  let timeTarget = 0;
  let frames = 0;
  let frameSeconds = 0;

  let running = true;

  /**
   * Один кадр мира: движение на заданную дельту и отрисовка.
   *
   * Вынесено из `tick`, чтобы кадр можно было попросить снаружи. Это нужно не
   * миру, а проверке: браузер без окна (снимок в headless, скрытая вкладка)
   * не поднимает `requestAnimationFrame`, и сцена стоит на первом кадре —
   * фигура застывает в позе привязки, а не в той, которую ей поставили.
   */
  function frameOf(delta: number) {
    // Камеру двигает риг — здесь только кадр.
    rig.update(delta);
    tornado?.update(delta);
    pots?.update(delta);
    figures.update(delta, camera);
    wind.advance(delta);
    water.advance(delta);

    /*
     * Путь считается после рига и до отрисовки: камера уже там, где будет в
     * этом кадре, — иначе подписи и дорожка отставали бы от неё на кадр, и на
     * быстром ходу это видно.
     *
     * Пролёт главы не засчитывает. Маршрут проходит над чужими регионами —
     * дорога ко Flexy идёт поверх Huntio, — и без этой проверки перелёт к
     * первой главе отмечал пройденной третью, а дорожка после посадки вела уже
     * к четвёртой. Пройдено то, где посетитель стоял сам, а не то, над чем его
     * пронесли.
     */
    if (!rig.flying) {
      const reached = advanceChapter(passed, [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ]);

      if (reached !== passed) {
        passed = reached;
        onChapter?.(passed);
      }
    }
    markers.update(camera);

    advanceIdle(delta);
    advanceLight(delta);

    // После рига: книга ставится по камере, а камеру только что подвинули.
    book.update(camera);
    composer.render();
  }

  function tick() {
    frame = requestAnimationFrame(tick);

    // Замерший мир не рисует: приоритет владельца решает `registry.ts`.
    if (!running) return;

    // Канвас нулевого размера ломает OrbitControls: он делит угол поворота на
    // высоту элемента, и при нуле в позицию камеры попадает NaN — навсегда.
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) return;

    if (Date.now() >= timeTarget) {
      frameOf(clock.getDelta());

      timeTarget += FRAME_MS;
      if (Date.now() >= timeTarget) timeTarget = Date.now();
    }

    // Проба производительности: тени гасим всегда, качество AO — по замеру.
    const probe = probeClock.getDelta();
    if (frames < PROBE_FRAMES && loaded) {
      frames++;
      frameSeconds += probe;
      if (frames >= PROBE_FRAMES) {
        renderer.shadowMap.enabled = false;
        if (frameSeconds / frames > SLOW_FRAME_SECONDS) {
          aoParameters.samples = 8;
          gtaoPass.updateGtaoMaterial(aoParameters);
        }
      }
    }

    renderer.info.reset();
  }

  tick();

  const observer = new ResizeObserver(() => applySize());
  observer.observe(canvas);

  function dispose() {
    /*
     * Книга разбирается до общего обхода сцены: её `dispose` снимает объект с
     * родителя, иначе обход прошёлся бы по её геометрии и материалам вторым
     * разом — а лист и его изнанка делят одну геометрию на двоих.
     */
    book.dispose();

    for (const event of ['pointerdown', 'wheel', 'keydown'] as const) {
      window.removeEventListener(event, wakeUp);
    }

    markers.dispose();

    tornado?.dispose();
    tornado = null;
    pots?.dispose();
    pots = null;
    // До общего обхода сцены: клоны фигур делят геометрию с моделью, и разбирать
    // её должен тот, кто знает, что она одна на всех.
    figures.dispose();
    clearObstacleField();
    // Пометки держат свои текстуры: общий обход сцены их не разберёт.
    clearMarks(scene);
    clearRoute(scene);
    clearRoute(scene, '__dev_peak');
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener('keydown', onDevKey);

    rig.dispose();

    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) disposeMaterial(mesh.material);
    });
    scene.clear();

    // Сцена книги к этому моменту пуста: `book.dispose` снял с неё объект. Свет
    // видеопамяти не держит, но оставлять его в живой сцене после разбора мира
    // незачем.
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
    route: {
      get passed() {
        return passed;
      },
      target: () => {
        const chapter = pathTarget(passed, [
          camera.position.x,
          camera.position.y,
          camera.position.z,
        ]);
        const zone = chapter ? zoneOf(chapter.positionId) : null;
        if (!chapter || !zone) return null;

        return { positionId: chapter.positionId, shot: zone.arrival };
      },
    },
    setControlMode: rig.setControlMode,
    setMoveSpeed: rig.setMoveSpeed,
    shell: {
      settings: shellSettings,
      setVisible: (visible: boolean) => {
        shellSettings.visible = visible;
        refreshShellMesh();
      },
      // Отступ читается прямо в `shellHeightAt`, поэтому на коллизии он влияет
      // сразу — пересобрать нужно только показанный меш.
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
    marks: {
      show: (name: string) => markInstances(scene, name),
      clear: () => clearMarks(scene),
      route: () => {
        const main = flightPath().map((point) => ({
          label: point.label,
          at: point.shot.at,
        }));
        const peak = peakFlight().map((point) => ({
          label: point.label,
          at: point.shot.at,
        }));

        // Ветка к вершине идёт своим цветом: она не часть маршрута карьеры.
        const drawn = markRoute(scene, main, { color: 0x7ef7ff });
        return drawn + markRoute(scene, peak, { color: 0xffb45e, name: '__dev_peak' });
      },
      clearRoute: () => {
        clearRoute(scene);
        clearRoute(scene, '__dev_peak');
      },
    },
    figures: {
      place: (patch?: FigurePatch) => {
        // Точка по умолчанию — куда смотрит камера: подводишь вид и ставишь.
        const target = controls.target;
        const figure = placeFigure([target.x, target.y, target.z], patch);
        void refreshFigures();
        return figure;
      },
      tweak: (id: string, patch: FigurePatch) => {
        const figure = tweakFigure(id, patch);
        if (figure) void refreshFigures();
        return figure;
      },
      list: listFigures,
      placed: figures.placed,
      /** Фигура по имени — хоть из данных, хоть из черновика. */
      find: (id: string) => figures.placed().find((figure) => figure.id === id) ?? null,
      /**
       * Берёт фигуру из данных в черновик, чтобы её можно было двигать.
       * Уже черновую возвращает как есть.
       */
      adopt: (id: string) => {
        const figure = figures.placed().find((item) => item.id === id);
        return figure ? adoptFigure(figure) : null;
      },
      goToPatrol: (id: string) => {
        const patrol = figures.patrols().find((item) => item.id === id);
        const lead = figures.object.getObjectByName(`${id}-1`);
        if (!patrol || !lead) return false;

        lead.updateWorldMatrix(true, false);
        const place = lead.getWorldPosition(new THREE.Vector3());

        // Дракона видно и издалека, человека — нет: отступ считаем от роста.
        const away = Math.max(patrol.height * 4, 0.35);
        rig.cancel();
        rig.setStationLook(false);
        rig.setControlMode('orbit');

        camera.position.set(place.x + away, place.y + away * 0.7, place.z + away);
        controls.target.set(place.x, place.y + patrol.height / 2, place.z);
        controls.update();
        return true;
      },
      goToBattle,
      battles: figures.battles,
      goTo: (id: string) => {
        const figure = figures.placed().find((item) => item.id === id);
        if (!figure) return false;

        const [x, y, z] = figure.at;
        // Смотрим с трёх ростов сбоку и чуть сверху: видно и фигуру, и землю
        // под ней — а по земле и правят.
        const away = figure.height * 3;

        /*
         * Камеру надо сперва забрать у рига: он держит взгляд на станции и
         * каждый кадр возвращает его туда. Без этого камера доезжает до фигуры
         * и тут же уплывает обратно.
         */
        rig.cancel();
        rig.setStationLook(false);
        rig.setControlMode('orbit');

        camera.position.set(x + away, y + away * 0.6, z + away);
        controls.target.set(x, y + figure.height / 2, z);
        controls.update();
        return true;
      },
      remove: (id: string) => {
        const removed = removeFigure(id);
        if (removed) void refreshFigures();
        return removed;
      },
      clear: () => {
        clearFigures();
        void refreshFigures();
      },
      /**
       * Весь мир целиком, а не только правки: вставляется в `world-figures.ts`
       * на место массива. Иначе, поправив пять фигур из ста шести, автор
       * потерял бы остальные сто одну.
       */
      export: () => formatFigures(figures.placed()),
      count: figures.count,
      patrols: figures.patrols,
      groundAt: (x: number, y: number) => {
        aimAt(x, y);

        // Место под курсором ищем по сетке оболочки: ответ за микросекунды,
        // а при перетаскивании его спрашивают на каждое движение мыши.
        const point = traceGround(
          raycaster.ray.origin,
          raycaster.ray.direction,
          (px, pz) => {
            const ceiling = shellHeightAt(px, pz);
            return ceiling === null ? null : ceiling - shellSettings.padding;
          },
        );
        if (!point) return null;

        /*
         * А высоту берём лучом по видимой поверхности. Сетка висит над рельефом
         * и у террас указывает на соседний ярус: по её высоте фигура вставала
         * на три юнита ниже земли — по плечи в склоне.
         */
        const top = surfaceAt(point.x, point.z, 'top');

        return [+point.x.toFixed(3), +(top ?? point.y).toFixed(3), +point.z.toFixed(3)];
      },
      pickAt: (x: number, y: number) => {
        aimAt(x, y);
        return figures.pick(raycaster);
      },
      blockedAt: obstacleHeightAt,
      dropAll: (x: number, z: number) => {
        raycaster.set(new THREE.Vector3(x, DROP_HEIGHT, z), DOWN);
        const targets = scene.children.filter(
          (child) =>
            !child.name.startsWith('__') &&
            child !== figures.object &&
            !(child as THREE.InstancedMesh).isInstancedMesh,
        );

        return raycaster
          .intersectObjects(targets, true)
          .filter((hit) => {
            const material = (hit.object as THREE.Mesh).material as
              THREE.Material | THREE.Material[] | undefined;
            const name = Array.isArray(material) ? material[0]?.name : material?.name;
            return name === 'Path';
          })
          .map((hit) => +hit.point.y.toFixed(3));
      },
      dropAt: surfaceAt,
    },
    /*
     * Собирается при первом обращении, а не при создании мира: инстансы
     * приходят асинхронно, и след объектов, снятый сразу, был бы пустым.
     */
    get crowd() {
      return crowd();
    },
    /*
     * Тоже лениво: индекс ленты собирается по геометрии карты, а она приходит
     * загрузкой. Собранный при создании мира индекс был бы пустым.
     */
    get patrols() {
      patrolTools ??= createPatrolTools({
        scene,
        // След инстансов у заселения: иначе центровка загоняет дозор в куст,
        // который прежний маршрут обходил стороной.
        blocked: (x, z) => crowd().blocking(x, z),
      });
      return patrolTools;
    },
    /* Тоже лениво и по той же причине: земля приходит загрузкой карты. */
    get battles() {
      battleTools ??= createBattleTools({
        scene,
        blocked: (x, z) => crowd().blocking(x, z),
        // Видимая поверхность, а не земля: под стенами Лейндела земля есть, но
        // стоять там нельзя — сверху ярус террасы.
        surfaceAt: (x, z) => surfaceAt(x, z, 'top'),
      });
      return battleTools;
    },
    shots: {
      save: (name?: string) => {
        const shot = saveShot(camera, controls.target, name);
        // Ракурс объявляет себя проходимым сам: иначе следующий кадр вытолкнет
        // камеру из вида, который только что сохранили.
        applyPockets();
        return shot;
      },
      list: listShots,
      go: (name: string) => {
        const shot = applyShot(name, camera, controls.target);
        // Без `update` контрол вернёт камеру в свои прежние координаты.
        if (shot) controls.update();
        return shot;
      },
      remove: (name: string) => {
        const removed = removeShot(name);
        if (removed) applyPockets();
        return removed;
      },
      clear: () => {
        clearShots();
        applyPockets();
      },
      export: exportShots,
    },
    /**
     * Прокрутить мир вручную: столько-то секунд подряд кадрами по `stride`.
     *
     * Дев-ручка для проверки без окна. Кадры мельче секунды нужны потому, что
     * миксер получает дельту как есть: одним скачком в тридцать секунд клип
     * проматывается насквозь, и поза выходит не та, что была бы в этот миг.
     */
    step: (seconds: number, stride = 1 / 30) => {
      for (let done = 0; done < seconds; done += stride) {
        frameOf(Math.min(stride, seconds - done));
      }
      // Часы копят время, пока мир стоял: без сброса первый живой кадр после
      // прокрутки получит дельту в минуты.
      clock.getDelta();
    },
    setRunning: (next: boolean) => {
      if (next === running) return;
      running = next;
      // Часы копят время простоя: без сброса первый кадр после паузы получает
      // дельту в несколько секунд и швыряет камеру.
      if (next) clock.getDelta();
    },
    dispose,
  };
}

export { shellSettings };
