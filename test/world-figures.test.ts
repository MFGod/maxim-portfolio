import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FIGURE_CLIPS,
  MAX_FIGURE_HEIGHT,
  MIN_FIGURE_HEIGHT,
  worldFigures,
  type WorldFigure,
} from '@/data/world-figures';
import {
  adoptFigure,
  clearFigures,
  DEFAULT_HEIGHT,
  droppedFigures,
  exportFigures,
  figuresFileBody,
  formatFigures,
  listFigures,
  placeFigure,
  removeFigure,
  tweakFigure,
} from '@/lib/world/dev-figures';
import {
  ANIMATION_RANGE,
  createFigures,
  DRAW_RANGE,
  traceGround,
} from '@/lib/world/figures';

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

/** Высота макета модели. Совпадать с настоящей (2,166) не обязательно. */
const MODEL_HEIGHT = 2;

/**
 * Подставной загрузчик: скиннинга здесь нет, но `SkeletonUtils.clone` работает
 * с любым деревом, а миксеру достаточно клипа, меняющего положение узла.
 */
function fakeLoader(onLoad?: () => void) {
  return {
    loadAsync: async () => {
      onLoad?.();
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, MODEL_HEIGHT, 0.5),
        new THREE.MeshBasicMaterial(),
      );
      mesh.name = 'body';
      mesh.position.y = MODEL_HEIGHT / 2;
      root.add(mesh);

      const track = new THREE.VectorKeyframeTrack(
        'body.position',
        [0, 1],
        [0, MODEL_HEIGHT / 2, 0, 0, MODEL_HEIGHT / 2 + 1, 0],
      );

      return { scene: root, animations: [new THREE.AnimationClip('Idle', 1, [track])] };
    },
  } as unknown as Parameters<typeof createFigures>[0]['loader'];
}

function figure(patch: Partial<WorldFigure> = {}): WorldFigure {
  return {
    id: 'один',
    role: 'gate',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [0, 0, 0],
    turn: 0,
    height: 0.08,
    ...patch,
  };
}

/** Камера, смотрящая в начало координат с расстояния `distance` по Z. */
function cameraAt(distance: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(65, 1.6, 0.01, 250);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

describe('данные расстановки', () => {
  it('у каждой фигуры своё имя, известная анимация и рост в пределах', () => {
    const ids = new Set<string>();

    for (const item of worldFigures) {
      expect(ids.has(item.id), `имя «${item.id}» занято дважды`).toBe(false);
      ids.add(item.id);

      expect(FIGURE_CLIPS).toContain(item.clip);
      expect(item.height).toBeGreaterThanOrEqual(MIN_FIGURE_HEIGHT);
      expect(item.height).toBeLessThanOrEqual(MAX_FIGURE_HEIGHT);
      expect(Number.isFinite(item.turn)).toBe(true);
    }
  });

  it('заморожены: расстановку нельзя править из сцены', () => {
    expect(Object.isFrozen(worldFigures)).toBe(true);
  });
});

describe('инструмент расстановки', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('ставит фигуру в точку взгляда и даёт ей имя по счётчику', () => {
    const placed = placeFigure([1.23456, 2, -3]);

    expect(placed.id).toBe('фигура-1');
    expect(placed.at).toEqual([1.235, 2, -3]);
    expect(placed.height).toBe(DEFAULT_HEIGHT);
    expect(listFigures()).toHaveLength(1);
  });

  it('нумерует по наибольшему занятому номеру, а не по длине списка', () => {
    placeFigure([0, 0, 0]);
    placeFigure([1, 0, 0]);
    removeFigure('фигура-1');

    expect(placeFigure([2, 0, 0]).id).toBe('фигура-3');
  });

  it('заменяет фигуру с тем же именем, а не плодит копии', () => {
    placeFigure([0, 0, 0], { id: 'страж' });
    placeFigure([5, 1, 5], { id: 'страж' });

    expect(listFigures()).toHaveLength(1);
    expect(listFigures()[0]!.at).toEqual([5, 1, 5]);
  });

  it('правит только переданные поля', () => {
    placeFigure([0, 0, 0], { id: 'страж', turn: 1 });
    const next = tweakFigure('страж', { height: 0.2 });

    expect(next).toMatchObject({ id: 'страж', turn: 1, height: 0.2, at: [0, 0, 0] });
  });

  it('держит рост в пределах: невидимая точка и фигура с башню одинаково бесполезны', () => {
    placeFigure([0, 0, 0], { id: 'мелкий', height: 0.0001 });
    placeFigure([0, 0, 0], { id: 'великан', height: 40 });

    expect(tweakFigure('мелкий', {})!.height).toBe(MIN_FIGURE_HEIGHT);
    expect(listFigures().find((item) => item.id === 'великан')!.height).toBe(
      MAX_FIGURE_HEIGHT,
    );
  });

  it('выбрасывает записи с неизвестной моделью или анимацией', () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        'world.dev.figures': JSON.stringify([
          figure({ id: 'годная' }),
          { ...figure({ id: 'чужая-модель' }), model: 'василиск' },
          { ...figure({ id: 'чужой-клип' }), clip: 'Backflip' },
          { ...figure({ id: 'без-точки' }), at: [0, 0] },
        ]),
      }),
    );

    expect(listFigures().map((item) => item.id)).toEqual(['годная']);
  });

  it('переживает отказ хранилища, а не роняет подбор', () => {
    vi.stubGlobal('localStorage', {
      ...fakeStorage(),
      setItem: () => {
        throw new Error('quota');
      },
    } as unknown as Storage);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => placeFigure([0, 0, 0])).not.toThrow();
  });

  it('выгружает готовый кусок для данных', () => {
    placeFigure([1, 2, 3], { id: 'страж', turn: 0.5, height: 0.1, clip: 'Taunt' });

    expect(exportFigures()).toBe(
      [
        '  {',
        "    id: 'страж',",
        "    model: 'skeleton_warrior',",
        "    clip: 'Taunt',",
        '    at: [1, 2, 3],',
        '    turn: 0.5,',
        '    height: 0.1,',
        '  },',
      ].join('\n'),
    );
  });

  it('берёт фигуру из данных в черновик и правит уже копию', () => {
    const исходная = figure({ id: 'башня-1', turn: 0, height: 0.117 });

    const копия = adoptFigure(исходная);
    expect(копия).toEqual(исходная);
    expect(listFigures()).toHaveLength(1);

    tweakFigure('башня-1', { turn: 1.2 });
    expect(listFigures()[0]!.turn).toBe(1.2);
    expect(исходная.turn).toBe(0);
  });

  it('усыновляет один раз: повторный вызов не затирает правку', () => {
    adoptFigure(figure({ id: 'страж', turn: 0 }));
    tweakFigure('страж', { turn: 2 });

    expect(adoptFigure(figure({ id: 'страж', turn: 0 })).turn).toBe(2);
    expect(listFigures()).toHaveLength(1);
  });

  it('снятую фигуру помнит по имени, даже если её не было в черновике', () => {
    expect(removeFigure('лагерь-7')).toBe(true);
    expect(droppedFigures()).toEqual(['лагерь-7']);
    expect(listFigures()).toEqual([]);
  });

  it('выгружает любой список, а не только черновик', () => {
    const текст = formatFigures([figure({ id: 'а', at: [1, 2, 3], turn: 0.5 })]);

    expect(текст).toContain("id: 'а'");
    expect(текст).toContain('at: [1, 2, 3]');
    expect(текст).toContain('turn: 0.5');
  });

  it('переписывает в файле только массив, шапку оставляет', () => {
    const было = [
      '/** Шапка с типами и объяснениями. */',
      "export const FIGURE_MODELS = { skeleton_warrior: 'a.glb' } as const;",
      '',
      'export const worldFigures: WorldFigure[] = deepFreeze([',
      "  { id: 'старая', model: 'skeleton_warrior', clip: 'Idle' },",
      ']);',
      '',
    ].join('\n');

    const стало = figuresFileBody(было, [figure({ id: 'новая', at: [1, 2, 3] })]);

    expect(стало).toContain('/** Шапка с типами и объяснениями. */');
    expect(стало).toContain('FIGURE_MODELS');
    expect(стало).toContain("id: 'новая'");
    expect(стало).not.toContain("id: 'старая'");
    expect(стало.endsWith(']);\n')).toBe(true);
  });

  it('без массива в файле сохранять отказывается', () => {
    expect(() => figuresFileBody('просто текст', [])).toThrow(/worldFigures/);
  });

  it('чистит расстановку разом', () => {
    placeFigure([0, 0, 0]);
    clearFigures();

    expect(listFigures()).toEqual([]);
    expect(exportFigures()).toBe('');
    expect(droppedFigures()).toEqual([]);
  });
});

describe('фигуры в сцене', () => {
  it('масштабирует модель под заданный рост и ставит по координатам', async () => {
    const figures = createFigures({ loader: fakeLoader() });
    await figures.show([figure({ at: [3, 1, -2], turn: 0.7, height: 0.1 })]);

    const root = figures.object.children[0]!;
    expect(figures.count()).toBe(1);
    expect(root.scale.x).toBeCloseTo(0.1 / MODEL_HEIGHT, 6);
    expect(root.position.toArray()).toEqual([3, 1, -2]);
    expect(root.rotation.y).toBeCloseTo(0.7, 6);
  });

  it('грузит модель один раз на любое число фигур', async () => {
    let loads = 0;
    const figures = createFigures({ loader: fakeLoader(() => void loads++) });
    await figures.show([figure({ id: 'а' }), figure({ id: 'б' }), figure({ id: 'в' })]);

    expect(figures.count()).toBe(3);
    expect(loads).toBe(1);
  });

  it('снимает прежний набор перед показом нового', async () => {
    const figures = createFigures({ loader: fakeLoader() });
    await figures.show([figure({ id: 'а' }), figure({ id: 'б' })]);
    await figures.show([figure({ id: 'в' })]);

    expect(figures.count()).toBe(1);
    expect(figures.object.children).toHaveLength(1);
    expect(figures.object.children[0]!.name).toBe('в');
  });

  it('перебитый показ не оставляет половину набора', async () => {
    const figures = createFigures({ loader: fakeLoader() });

    const stale = figures.show([figure({ id: 'а' }), figure({ id: 'б' })]);
    const fresh = figures.show([figure({ id: 'в' })]);
    await Promise.all([stale, fresh]);

    expect(figures.count()).toBe(1);
    expect(figures.object.children.map((child) => child.name)).toEqual(['в']);
  });

  it('не считает кости дальше предела дальности', async () => {
    const figures = createFigures({ loader: fakeLoader() });
    await figures.show([figure()]);

    const near = figures.object.children[0]!.getObjectByName('body')!.position.y;
    figures.update(0.5, cameraAt(ANIMATION_RANGE + 1));

    expect(figures.object.children[0]!.getObjectByName('body')!.position.y).toBe(near);
  });

  it('считает кости, когда фигура рядом и в кадре', async () => {
    const figures = createFigures({ loader: fakeLoader() });
    await figures.show([figure()]);

    const before = figures.object.children[0]!.getObjectByName('body')!.position.y;
    figures.update(0.5, cameraAt(1));

    expect(
      figures.object.children[0]!.getObjectByName('body')!.position.y,
    ).toBeGreaterThan(before);
  });

  it('не считает кости за краем кадра', async () => {
    const figures = createFigures({ loader: fakeLoader() });
    await figures.show([figure({ at: [0, 0, 3] })]);

    const before = figures.object.children[0]!.getObjectByName('body')!.position.y;
    figures.update(0.5, cameraAt(1));

    expect(figures.object.children[0]!.getObjectByName('body')!.position.y).toBe(
      before,
    );
  });

  it('не рисует фигуру дальше предела видимости', async () => {
    const figures = createFigures({ loader: fakeLoader() });
    await figures.show([figure()]);
    const root = figures.object.children[0]!;

    figures.update(0.1, cameraAt(DRAW_RANGE + 2));
    expect(root.visible).toBe(false);

    figures.update(0.1, cameraAt(1));
    expect(root.visible).toBe(true);
  });

  it('тени не отбрасывает: теневой проход стоит дороже самой фигуры', async () => {
    const figures = createFigures({ loader: fakeLoader() });
    await figures.show([figure()]);

    let casting = 0;
    figures.object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child.castShadow) casting++;
    });
    expect(casting).toBe(0);
  });

  it('при reduced motion возвращает фигуру в первую позу и держит её', async () => {
    let calm = false;
    const figures = createFigures({ loader: fakeLoader(), reducedMotion: () => calm });
    await figures.show([figure()]);

    const body = () => figures.object.children[0]!.getObjectByName('body')!.position.y;
    const start = body();

    figures.update(0.5, cameraAt(1));
    expect(body()).toBeGreaterThan(start);

    calm = true;
    figures.update(0.5, cameraAt(1));
    expect(body()).toBeCloseTo(start, 6);
  });

  it('разбирает набор и снимает узел со сцены', async () => {
    const scene = new THREE.Scene();
    const figures = createFigures({ loader: fakeLoader() });
    scene.add(figures.object);
    await figures.show([figure()]);

    figures.dispose();

    expect(figures.count()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});

describe('traceGround', () => {
  /** Плоскость на высоте 1, бесконечная по X и Z. */
  const flat = () => 1;

  it('находит землю под наклонным лучом', () => {
    const origin = new THREE.Vector3(0, 3, 0);
    const direction = new THREE.Vector3(1, -1, 0).normalize();

    const point = traceGround(origin, direction, flat);

    expect(point).not.toBeNull();
    expect(point!.y).toBeCloseTo(1, 6);
    expect(point!.x).toBeCloseTo(2, 3);
  });

  it('уточняет касание точнее собственного шага', () => {
    const slope = (x: number) => x * 0.5;
    const origin = new THREE.Vector3(0, 2, 0);
    const direction = new THREE.Vector3(1, -1, 0).normalize();

    const point = traceGround(origin, direction, slope)!;

    expect(point.x).toBeCloseTo(4 / 3, 3);
    expect(point.y).toBeCloseTo(2 / 3, 3);
  });

  it('за краем карты земли нет', () => {
    const origin = new THREE.Vector3(0, 3, 0);
    const direction = new THREE.Vector3(0, -1, 0);

    expect(traceGround(origin, direction, () => null)).toBeNull();
  });

  it('луч из-под земли не считается попаданием', () => {
    const origin = new THREE.Vector3(0, 0.5, 0);
    const direction = new THREE.Vector3(0, -1, 0);

    expect(traceGround(origin, direction, flat)).toBeNull();
  });

  it('не бьёт в землю за пределом дальности', () => {
    const origin = new THREE.Vector3(0, 3, 0);
    const direction = new THREE.Vector3(1, -0.001, 0).normalize();

    expect(traceGround(origin, direction, flat)).toBeNull();
  });
});
