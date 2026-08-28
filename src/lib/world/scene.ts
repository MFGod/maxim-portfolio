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

import { worldFigures } from '@/data/world-figures';
import { worldBattles } from '@/data/world-battles';
import { worldPatrols } from '@/data/world-patrols';
import { zoneOf, type WorldShot } from '@/data/world-shots';
import type { Locale, ResolvedTheme } from '@/lib/settings/types';

import { TILES, WORLD_ASSETS } from './assets';
import { createBook, type Book } from './book';
import { MAP_BOUNDS } from './bounds';
import { createCameraRig, type CameraRig, type ControlMode } from './camera-rig';
import { clipToBounds } from './clip-map';
import type { WorldDevDrafts, WorldDevTools } from './dev-console';
import { createFigures, type Figures } from './figures';
import { DAY, daylightFor, mixDaylight, type Daylight } from './daylight';
import { loadWaves } from './loading';
import { driftYaw, idlePhase, type IdlePhase } from './idle';
import { createErdlight } from './erdlight';
import { createFallen, waterSurface, type Fallen } from './fallen';
import { createLeaves, crownsOf, treesOf } from './leaves';
import { createMoon, type Moon } from './moon';
import { advanceChapter, pathTarget } from './route';
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
   * Книгу раскрыли или закрыли.
   *
   * Щелчок по тому ловит сама книга, а не оболочка: без этого сообщения нижняя
   * дорожка глав оставалась бы на кадре под раскрытым разворотом.
   */
  onBook?: (opened: boolean) => void;
  /**
   * Мир ушёл в облёт или вернулся из него.
   *
   * Хранителю экрана нужен пустой кадр: панели поверх ролика читаются
   * забытым интерфейсом, а не миром. Убирает их интерфейс сам — сцена только
   * сообщает, что началось.
   */
  onRest?: (resting: boolean) => void;
  /**
   * Мир не собрался: не приехала геометрия, без которой показывать нечего.
   *
   * Раньше этого сообщения не было, и отказ загрузки не обрабатывался вовсе —
   * промис загрузки просто отклонялся в пустоту, `onLoaded` не наступал, и
   * посетитель оставался на полосе загрузки навсегда. Любой сетевой сбой на
   * двадцати мегабайтах карты выглядел как зависший сайт.
   *
   * Зовётся только на отказе первой волны — рельефа и ориентиров. Россыпь
   * приезжает уже поверх живого мира, и её потеря сообщения не стоит.
   */
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
  /**
   * Путь по главам: что пройдено и куда вести дальше.
   *
   * Прогресс считает мир, а не интерфейс: до главы доходят и пешком, минуя
   * нижнюю полосу. Интерфейсу остаётся спросить, куда лететь.
   */
  /**
   * Экранное затенение: мягкая тень в углах и щелях.
   *
   * Вынесено в переключатель, потому что это самая дорогая часть кадра —
   * замер на M4 даёт 8.8 мс из 21.4, сорок один процент. Посетителю на слабой
   * машине выгоднее отдать эти миллисекунды плавности; проба качества гасит
   * затенение и сама, но её решение можно перебить вручную.
   */
  occlusion: {
    readonly enabled: boolean;
    set: (enabled: boolean) => void;
  };
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
  /**
   * Инструменты подбора: пометки, расстановка, заселение, дозоры, стычки,
   * ракурсы. `null`, пока их не подключили, и всегда `null` в прод-сборке.
   */
  readonly dev: WorldDevTools | null;
  /**
   * Подключает инструменты подбора к живому миру.
   *
   * Зовётся снаружи и только в разработке. Сцена не импортирует `dev-console`
   * сама намеренно: статический импорт утащил бы шесть модулей `dev-*` в
   * прод-бандл, где они не нужны и невидимы. Поэтому фабрику передают внутрь, а
   * сцена отдаёт ей свои внутренности и запоминает результат.
   *
   * Повторный вызов возвращает уже подключённые инструменты: слушатели клавиш
   * вешаются один раз.
   */
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

/**
 * Внутренности мира, которые нужны инструментам подбора.
 *
 * Это узкая дверь, а не открытая сцена: инструменты получают ровно те замеры и
 * ручки, из которых собирают всё остальное сами. Список растёт неохотно — что
 * попало сюда, то потом нельзя поменять, не тронув `dev-console`.
 */
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

/**
 * Откуда пускается луч вниз при расстановке: выше самой высокой горы карты.
 *
 * Открыт наружу ради `dev-console`: замеры высот делает он, а высота начала
 * луча — свойство карты, и держать её в двух местах значит однажды разойтись.
 */
export const DROP_HEIGHT = 40;

/** Кадр фиксированной длительности, как в форке. */
const FRAME_MS = 1000 / 60;

/** Через столько кадров решаем, тянет ли машина тени и полную постобработку. */
const PROBE_FRAMES = 100;

/**
 * Сколько первых кадров проба пропускает.
 *
 * На них компилируются шейдерные программы, заливаются текстуры и строится
 * карта теней: они дороже установившихся в разы и говорят не о машине, а о
 * старте. Замеряя их, проба видела «медленно» даже там, где кадр укладывается
 * вдвое, и резала качество зря.
 */
const PROBE_WARMUP = 40;

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
    onBook,
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

  /**
   * Потолок площади кадра в пикселях.
   *
   * Замер на M4: тот же кадр стоит 23.6 мс при множителе 1.5 и 18.5 при 1.0 —
   * пять миллисекунд из двадцати трёх уходят на пиксели, которых на экране
   * ретины никто не считает. Потолок бьёт только по большим канвасам: окно
   * 1262×702 при множителе 1.5 даёт 2.0 Мпикс и проходит, полноэкранный
   * 1893×1053 — 4.5 Мпикс и получает множитель пониже.
   */
  const PIXEL_BUDGET = 2_400_000;

  const applySize = () => {
    const { width, height } = size();
    /*
     * Множитель — наименьшее из трёх: плотность экрана, потолок 1.5 и то, что
     * укладывается в бюджет площади. Ниже единицы не опускаемся: там начинается
     * не экономия, а мыло.
     */
    const budget = Math.sqrt(PIXEL_BUDGET / (width * height));
    const ratio = Math.max(Math.min(window.devicePixelRatio, 1.5, budget), 1);

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

  /*
   * Ключевой свет — лунный: то же направление, что у диска в небе, и тот же
   * холодный цвет. Диск ставится по этому же вектору (см. `createMoon` ниже),
   * поэтому тень в кадре всегда лежит от того светила, которое видно.
   */
  const dirLight = new THREE.DirectionalLight(DAY.moon.color, DAY.moon.intensity);
  dirLight.castShadow = true;
  /*
   * Мягкость тени — пять, а не двадцать пять.
   *
   * При двадцати пяти тень размазывалась до неразличимости: под кроной
   * оставалось пятно чуть темнее травы, и мир читался плоским. Пять оставляет
   * край мягким, но тень — тенью.
   */
  dirLight.shadow.radius = 5;
  dirLight.shadow.blurSamples = 8;
  /*
   * Карта теней считается один раз, а не каждый кадр.
   *
   * Луна в мире неподвижна, ветер до карты теней не доходит (её материал
   * глубины — своя подмена, см. `wind.ts`), а движущиеся фигуры ростом 0.117
   * тени почти не отбрасывают. Замер: пересчёт каждый кадр стоил 22.3 мс
   * против 18.2 мс с разовым — четыре миллисекунды даром.
   */
  dirLight.shadow.autoUpdate = false;
  dirLight.shadow.needsUpdate = true;
  /*
   * Смещение глубины: пока карта не отбрасывала тень, хватало одного `bias`.
   *
   * С тенью от самого рельефа он перестал спасать. Земля здесь разбита на
   * мелкие треугольники с плоскими нормалями, и каждый затенял сам себя:
   * вблизи трава покрывалась ровной сеткой, а на пологих склонах — широкими
   * полосами. Лечит это `normalBias` — он отодвигает точку вдоль нормали, а не
   * вдоль луча.
   *
   * Подобрано вживую по макро-кадру травы: на 0.03 сетка видна целиком, на
   * 0.05 слабеет, и только к 0.12 уходит. Столько же — примерно рост фигуры
   * (0.117), и это верхний предел: дальше от предмета начинает отрываться его
   * собственная тень.
   */
  dirLight.shadow.bias = -0.0004;
  dirLight.shadow.normalBias = 0.12;
  /*
   * Размер карты теней: восемь тысяч текселей там, где машина тянет
   * постобработку, четыре — где нет.
   *
   * Дело в ступени на краю тени. Окно карты в осях наклонного света выходит
   * 168 × 137 юнитов, и на 4096 это 0.041 юнита на тексель — вблизи край тени
   * читается лесенкой. Вдвое больше текселей делают ступень вдвое мельче
   * (0.021), и это единственный способ, который здесь сработал: `radius` при
   * PCF не действует вовсе (мягкий вариант объявлен устаревшим и подменяется
   * жёстким), а `VSMShadowMap` даёт мягкий край, но вместе с ним — волнистые
   * разводы на пологой траве.
   *
   * Плата — видеопамять: 8192² глубины это около 268 МБ против 67. Поэтому
   * размер идёт за тем же признаком, что и постобработка: слабой машине
   * достаётся прежняя карта, и тени на ней всё равно гаснут первыми.
   *
   * Времени это почти не стоит: карта снимается дважды за загрузку, замер
   * пересъёмки — 27 мс.
   */
  const shadowMapSize = postProcessing ? 8192 : 4096;
  dirLight.shadow.mapSize.width = shadowMapSize;
  dirLight.shadow.mapSize.height = shadowMapSize;
  dirLight.position.set(18, 40, 10);
  dirLight.target.position.set(-20, 0, -20);
  dirLight.frustumCulled = false;
  scene.add(dirLight);
  // Цель — в графе сцены: без неё `three` не обновляет её матрицу и считает,
  // что свет смотрит в начало координат.
  scene.add(dirLight.target);

  /**
   * Высоты, между которыми лежит всё, что отбрасывает тень.
   *
   * Считать по настоящему габариту сцены нельзя: ствол Эрдтри уходит вверх на
   * добрую сотню юнитов, и окно, растянутое на него, потеряло бы плотность.
   * Тридцать юнитов — выше любой стены Лейндела и любой кроны, шесть вниз —
   * ниже дна.
   */
  const SHADOW_SPAN = { low: -6, high: 30 };

  /**
   * Подгоняет окно карты теней под весь мир.
   *
   * Раньше границы стояли числами, и это было неверно дважды. Симметричное
   * окно предполагает, что мир центрирован около начала координат, — а он
   * лежит от −48 до 71.7 по X и от −76.6 до 38.2 по Z. И окно задаётся не в
   * мировых осях, а в осях света, который смотрит наискось: даже верно
   * подобранный по X и Z квадрат оказывается повёрнутым.
   *
   * Замер прежнего окна ±62: из восьми углов мира в него попадали три. Северо-
   * запад, восток и юго-восток лежали снаружи — там теней не было вовсе, ни от
   * рельефа, ни от деревьев.
   *
   * Поэтому границы считаются: восемь углов мира переводятся в оси света, и
   * окно берётся по их размаху. Оно же само собой сжимается до минимума —
   * плотность текселей выходит наибольшая из возможных для этой карты.
   */
  const fitShadowToWorld = () => {
    const camera = dirLight.shadow.camera;

    // Матрица света вручную: рендерер обновит её только в момент съёмки карты,
    // а границы нужны заранее.
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
          // Камера света смотрит вдоль −Z: глубина — это минус координата.
          near = Math.min(near, -corner.z);
          far = Math.max(far, -corner.z);
        }
      }
    }

    /*
     * Запас в два юнита по краям: границы мира — это границы обрезки, а
     * геометрия у самого края доходит до них вплотную, и окно впритык роняло
     * бы её тень на последних текселях.
     */
    const PAD = 2;

    camera.left = left - PAD;
    camera.right = right + PAD;
    camera.bottom = bottom - PAD;
    camera.top = top + PAD;
    // Ближнюю плоскость не поднимаем к самому первому углу: свет стоит выше
    // мира, и запас в юнит дешевле, чем срезанная верхушка стены.
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

  /**
   * Диск луны. Заводится ниже, вместе с подписями, но объявлен здесь: набор
   * освещения перекрашивает его, а первый набор ставится раньше, чем диск
   * появляется, — обращение к ещё не созданной `const` уронило бы сцену.
   */
  let moon: Moon | null = null;

  /*
   * Звёзды заводятся здесь же, до первого набора освещения: их яркость ведёт
   * тот же набор, и `const` ниже по файлу оказалась бы недоступна.
   */
  const stars = createStars(scene);

  /*
   * Золотые источники под кронами — здесь же и по той же причине: их силу ведёт
   * набор освещения. Пул заводится пустым, до прихода карты: новый источник
   * пересобирает шейдеры всех материалов, и платить этим лучше на загрузке.
   */
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

    minorErdtree.emissiveIntensity = value.emissive.erdtree;
    // Свет от кроны идёт за её же эмиссией: ночью золото ярче, днём бледнее.
    erdlight.setLight(value.emissive.erdtree);
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

  /*
   * Половинное разрешение затенения здесь пробовалось и убрано: на тридцати
   * кадрах разница составила 0.3–0.7 мс при разбросе замера в две — то есть
   * ничего. Цена прохода не в пикселях: он заново рисует всю геометрию сцены
   * в буфер нормалей — 255 отрисовок и 6.18 млн треугольников, ровно столько
   * же, сколько в основном проходе.
   */

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

  /**
   * Что не участвует в карте нормалей затенения.
   *
   * `GTAOPass` подменяет материал всей сцены своим и про отсечение по альфе не
   * знает: у листа на земле в буфер нормалей попадает весь квадрат плоскости,
   * а не силуэт. Вокруг каждого лежащего листа от этого стоял ровный светлый
   * прямоугольник — тень плитки, которой в кадре нет.
   *
   * Прятать на время прохода, а не чинить материал подмены: материал у прохода
   * один на всю сцену, и текстуру листа в него не занести, не раскрасив ею
   * рельеф. Затенение от листа толщиной в два сантиметра всё равно ничего не
   * добавляет — он берёт затенение земли, на которой лежит.
   */
  const outsideAmbientOcclusion: THREE.Object3D[] = [];

  const renderOcclusion = gtaoPass.render.bind(gtaoPass);
  gtaoPass.render = (
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) => {
    for (const object of outsideAmbientOcclusion) object.visible = false;
    renderOcclusion(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    for (const object of outsideAmbientOcclusion) object.visible = true;
  };

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
    // Черновик приходит от инструментов подбора и только в разработке: у
    // посетителя их нет, и дыр в куполе от чужого `localStorage` тоже.
    const tuning = drafts?.pockets() ?? [];
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
    /*
     * Тайл и отбрасывает тень, и принимает её.
     *
     * Прежде карта только принимала: тени шли лишь от инстансов — деревьев и
     * камней, — а скалы, стены и обрывы не отбрасывали ничего. В мире, где
     * половина силуэта это развалины Лейндела, отсутствие их теней и читалось
     * как «теней нет вовсе».
     */
    setShadow(gltf.scene, true, true);
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
   * Листья заводятся до потока загрузки, а не вместе с подписями: кроны им
   * раздаёт этот самый поток, а он идёт по файлу выше. Стая до раздачи
   * невидима — сыпать листья из точки, где ещё нет дерева, не из чего.
   */
  const leaves = createLeaves(scene, textureLoader, minorErdtree);

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
  /** Дошла ли загрузка до показа мира: после этого отказ уже не фатален. */
  let shown = false;

  void (async () => {
    for (const tile of TILES) {
      addTile(await loader.loadAsync(`${WORLD_ASSETS}/${tile}.glb`));
    }
    mark('map');

    /*
     * Карта теней снимается заново: до этого мига её снимали с пустой сцены.
     *
     * Свет заводится в начале, а мир приезжает через секунду. Разовый снимок
     * (`autoUpdate = false`) успевал сделаться раньше карты и оставался
     * пустым до конца жизни сцены — теней не было ни от чего. Пересъёмок
     * ровно столько, сколько волн: одна здесь, вторая после россыпи.
     */
    dirLight.shadow.needsUpdate = true;

    // Карманы и купол считаются по рельефу, а не по инстансам: можно сразу.
    applyPockets();
    refreshShellMesh();

    // Кроны есть только теперь: до карты сыпать листья неоткуда.
    const crowns = crownsOf(scene);
    leaves.seed(crowns);
    /*
     * Источникам — деревья, а не кроны: `crownsOf` отдаёт ячейки листвы, и у
     * крупного дерева их несколько. Листьям это на пользу — золото сыплется по
     * всей ширине кроны, — а пул из трёх источников уходил в одно дерево целиком.
     */
    erdlight.seed(treesOf(scene));

    /*
     * Ковёр под кронами. Стелется один раз и по точной высоте земли, а не по
     * куполу камеры: тот лежит выше рельефа, и листва висела бы над травой.
     */
    fallen = createFallen(scene, leaves.texture, crowns, scene, waterSurface(scene));
    outsideAmbientOcclusion.push(fallen.object);

    // Купол уже построен выше — отдаём листьям его высоты, чтобы они таяли
    // над землёй, а не уходили в неё.
    /*
     * Шаг вдвое мельче прежнего: клетка в полюнита вместо юнита.
     *
     * Высота в клетке берётся наименьшая — так «земля» не подвисает у обрыва,
     * — но на склоне это же занижает её на весь перепад внутри клетки. При
     * клетке в юнит лист успевал подойти к траве вплотную и встать в ней
     * торчком, потому что спрайт всегда развёрнут к камере. Полклетки
     * уменьшают занижение вдвое, а поле остаётся мелким: 240 × 230 клеток,
     * 220 КБ.
     */
    const ground = groundField(2);
    if (ground) leaves.useGround(ground);

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
    shown = true;

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

    // Вторая пересъёмка: россыпь пришла, и теперь в карте теней есть всё.
    dirLight.shadow.needsUpdate = true;

    loaded = true;
    mark('full');
  })().catch((error: unknown) => {
    /*
     * Отказ загрузки. Без этого перехвата промис отклонялся в пустоту: полоса
     * загрузки замирала на своём проценте и висела так до закрытия вкладки.
     *
     * Россыпь роняет только запись в консоль — мир к этому мигу уже показан и
     * работает, не хватает лишь кустов. А вот потеря рельефа или ориентиров
     * показывать нечего, и об этом обязан узнать интерфейс.
     */
    if (shown) {
      console.error('вторая волна мира не приехала', error);
      return;
    }

    console.error('мир не загрузился', error);
    onFailed?.(error);
  });

  // --- Книга ---------------------------------------------------------------

  /*
   * Книга — обычный объект сцены, а не ребёнок камеры: `scene.add(camera)`
   * здесь нет, и дети камеры не попали бы в обход рендерера вовсе. Свою
   * матрицу она собирает из `camera.matrixWorld` каждый кадр, отчего камера
   * остаётся во владении рига (D3), а книгу можно прятать отдельно от мира.
   */
  const book = createBook({
    renderer,
    canvas,
    reducedMotion,
    locale,
    onOpened: (open) => onBook?.(open),
  });
  bookScene.add(book.object);

  /*
   * Диск луны ставится по тому же направлению, что и ключевой свет: иначе
   * тени в кадре лягут не от того источника, который в нём виден.
   */
  moon = createMoon(scene, dirLight.position.clone().sub(dirLight.target.position));
  moon.setColor(lightTo.moon.disc);

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

  /** Направление замера: луч всегда идёт сверху вниз. */
  const DOWN = new THREE.Vector3(0, -1, 0);

  /**
   * Инструменты подбора и их черновики. Подключаются снаружи и только в
   * разработке — см. `attachDevTools`. В прод-сборке остаются `null`, и обе
   * пересборки, расстановки и купола, читают одни данные.
   */
  let devTools: WorldDevTools | null = null;
  let drafts: WorldDevDrafts | null = null;

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
    // Черновик приходит от инструментов подбора. Их нет — показываем данные
    // как есть: у посетителя подбирать нечего.
    const tuning = drafts?.figures() ?? [];
    const dropped = new Set(drafts?.dropped() ?? []);

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
  /** Затенение переключили вручную — проба качества его больше не трогает. */
  let occlusionLocked = false;

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
    leaves.advance(delta);

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
    moon?.update(camera);
    stars.update(camera, delta);
    // После рига: источники ставятся по ближайшим к камере кронам, а камеру
    // только что подвинули.
    erdlight.update(camera, delta);

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

    /*
     * Проба производительности: и тени, и качество AO — по замеру.
     *
     * Раньше тени гасились безусловно на сотом кадре, на любой машине. Мир от
     * этого читался плоской заливкой: объём в нём держат ровно они. Теперь
     * гаснут только там, где средний кадр не уложился в порог.
     */
    const probe = probeClock.getDelta();
    if (frames < PROBE_WARMUP + PROBE_FRAMES && loaded) {
      frames++;
      // Прогрев в среднее не входит: до него кадр говорит о старте, а не о
      // машине.
      if (frames > PROBE_WARMUP) frameSeconds += probe;

      const measured = frameSeconds / PROBE_FRAMES;
      if (frames >= PROBE_WARMUP + PROBE_FRAMES && measured > SLOW_FRAME_SECONDS) {
        /*
         * Деградация ступенями, от дешёвого к дорогому по вкладу в картину.
         *
         * Сперва вдвое реже считается затенение — его смягчение почти не
         * видно. Если и этого мало, гаснут тени: они дают объём, но без них
         * мир остаётся миром. Затенение выключается последним — по замеру оно
         * же и самое дорогое (8.6 мс из 18.4), и уходит целой ступенью.
         */
        aoParameters.samples = 8;
        gtaoPass.updateGtaoMaterial(aoParameters);

        if (measured > SLOW_FRAME_SECONDS * 1.6) {
          renderer.shadowMap.enabled = false;
        }

        /*
         * Затенение уходит последним и целой ступенью: по замеру на M4 оно
         * стоит 8.8 мс из 21.4 — сорок один процент кадра. Без него мир идёт
         * за 12.6 мс, то есть укладывается в шестьдесят кадров с запасом.
         */
        if (measured > SLOW_FRAME_SECONDS * 2.4 && !occlusionLocked) {
          gtaoPass.enabled = false;
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

    leaves.dispose();
    fallen?.dispose();
    fallen = null;
    outsideAmbientOcclusion.length = 0;
    moon?.dispose();
    moon = null;
    stars.dispose();
    erdlight.dispose();

    tornado?.dispose();
    tornado = null;
    pots?.dispose();
    pots = null;
    // До общего обхода сцены: клоны фигур делят геометрию с моделью, и разбирать
    // её должен тот, кто знает, что она одна на всех.
    figures.dispose();
    clearObstacleField();
    // Инструменты подбора снимают свои клавиши и разбирают пометки сами: их
    // текстуры общий обход сцены не заберёт, а знает о них только тот, кто
    // рисовал. В прод-сборке подключать нечего, и вызова не происходит.
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
    occlusion: {
      get enabled() {
        return gtaoPass.enabled;
      },
      set: (enabled: boolean) => {
        gtaoPass.enabled = enabled;
        // Выбор посетителя старше пробы: она больше не трогает затенение.
        occlusionLocked = true;
      },
    },
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
    get dev() {
      return devTools;
    },
    attachDevTools: (make) => {
      // Второй вызов не собирает инструменты заново: слушатели клавиш и
      // ленивые замеры живут по одному экземпляру на мир.
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

      // Черновики уже могут быть непустыми: подбор пережил перезагрузку в
      // `localStorage`, и мир поднялся без них.
      void refreshFigures();
      applyPockets();

      return devTools;
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
