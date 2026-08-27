/**
 * Книга-резюме: носимый предмет мира.
 *
 * Не отдельная сцена поверх мира и не объект ландшафта. Ландшафт отпадает по
 * замеру: габариты из GLB дают масштаб примерно 1 юнит ≈ 40 метров (`grace`
 * 0.052 юнита, `divine_tower` 7.2), значит книга в честную величину — 0.006
 * юнита при ближней плоскости отсечения 0.1. Её физически нельзя увидеть.
 * Поэтому книга живёт как предмет в руках: размер подобран под кадр, а не под
 * ландшафт, и держится в 0.35 юнита от глаза — втрое дальше отсечения.
 *
 * Книга — обычный объект сцены, а не ребёнок камеры: `scene.add(camera)` в
 * `scene.ts` нет, и дети камеры не отрисовались бы вовсе — рендерер обходит
 * сцену. Матрица собирается из `camera.matrixWorld` каждый кадр. Заодно это
 * оставляет камеру во владении `camera-rig` (D3) и позволяет прятать книгу
 * отдельно от мира на отдельных проходах.
 *
 * Своего источника света у книги нет намеренно. `numPointLights` входит в ключ
 * кэша шейдерных программ, а в сцене сейчас ноль точечных источников: добавить
 * один — перекомпилировать все 148 материалов мира в момент первого показа.
 * Вместо света страница светится сама через `emissiveMap`, отчего ещё и
 * читается одинаково во всех регионах, независимо от их освещения.
 */

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
  STOWED,
} from './metrics';
import { frameHalf, keptInFrame, worldPerPixel } from './placement';
import { createBookPointer } from './pointer';
import { createSheet } from './sheet';
import { spinStep, unwound } from './spin';
import { createTab } from './tab';

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
   *
   * Текст резюме от языка не зависит и остаётся русским — так решено для всего
   * портфолио.
   */
  locale?: () => Locale;
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
  /**
   * Пролистывает книгу до разворота подсказок, раскрывая её при нужде.
   *
   * Отдельно от `next`/`previous`: те листают на один разворот, а этот проходит
   * всю дорогу до закладки — стопкой листов за полторы секунды, сколько бы
   * разворотов ни лежало между.
   */
  guide: () => void;
  /**
   * Перерисовывает страницы после смены языка.
   *
   * Отдельной командой, а не проверкой в кадре: язык меняют раз в сеанс, а
   * сверять его шестьдесят раз в секунду пришлось бы всегда.
   */
  relabel: () => void;
  /** Индекс текущего разворота. */
  readonly spread: number;
  readonly spreadCount: number;
  /** Идёт ли переворот. */
  readonly turning: boolean;
  /**
   * Двигает книгу. Зовётся из цикла сцены рядом с `rig.update`.
   *
   * Времени не берёт: плавные величины ведёт `motion` своим ходом, здесь их
   * только читают и раскладывают по костям и шарнирам.
   */
  update: (camera: THREE.Camera) => void;
  /** Сколько слотов текстур создано. Для замера в приёмке. */
  readonly textureSlots: number;
  /**
   * Строительные леса: заморозка переворота и замер проекций.
   *
   * Есть только в разработке — переворот идёт секунду с четвертью, и разобрать
   * его глазами нельзя. В боевой сборке поля нет.
   */
  debug?: BookDebug;
  dispose: () => void;
};

export function createBook({
  renderer,
  canvas,
  reducedMotion,
  locale,
}: BookOptions): Book {
  const layout = spreads();
  const pool: PagePool = createPagePool(renderer);

  const object = new THREE.Object3D();
  object.name = 'book';
  // Матрицу собираем сами из матрицы камеры — автоматическое обновление тут
  // только затирало бы её.
  object.matrixAutoUpdate = false;

  const body = createBody(object);
  const { left, right, seam } = body;

  // Закладка стоит над правой страницей. Мишень отнимает часть щелчка,
  // листающего вперёд, — но правая половина у раскрытой книги на виду, а
  // левая уходит от зрителя, и закладка на ней читалась хуже.
  const tab = createTab(right.pivot, 1);
  const guide = guideSpread(layout);

  // --- Листающийся лист ----------------------------------------------------

  const frontMaterial = createPageMaterial(THREE.FrontSide);
  const backMaterial = createPageMaterial(THREE.BackSide);

  /*
   * Листающийся лист всегда рисуется поверх лежащих страниц.
   *
   * Просветом этого не добиться: шарнир листа стоит у корешка, и там его
   * подъём равен нулю по определению — на доле 0.12 внешний край уже в 0.074
   * над страницей, а внутренний всего в 0.0009. А страница под листом на этой
   * же доле переключается на новую, и у корешка сходятся две почти совпадающие
   * плоскости с разным текстом: они просвечивают друг сквозь друга.
   *
   * Смещение глубины решает это независимо от расстояния между плоскостями —
   * штатный приём для наклеек поверх поверхности.
   */
  for (const material of [frontMaterial, backMaterial]) {
    material.polygonOffset = true;
    /*
     * Множитель — ноль, смещение только постоянное.
     *
     * `polygonOffsetFactor` домножается на наклон глубины полигона. У корешка
     * лист согнут круче всего, наклон там наибольший, и множитель раздувает
     * смещение непропорционально. Лицо и изнанка листа лежат в одной плоскости,
     * и при разбухшем смещении изнанка способна пробить лицо — а на изнанке
     * лежит левая страница следующего разворота.
     */
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

  // --- Состояние -----------------------------------------------------------

  /**
   * Доля переноса: книга едет из угла кадра в позу чтения, не раскрываясь.
   *
   * Отдельно от раскрытия, потому что это два разных движения, разделённых
   * паузой: том сперва подъезжает целиком, даёт прочитать обложку и только
   * потом расходится крышками.
   */
  const travel = { carried: 0 };

  /**
   * Доля раскрытия крышек. Её ведёт только `motion`, прямых записей сюда нет —
   * и это обязательное условие, а не стиль. См. `flip` ниже.
   */
  const opening = { raised: 0 };

  /**
   * Доля текущего переворота. Объект создаётся заново на каждый переворот.
   *
   * Причина в устройстве `motion`: она держит своё кэшированное значение в
   * `MotionValue` и, если цель совпадает с этим кэшем, **пропускает анимацию
   * целиком** — `visual-element-target.mjs`, ветка «If the value is already at
   * the defined target, skip the animation». Прямая запись в поле объекта её
   * кэш не трогает. Пока переворот сбрасывал долю присваиванием, первый шёл
   * честные 1.25 с, а каждый следующий отрабатывал мгновенно: цель 1 совпадала
   * с кэшем 1. Свежий объект — свежий `MotionValue`, и сравнивать не с чем.
   *
   * Хранилище `motion` — `WeakMap`, так что выброшенные объекты собираются.
   */
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

    // Отработавшие снимаем: иначе список растёт на каждое раскрытие и
    // переворот и живёт до разбора сцены.
    void control.then(() => {
      const index = running.indexOf(control);
      if (index >= 0) running.splice(index, 1);
    });

    return control;
  };

  /** Разворот по индексу с зажимом: за края книги выходить некуда. */
  const spreadAt = (index: number): BookSpread =>
    layout[Math.min(Math.max(index, 0), layout.length - 1)]!;

  /**
   * Нарисованная страница разворота.
   *
   * Язык входит в ключ, а не сбрасывает пул: посетитель, переключивший язык
   * туда и обратно, получает свои страницы из слотов, а не ждёт четырёх новых
   * заливок в видеопамять.
   */
  const facePage = (index: number, side: PageSide) => {
    const page = spreadAt(index);
    const language = locale?.() ?? 'ru';
    // Колонцифра с единицы: страницы «ноль» в книгах не бывает.
    const number = index * 2 + (side === 'left' ? 1 : 2);
    return pool.acquire(`${language}:${index}:${side}`, (context) =>
      drawPage(context, { spread: page, side }, number, translator(language)),
    );
  };

  /**
   * Места ссылок на страницах разворота, лежащих перед посетителем.
   *
   * Держим отдельно от пула: пул знает страницу по ключу, а щелчок приходит по
   * половине книги — и связать одно с другим больше негде.
   */
  const hotspots: Record<PageSide, readonly PageHotspot[]> = { left: [], right: [] };

  /** Размер холста страницы: по нему координаты текстуры переводятся в пиксели. */
  const PAGE_SIZE = { width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX };

  /**
   * Раскладывает текстуры по четырём видимым сторонам.
   *
   * Обе подмены происходят, пока лист лежит на стопке и закрывает её собой:
   * правая — в начале переворота, левая — в самом конце. Открытую страницу
   * подменять нельзя, это видно вспышкой чужого текста.
   *
   * Совпадения плоскостей у корешка бояться не нужно: там шарнир, подъём листа
   * равен нулю по определению, и порядок держит не просвет, а смещение глубины
   * на материалах листа.
   */
  const assign = () => {
    if (!fonts) return;

    const faces = spreadFaces({ spread, turning, direction });

    const put = (material: THREE.MeshStandardMaterial, texture: THREE.Texture) => {
      if (material.emissiveMap === texture) return;

      /*
       * `needsUpdate` — только при появлении карты, а не при смене текстуры на
       * уже занятом слоте. Шейдерная программа зависит от того, есть карта или
       * нет, а не от того, какая: подмена текстуры перекомпиляции не требует, а
       * лишний флаг заставлял three пересобирать шейдер прямо в кадре.
       */
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

    // Обе стороны листа получают текстуры разом или не получают вовсе: вне
    // переворота лист скрыт, и рисовать на нём нечего.
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

  /**
   * Пара «перенос + раскрытие» текущего хода.
   *
   * Раскрытие ждёт своей очереди по задержке, и если ход перебить на полпути —
   * закрыть книгу, пока она ещё едет, — отложенная анимация всё равно бы
   * сработала и крышки разошлись бы у убранной книги. Поэтому следующий ход
   * начинается с остановки предыдущего.
   */
  let course: { stop: () => void }[] = [];

  const take = (...controls: { stop: () => void }[]) => {
    for (const control of course) control.stop();
    course = controls;
  };

  /**
   * Распрямление накрученного поворота.
   *
   * Книга едет в позу чтения и по дороге разворачивается к зрителю: читать
   * боком нельзя. Объект доли каждый раз новый — по той же причине, что и у
   * переворота: `motion` пропустила бы анимацию, увидев цель равной кэшу.
   */
  let straighten: { share: number } | null = null;

  /** Пускает книгу распрямляться с того поворота, где её оставили. */
  const straightenOut = () => {
    const share = { share: 1 };
    straighten = share;
    unwindFrom.copy(spin);

    const control = run(share, { share: 0 }, seconds(CARRY_SECONDS), 'easeOut');

    void control.then(() => {
      // Ход могли перебить следующим: тогда распрямляет уже не этот.
      if (straighten !== share) return;
      straighten = null;
      spin.identity();
    });

    return control;
  };

  /**
   * Раскрывает книгу и обещает раскрытие.
   *
   * Обещание нужно пролистыванию: листать закрытую книгу нельзя, а раскрытие
   * идёт две секунды с лишним — переносом, паузой на обложке и разведением
   * крышек.
   */
  const open = (): Promise<void> => {
    if (opened) return Promise.resolve();
    opened = true;
    prepare();

    // Пауза на обложке: книга уже приехала, крышки ещё сомкнуты.
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

    // Обратный ход без паузы: обложку уже показали, и задерживать возврат
    // значит держать зрителя.
    take(
      run(opening, { raised: 0 }, seconds(OPEN_SECONDS), 'easeOut'),
      /*
       * Распрямление и на закрытии: у раскрытой книги поворот уже нулевой, но
       * закрыть могли посреди раскрытия — тогда книга уезжает в угол
       * недокрученной и там залипает боком.
       */
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

  /**
   * Переворачивает один лист и обещает конец перехода.
   *
   * Длительность — параметр, а не константа: в пачке листы идут в несколько
   * раз быстрее одиночного переворота, иначе дорога до закладки занимает
   * полминуты.
   */
  const turn = (next: 1 | -1, duration = FLIP_SECONDS): Promise<void> => {
    if (turning || !opened) return Promise.resolve();

    const target = spread + next;
    if (target < 0 || target >= layout.length) return Promise.resolve();

    direction = next;
    turning = true;

    /*
     * Доля идёт от того края, у которого лист лежит сейчас: вперёд — от правой
     * стопки к левой (0 → 1), назад — обратно (1 → 0). Объект каждый раз
     * новый, иначе `motion` пропустит анимацию, увидев цель равной своему кэшу.
     */
    const progress = { value: next === 1 ? 0 : 1 };
    flip = progress;
    assign();

    /*
     * Кривая `easeInOut`, а не `easeOut`. У прежней `[0.22, 1, 0.36, 1]` лист
     * проходил 98 % пути за первые три четверти времени и потом полсекунды
     * доползал последние два процента — со стороны это читалось зависанием в
     * воздухе. Страница живой книги идёт наоборот: трогается медленно,
     * разгоняется в середине и укладывается.
     */
    return run(
      progress,
      { value: next === 1 ? 1 : 0 },
      seconds(duration),
      'easeInOut',
    ).then(() => {
      // Переворот могли перебить следующим: тогда завершать нечего.
      if (flip !== progress) return;

      spread = target;
      turning = false;
      flip = null;
      assign();
    });
  };

  /** Идёт ли пролистывание пачкой. */
  let riffling = false;

  /**
   * Пролистывает книгу до нужного разворота.
   *
   * Листами, а не подменой: книга — предмет, и дорога до заложенной страницы
   * видна в ней руками. Мгновенный скачок стоил бы дешевле, но отнимал бы у
   * закладки ровно то, ради чего её открывают.
   *
   * Закрытую книгу сперва раскрывает и ждёт крышек: листать сомкнутый том
   * нечем.
   */
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
        // Последний лист укладывается медленнее прочих — на нём книга и
        // останавливается.
        const last = Math.abs(target - spread) === 1;
        await turn(step, last ? plan.settle : plan.pace);

        // Переворот могли перебить — например, закрыть книгу посреди дороги.
        // Без этой проверки цикл крутился бы вхолостую до конца сессии.
        if (spread === from) break;
      }
    } finally {
      riffling = false;
    }
  };

  // --- Кадр ----------------------------------------------------------------

  const pose = new THREE.Matrix4();
  const from = new THREE.Quaternion().setFromEuler(STOWED.rotation);
  const to = new THREE.Quaternion().setFromEuler(READING.rotation);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  /**
   * Поворот, накрученный посетителем поверх позы.
   *
   * Живёт в системе координат камеры — там же, где стоит книга, — поэтому оси
   * протяжки экранные и остаются такими, куда бы ни смотрел мир.
   */
  const spin = new THREE.Quaternion();

  /** С какого поворота книга распрямляется при раскрытии. */
  const unwindFrom = new THREE.Quaternion();

  /**
   * Где книга лежит в углу кадра. Поначалу — там, куда её поставила `STOWED`.
   *
   * Переставленное место держится и после раскрытия: книга возвращается туда,
   * где её оставили. А вот в позу чтения оно не едет — по мере переноса
   * смещение сходит на нет вместе с ним, иначе разворот читался бы из угла.
   */
  const placed = new THREE.Vector3().copy(STOWED.position);

  /** Камера последнего кадра: по ней стреляют лучом указателя и леса. */
  let aim: THREE.Camera | null = null;

  const update = (camera: THREE.Camera) => {
    aim = camera;

    /*
     * Угол кадра зажимается каждый кадр, а не только при протяжке.
     *
     * Поза убранной книги задана в юнитах, а видимый прямоугольник зависит от
     * пропорций окна: на 1100×1500 половина тома уходила за боковую кромку, и
     * открыть его было нечем — кнопка книгу раскрывает, а не ищет. Зажим
     * возвращает его к краю кадра, каким бы этот край ни был.
     */
    keepStowedInFrame(camera);

    /*
     * Книга на кадре всегда. Закрытый том лежит в углу — по нему и щёлкают,
     * чтобы открыть, — поэтому снимать его с отрисовки нельзя: скрытый меш
     * ловит луч наравне со всеми, но показать себя уже не может.
     */
    position.lerpVectors(placed, READING.position, travel.carried);
    rotation.slerpQuaternions(from, to, travel.carried);

    // Пока книга едет раскрываться, накрученный поворот сходит на нет.
    if (straighten) spin.copy(unwound(unwindFrom, straighten.share));

    // Кручение поверх позы, а не вместо неё: поза ставит книгу в кадр, поворот
    // вертит её в руках.
    rotation.premultiply(spin);
    pose.compose(position, rotation, one);

    object.matrix.multiplyMatrices(camera.matrixWorld, pose);

    // Раскрытие: левая половина отходит от правой через корешок, следом
    // укладывается корешок.
    body.pose(opening.raised);

    if (frozen !== null) {
      sheet.setProgress(frozen);
    } else if (turning && flip) {
      // Доля уже идёт в нужную сторону: разворачивать её здесь не нужно.
      sheet.setProgress(flip.value);
    }

    sheet.setVisible(frozen !== null || turning);

    object.updateMatrixWorld(true);

    // Сферы отсечения устаревают, пока лист гнётся: без пересчёта луч
    // перестаёт попадать в него ровно в середине переворота.
    if (turning) sheet.refreshBounds();
  };

  // --- Указатель -----------------------------------------------------------

  /**
   * Камера с перспективой — или `null`, если камера в сцене иная.
   *
   * Цену пикселя даёт только угол обзора, а он есть у `PerspectiveCamera` и
   * отсутствует у ортографической. Общего типа с полем `fov` в three нет, а
   * признак в её типах объявлен литералом `true`, поэтому проверка идёт через
   * `in`: обычной камере это поле не достаётся ни от класса, ни от прототипа.
   */
  const lens = (camera: THREE.Camera): THREE.PerspectiveCamera | null =>
    'isPerspectiveCamera' in camera ? (camera as THREE.PerspectiveCamera) : null;

  /**
   * Возвращает убранный том в кадр, если тот в него не помещается.
   *
   * Считается по глубине убранной позы, а не по текущей: в позе чтения книга
   * стоит посреди кадра, и зажимать там нечего — а `placed` продолжает жить
   * своей глубиной и ждёт закрытия.
   */
  const keepStowedInFrame = (camera: THREE.Camera) => {
    const perspective = lens(camera);
    if (!perspective) return;

    const inside = keptInFrame(
      placed,
      frameHalf(-placed.z, perspective.fov, perspective.aspect),
      CLOSED_RADIUS,
    );

    placed.set(inside.x, inside.y, placed.z);
  };

  /**
   * Переставляет книгу в плоскости кадра.
   *
   * Глубину протяжка не трогает: книга держится на своём расстоянии от глаза,
   * а по кадру ходит ровно за указателем — цена пикселя считается по углу
   * обзора и высоте канваса.
   */
  const shift = (dx: number, dy: number) => {
    const camera = aim && lens(aim);
    const height = canvas.clientHeight;
    if (!camera || height === 0) return;

    const depth = -placed.z;
    const step = worldPerPixel(depth, camera.fov, height);

    // Экран считает вниз, мир — вверх, отсюда знак у вертикали.
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
    targets: [...body.targets, tab.mesh],
    // Пока идёт переворот, книга кликов не принимает: второй лист поднимать
    // некуда, а перебитый переворот заканчивается подменой текстур на виду.
    ready: () => !turning && !riffling,
    /*
     * Двигают только закрытый том. У раскрытой книги протяжка ничего не делает:
     * страница под углом нечитаема, а половины и без того листаются кликом.
     */
    draggable: () => !opened && straighten === null,
    drag: (dx, dy, moving) => {
      if (moving) shift(dx, dy);
      else spin.premultiply(spinStep(dx, dy));
    },
    pick: (part, uv) => {
      const target: PickTarget =
        part === tab.mesh ? 'tab' : body.isLeft(part) ? 'left' : 'right';

      /*
       * Ссылку ищем только на бумаге и только по попаданию с развёрткой: у
       * крышки координаты ведут в атлас обложки, и мишень оттуда пришлась бы
       * на случайную строку.
       */
      const hotspot =
        uv && body.isPage(part) && target !== 'tab'
          ? hotspotAt(hotspots[target], { u: uv.x, v: uv.y }, PAGE_SIZE)
          : null;

      // Само правило живёт в `input.ts` и проверяется тестом: у него семь
      // исходов, и ошибка в нём видна только тем, что книга не слушается.
      switch (pickAction({ opened, spread, link: hotspot !== null }, target)) {
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
        case 'guide':
          void riffleTo(guide);
          return;
        case 'link':
          if (hotspot) openLink(hotspot.href);
          return;
      }
    },
  });

  // --- Строительные леса ----------------------------------------------------

  /**
   * Замереть переворот на доле или отпустить.
   *
   * Анимацию не запускает: лист поднимается и получает текстуры, но долю задают
   * снаружи. Живёт здесь, а не в `debug.ts`, потому что меняет ход переворота —
   * это дело книги, а не инструмента.
   */
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
            { name: 'tab', mesh: tab.mesh },
          ],
          tab: { pose: tab.pose, nudge: tab.nudge },
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

      /*
       * Каждый узел разбирает своё: пул — холсты страниц, корпус — свои
       * геометрии, материалы и текстуру шва, лист — свои. Здесь остаются
       * только материалы листа: их делает сборка, потому что к ним привязано
       * смещение глубины.
       */
      pool.dispose();
      body.dispose();
      tab.dispose();
      sheet.dispose();
      frontMaterial.dispose();
      backMaterial.dispose();

      object.removeFromParent();
      object.clear();
    },
  };
}
