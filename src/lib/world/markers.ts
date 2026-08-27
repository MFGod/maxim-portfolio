/**
 * Подписи мира: главы карьеры и проекты рядом с ними.
 *
 * Не инструмент, в отличие от `dev-markers.ts`, — часть мира, и потому устроена
 * иначе. Инструмент вешает номера на все инстансы вида, чтобы точку можно было
 * назвать вслух; здесь подписаны ровно те места, что лежат в `world-places.ts`,
 * и подписаны словами из резюме.
 *
 * Спрайты, а не разметка поверх канваса. Подпись обязана стоять у своей точки,
 * когда камера ходит и вертится, а DOM-метка требовала бы проецировать
 * координаты каждый кадр и всё равно опаздывала бы на кадр от картинки.
 *
 * Размер не зависит от расстояния (`sizeAttenuation: false`): подпись главы —
 * это указатель, а не предмет ландшафта, и с обзорной высоты она должна
 * читаться так же, как с земли. Глубина не пишется и не проверяется: указатель
 * за холмом нужен ровно затем, чтобы знать, что глава там.
 */

import * as THREE from 'three';

import { PAGE_PALETTE } from './book/draw';
import { planMarkers, type MarkerLabel } from './route';

const GROUP = 'world-markers';

/** Высота подписи над точкой, в юнитах мира. */
const LIFT = { chapter: 1.5, project: 0.7 };

/**
 * Доля высоты кадра, которую занимает подпись.
 *
 * Подобрано вживую. Высота задаёт кегль, ширина растёт по тексту — и у длинных
 * названий проектов («Цифровой архив индустриального наследия») на 0.022 буквы
 * садились до предела читаемости.
 */
const SCALE = { chapter: 0.032, project: 0.026 };

const FONT = {
  chapter: '600 40px Inter, system-ui, sans-serif',
  project: '400 34px Inter, system-ui, sans-serif',
};

/** Высота холста подписи и поля вокруг текста, в пикселях. */
const CANVAS_HEIGHT = 64;
const PADDING = 18;

/**
 * Насколько камера должна сдвинуться, чтобы пересчитать проявленность.
 *
 * Растворение считается по расстоянию до благодати, а оно за кадр меняется на
 * сотые доли юнита. Пересчёт на каждом кадре — семнадцать подписей, каждая с
 * поиском по резюме, — ради разницы, которой не видно.
 */
const RESTEP = 0.25;

export type Markers = {
  /** Обновляет проявленность подписей по месту камеры. Зовётся из кадра. */
  update: (camera: THREE.Camera) => void;
  dispose: () => void;
};

type Plate = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
};

/**
 * Табличка с текстом на прозрачном холсте.
 *
 * Ширина считается по тексту: у фиксированной длинные названия обрезались бы
 * посередине. Пропорции холста возвращаются вместе с текстурой — спрайту нужно
 * то же соотношение сторон, иначе буквы растянет.
 */
function plateTexture(
  text: string,
  font: string,
): { texture: THREE.CanvasTexture; ratio: number } {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('мир: холст подписи не дал двумерный контекст');

  context.font = font;
  const width = Math.ceil(context.measureText(text).width) + PADDING * 2;
  canvas.width = width;
  canvas.height = CANVAS_HEIGHT;

  // Размер холста сбрасывает контекст: шрифт задаём заново.
  context.font = font;

  /*
   * Тёмная подложка под светлым текстом, а не текст сам по себе. Небо мира
   * светлое, трава светлая, камень серый — буквы без подложки пропадают на
   * первом же повороте камеры, и подобрать цвет, читаемый на всех трёх, нельзя.
   */
  context.fillStyle = 'rgba(28, 26, 22, 0.78)';
  context.beginPath();
  context.roundRect(0, 4, width, CANVAS_HEIGHT - 8, 10);
  context.fill();

  context.fillStyle = PAGE_PALETTE.paper;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, CANVAS_HEIGHT / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, ratio: width / CANVAS_HEIGHT };
}

function createPlate(label: MarkerLabel, kind: 'chapter' | 'project'): Plate {
  const { texture, ratio } = plateTexture(label.text, FONT[kind]);

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    // Подпись — указатель, а не предмет: она видна сквозь холм, но и не мешает
    // тому, что за ней, лечь в буфер глубины.
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
    // Туман до подписей не достаёт: они не часть ландшафта.
    fog: false,
  });

  const sprite = new THREE.Sprite(material);
  const scale = SCALE[kind];
  sprite.scale.set(scale * ratio, scale, 1);
  sprite.position.set(label.at[0], label.at[1] + LIFT[kind], label.at[2]);
  /*
   * Отсечение по пирамиде выключено: у спрайта без ослабления по расстоянию
   * габарит в мировых единицах крошечный, и с обзорной высоты three выбрасывает
   * подпись, которая на экране занимает половину строки.
   */
  sprite.frustumCulled = false;
  sprite.renderOrder = 2;

  return { sprite, material, texture };
}

/**
 * Ставит подписи в мир.
 *
 * Спрайты рождаются один раз на всю жизнь сцены: их семнадцать, а появление и
 * угасание — это прозрачность, а не пересборка. Пересобирать их на каждом входе
 * в регион значило бы заливать текстуры в видеопамять посреди прогулки.
 */
export function createMarkers(parent: THREE.Object3D): Markers {
  const group = new THREE.Group();
  group.name = GROUP;
  parent.add(group);

  /** Таблички порознь: у главы и проекта разные правила показа. */
  const chapters = new Map<string, Plate>();
  const projects = new Map<string, Plate>();
  const at: [number, number, number] = [0, 0, 0];

  /*
   * Подписи ждут шрифт.
   *
   * Холст не ждёт загрузки веб-шрифта: если тот ещё не готов, текст молча
   * ложится запасным начертанием — и остаётся таким навсегда, потому что
   * табличка рисуется один раз и живёт до разбора сцены. Мир создаётся на
   * старте страницы, гонка со шрифтом здесь настоящая.
   *
   * Поэтому таблички рождаются не раньше, чем `Inter` доедет: до тех пор
   * подписей просто нет — секунда без них честнее, чем сеанс с чужим
   * начертанием. Та же причина, что у `fontsReady` в `book/draw.ts`.
   */
  let fonts = typeof document === 'undefined' || !document.fonts;

  if (!fonts) {
    void Promise.all(Object.values(FONT).map((font) => document.fonts.load(font)))
      .catch(() => undefined)
      .then(() => {
        fonts = true;
      });
  }

  /*
   * Таблички рождаются по требованию: до первого подхода к главе метки её
   * проектов не нужны, а холст с текстурой стоит памяти. Зато однажды созданные
   * больше не исчезают — по региону ходят взад-вперёд, и вторая заливка была бы
   * платой за то же самое.
   */
  const plateOf = (
    label: MarkerLabel,
    kind: 'chapter' | 'project',
    store: Map<string, Plate>,
  ): Plate => {
    const known = store.get(label.id);
    if (known) return known;

    const plate = createPlate(label, kind);
    store.set(label.id, plate);
    group.add(plate.sprite);
    return plate;
  };

  const show = (plate: Plate, share: number) => {
    plate.material.opacity = share;
    plate.sprite.visible = share > 0;
  };

  let last: THREE.Vector3 | null = null;

  const update = (camera: THREE.Camera) => {
    if (!fonts) return;

    const eye = camera.position;
    // Первый кадр после шрифта считается всегда: до него табличек не было
    // вовсе, и порог сдвига оставил бы мир без подписей до первого шага.
    if (last && eye.distanceTo(last) < RESTEP) return;

    last = last ? last.copy(eye) : eye.clone();

    at[0] = eye.x;
    at[1] = eye.y;
    at[2] = eye.z;

    const plan = planMarkers(at);

    for (const label of plan.chapters) show(plateOf(label, 'chapter', chapters), 1);

    // Гасим всё, чего в плане нет: план приносит только проекты включённого
    // региона, а погасить прежние больше некому.
    for (const plate of projects.values()) show(plate, 0);
    for (const label of plan.projects) {
      show(plateOf(label, 'project', projects), label.share);
    }
  };

  return {
    update,
    dispose: () => {
      for (const plate of [...chapters.values(), ...projects.values()]) {
        plate.texture.dispose();
        plate.material.dispose();
      }
      chapters.clear();
      projects.clear();
      group.removeFromParent();
      group.clear();
    },
  };
}
