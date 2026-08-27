import { readFileSync } from 'node:fs';

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { experience, projects } from '@/data/resume';
import { worldChapters } from '@/data/world-places';
import { requireAttribute } from '@/lib/world/book/attributes';
import { mapFaceToPanel, rimShade, turnFaceUV, wingAngles } from '@/lib/world/book/body';
import {
  CLOSED_RADIUS,
  CLOSED_THICKNESS,
  COVER_ATLAS,
  COVER_H,
  COVER_W,
  spinePose,
} from '@/lib/world/book/cover';
import { PAGE_PALETTE } from '@/lib/world/book/draw';
import { spreadFaces } from '@/lib/world/book/faces';
import { pickAction } from '@/lib/world/book/input';
import {
  BLOCK_T,
  BOARD_T,
  COVER_MARGIN,
  FLIP_SECONDS,
  GUTTER_DIP,
  OPEN_TILT,
  PAGE_H,
  PAGE_INSET,
  PAGE_W,
  PAPER_LIFT,
  READING,
  READING_MARGIN,
  RIFFLE_MIN,
  SHEET_CLEARANCE,
  STOWED,
  TAB_COLOR,
  TAB_INK,
} from '@/lib/world/book/metrics';
import { frameHalf, keptInFrame, worldPerPixel } from '@/lib/world/book/placement';
import { guideSpread, sheetCount, spreads } from '@/lib/world/book/plan';
import { rifflePlan } from '@/lib/world/book/riffle';
import { pageProfile } from '@/lib/world/book/profile';
import { createSheet } from '@/lib/world/book/sheet';
import { BONES, flipRotations, pageSkin, vertexBinding } from '@/lib/world/book/skin';
import { SPIN_TURN_PIXELS, spinStep, unwound } from '@/lib/world/book/spin';

describe('раскладка книги по разворотам', () => {
  const layout = spreads();

  it('книга открывается обложкой', () => {
    expect(layout[0]).toEqual({ kind: 'cover' });
  });

  it('у каждой позиции резюме есть титульный разворот', () => {
    const titled = layout
      .filter((spread) => spread.kind === 'chapter')
      .map((spread) => (spread.kind === 'chapter' ? spread.positionId : ''));

    expect(titled.toSorted()).toEqual(experience.map((item) => item.id).toSorted());
  });

  it('каждый проект получил свой разворот, и ровно один', () => {
    const placed = layout
      .filter((spread) => spread.kind === 'project')
      .map((spread) => (spread.kind === 'project' ? spread.slug : ''));

    expect(placed.toSorted()).toEqual(
      projects.map((project) => project.slug).toSorted(),
    );
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('главы идут в порядке маршрута, а не в порядке резюме', () => {
    const chapters = layout
      .filter((spread) => spread.kind === 'chapter')
      .map((spread) => (spread.kind === 'chapter' ? spread.positionId : ''));

    const route = [...worldChapters]
      .sort((a, b) => a.order - b.order)
      .map((chapter) => chapter.positionId);

    expect(chapters).toEqual(route);
  });

  it('проект стоит после титула своей главы, а не чужой', () => {
    let current: string | null = null;

    for (const spread of layout) {
      if (spread.kind === 'chapter') current = spread.positionId;
      if (spread.kind === 'project') expect(spread.positionId).toBe(current);
    }
  });

  it('листов бумаги столько же, сколько разворотов', () => {
    expect(sheetCount()).toBe(layout.length);
  });
});

describe('раскладка разворотов по граням', () => {
  /** Разворот в середине книги: с обеих сторон от него есть соседи. */
  const SPREAD = 3;

  it('вне переворота обе половины показывают один разворот, а лист пуст', () => {
    const faces = spreadFaces({ spread: SPREAD, turning: false, direction: 1 });

    expect(faces).toEqual({
      left: SPREAD,
      right: SPREAD,
      sheetFront: null,
      sheetBack: null,
    });
  });

  it('вне переворота направление ни на что не влияет', () => {
    // Направление хранит прошлый переворот и после него не сбрасывается: если
    // читать его без оглядки на `turning`, левая страница уедет на разворот
    // назад — с чужим текстом на виду.
    const faces = spreadFaces({ spread: SPREAD, turning: false, direction: -1 });

    expect(faces.left).toBe(SPREAD);
  });

  it('при перевороте вперёд лист уходит с текущего разворота на следующий', () => {
    const faces = spreadFaces({ spread: SPREAD, turning: true, direction: 1 });

    expect(faces).toEqual({
      left: SPREAD,
      right: SPREAD + 1,
      sheetFront: SPREAD,
      sheetBack: SPREAD + 1,
    });
  });

  it('при перевороте назад лист приходит с текущего разворота на предыдущий', () => {
    const faces = spreadFaces({ spread: SPREAD, turning: true, direction: -1 });

    expect(faces).toEqual({
      left: SPREAD - 1,
      right: SPREAD,
      sheetFront: SPREAD - 1,
      sheetBack: SPREAD,
    });
  });
});

describe('углы половин при раскрытии', () => {
  it('у закрытой книги левая половина лежит на правой лицом вниз', () => {
    const angles = wingAngles(0, OPEN_TILT);

    expect(angles.left).toBeCloseTo(Math.PI, 10);
  });

  it('у закрытой книги правая половина не наклонена', () => {
    const angles = wingAngles(0, OPEN_TILT);

    expect(angles.right).toBeCloseTo(0, 10);
  });

  it('у раскрытой книги обе половины подняты к зрителю на наклон', () => {
    // Знаки разные: половины расходятся от корешка домиком, а не заваливаются
    // обе в одну сторону.
    const angles = wingAngles(1, OPEN_TILT);

    expect(angles.left).toBeCloseTo(OPEN_TILT, 10);
    expect(angles.right).toBeCloseTo(-OPEN_TILT, 10);
  });

  it('левая половина идёт к раскрытию без возвратов', () => {
    let previous = Infinity;

    for (let step = 0; step <= 20; step++) {
      const angle = wingAngles(step / 20, OPEN_TILT).left;
      expect(angle).toBeLessThan(previous);
      previous = angle;
    }
  });
});

describe('развёртка обложки', () => {
  it('панели идут подряд и покрывают всю картинку', () => {
    const { back, spine, front } = COVER_ATLAS;

    expect([back.u0, back.u1, spine.u1, front.u1]).toEqual([0, spine.u0, front.u0, 1]);
  });

  it('крышки на развёртке одинаковой ширины', () => {
    const { back, front } = COVER_ATLAS;

    expect(back.u1 - back.u0).toBeCloseTo(front.u1 - front.u0, 10);
  });

  it('корешок на картинке той же доли, что и в геометрии переплёта', () => {
    // Главный сторож обложки. Панели режутся по пикселям, толщина книги растёт
    // из `metrics.ts`, и разъехаться им нельзя: рисунок поедет по граням.
    // Подменят текстуру с другими долями — упадёт здесь, а не на стенде.
    const { spine, front } = COVER_ATLAS;

    const onPicture = (spine.u1 - spine.u0) / (front.u1 - front.u0);
    const inBook = CLOSED_THICKNESS / COVER_W;

    expect(onPicture / inBook).toBeCloseTo(1, 2);
  });
});

describe('раскладка развёртки по граням коробки', () => {
  /** Грани `BoxGeometry` идут `+X, -X, +Y, -Y, +Z, -Z`; наружу смотрит `-Z`. */
  const OUTER = 5;

  /** Все UV одной грани, по номерам вершин из её группы. */
  const faceUv = (geometry: THREE.BoxGeometry, face: number) => {
    const uv = requireAttribute(geometry, 'uv');
    const index = geometry.getIndex()!;
    const group = geometry.groups[face]!;
    const seen = new Set<number>();

    for (let at = group.start; at < group.start + group.count; at++) {
      seen.add(index.getX(at));
    }

    return [...seen].map((vertex) => uv.getX(vertex));
  };

  it('внешняя грань уходит целиком в свой кусок развёртки', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);

    mapFaceToPanel(box, OUTER, COVER_ATLAS.front);

    // Сравнение приблизительное: UV лежат в `Float32`, а доли считаны в
    // двойной точности — совпадения до последнего знака тут не бывает.
    const us = faceUv(box, OUTER);
    expect(Math.min(...us)).toBeCloseTo(COVER_ATLAS.front.u0, 6);
    expect(Math.max(...us)).toBeCloseTo(COVER_ATLAS.front.u1, 6);
  });

  it('остальные грани остаются нетронутыми', () => {
    // Здесь ошибка стоит дорого и не видна на кадре: обложка отпечаталась бы
    // на торцах переплёта, а на них смотрят с ребра.
    const box = new THREE.BoxGeometry(1, 1, 1);

    mapFaceToPanel(box, OUTER, COVER_ATLAS.front);

    for (const face of [0, 1, 2, 3, 4]) {
      const us = faceUv(box, face);
      expect([Math.min(...us), Math.max(...us)]).toEqual([0, 1]);
    }
  });

  it('падает с внятной ошибкой, когда такой грани нет', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);

    expect(() => mapFaceToPanel(box, 6, COVER_ATLAS.front)).toThrow(/нет грани 6/);
  });
});

describe('насечка листов на торце блока', () => {
  /** Головка и хвост блока: `+Y` и `-Y`. */
  const HEAD = 2;
  const TAIL = 3;

  /** Пары UV одной грани, по номерам вершин из её группы. */
  const facePairs = (geometry: THREE.BoxGeometry, face: number) => {
    const uv = requireAttribute(geometry, 'uv');
    const index = geometry.getIndex()!;
    const group = geometry.groups[face]!;
    const seen = new Set<number>();

    for (let at = group.start; at < group.start + group.count; at++) {
      seen.add(index.getX(at));
    }

    return [...seen].map((vertex) => [uv.getX(vertex), uv.getY(vertex)]);
  };

  it('разворот меняет координаты грани местами', () => {
    // Насечка нарисована вдоль горизонтали холста. На головке и хвосте стопка
    // идёт по вертикали разметки, и без мены листы легли бы поперёк неё.
    const box = new THREE.BoxGeometry(1, 1, 1);
    const before = facePairs(box, HEAD);

    turnFaceUV(box, HEAD);

    expect(facePairs(box, HEAD)).toEqual(before.map(([u, v]) => [v, u]));
  });

  it('разворот не трогает остальные грани', () => {
    // Боковые обрезы разметка коробки устраивает как есть: у граней `±X`
    // горизонталь уже идёт вдоль толщины блока.
    const box = new THREE.BoxGeometry(1, 1, 1);
    const untouched = new THREE.BoxGeometry(1, 1, 1);

    turnFaceUV(box, HEAD);
    turnFaceUV(box, TAIL);

    for (const face of [0, 1, 4, 5]) {
      expect(facePairs(box, face)).toEqual(facePairs(untouched, face));
    }
  });

  it('разворот дважды возвращает грань как была', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const before = facePairs(box, TAIL);

    turnFaceUV(box, TAIL);
    turnFaceUV(box, TAIL);

    expect(facePairs(box, TAIL)).toEqual(before);
  });

  it('падает с внятной ошибкой, когда такой грани нет', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);

    expect(() => turnFaceUV(box, 6)).toThrow(/нет грани 6/);
  });

  it('середина стопки идёт без загустения', () => {
    // Иначе кромочная тень расползлась бы на весь торец и съела насечку.
    for (const share of [0.2, 0.5, 0.8]) {
      expect(rimShade(share)).toBe(0);
    }
  });

  it('у самых кромок насечка гуще всего и симметрично', () => {
    const left = rimShade(0);
    const right = rimShade(1);

    expect(left).toBeGreaterThan(0);
    expect(left).toBe(right);
    expect(left).toBeGreaterThan(rimShade(0.04));
    expect(rimShade(0.04)).toBeGreaterThan(rimShade(0.07));
  });
});

describe('кручение книги в руках', () => {
  /** Передняя крышка закрытой книги смотрит на зрителя, то есть в `+Z`. */
  const facing = () => new THREE.Vector3(0, 0, 1);

  it('протяжка вправо уводит переднюю крышку вправо', () => {
    const front = facing();

    front.applyQuaternion(spinStep(SPIN_TURN_PIXELS / 8, 0));

    expect(front.x).toBeGreaterThan(0);
  });

  it('протяжка вбок не заваливает книгу вверх или вниз', () => {
    // Оси экранные: вбок — рыскание вокруг вертикали, и только оно.
    const front = facing();

    front.applyQuaternion(spinStep(SPIN_TURN_PIXELS / 8, 0));

    expect(front.y).toBeCloseTo(0, 10);
  });

  it('протяжка вниз наклоняет верх книги к зрителю', () => {
    const top = new THREE.Vector3(0, 1, 0);

    top.applyQuaternion(spinStep(0, SPIN_TURN_PIXELS / 8));

    expect(top.z).toBeGreaterThan(0);
  });

  it('протяжка на полный оборот возвращает книгу в исходное положение', () => {
    const front = facing();

    front.applyQuaternion(spinStep(SPIN_TURN_PIXELS, 0));

    expect([front.x, front.y, front.z]).toEqual([
      expect.closeTo(0, 10),
      expect.closeTo(0, 10),
      expect.closeTo(1, 10),
    ]);
  });

  it('распрямлённая до конца книга смотрит прямо', () => {
    const turned = spinStep(SPIN_TURN_PIXELS / 3, SPIN_TURN_PIXELS / 5);

    const straight = unwound(turned, 0);

    expect(straight.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 10);
  });

  it('нераспрямлённая книга остаётся там, где её оставили', () => {
    const turned = spinStep(SPIN_TURN_PIXELS / 3, SPIN_TURN_PIXELS / 5);

    const held = unwound(turned, 1);

    expect(held.angleTo(turned)).toBeCloseTo(0, 10);
  });

  it('на середине распрямления книга повёрнута вполовину', () => {
    const turned = spinStep(SPIN_TURN_PIXELS / 4, 0);

    const half = unwound(turned, 0.5);

    expect(half.angleTo(new THREE.Quaternion())).toBeCloseTo(
      turned.angleTo(new THREE.Quaternion()) / 2,
      10,
    );
  });
});

describe('перестановка книги в кадре', () => {
  /** Убранная поза: книга в 0.9 юнита от глаза, угол обзора мира — 65°. */
  const DEPTH = 0.9;
  const FOV = 65;
  const FRAME_PIXELS = 720;

  /** Видимая высота на этой глубине, по той же формуле, что и позы. */
  const visibleHeight = 2 * DEPTH * Math.tan((FOV * Math.PI) / 180 / 2);

  it('протяжка во всю высоту кадра проносит книгу через весь кадр', () => {
    // Книга обязана идти ровно за указателем, а не «примерно рядом»: цена
    // пикселя считается из угла обзора, а не подбирается.
    const step = worldPerPixel(DEPTH, FOV, FRAME_PIXELS);

    expect(step * FRAME_PIXELS).toBeCloseTo(visibleHeight, 10);
  });

  it('вдвое дальше от глаза — вдвое крупнее шаг', () => {
    const near = worldPerPixel(DEPTH, FOV, FRAME_PIXELS);
    const far = worldPerPixel(DEPTH * 2, FOV, FRAME_PIXELS);

    expect(far).toBeCloseTo(near * 2, 10);
  });

  it('кадр нулевой высоты не даёт деления на ноль', () => {
    // Канвас приходит нулевым, пока вёрстка не посчитала высоту, — на этом
    // месте мир уже однажды получал NaN в позицию камеры, и навсегда.
    expect(worldPerPixel(DEPTH, FOV, 0)).toBe(0);
  });

  it('ширина кадра шире высоты во столько раз, каково соотношение сторон', () => {
    const half = frameHalf(DEPTH, FOV, 16 / 9);

    expect(half.width / half.height).toBeCloseTo(16 / 9, 10);
  });

  it('книга посреди кадра остаётся там, куда её поставили', () => {
    const frame = { width: 1, height: 0.6 };

    const kept = keptInFrame({ x: 0.3, y: -0.2 }, frame, CLOSED_RADIUS);

    expect(kept).toEqual({ x: 0.3, y: -0.2 });
  });

  it('книга упирается в край кадра, отступив на свой радиус', () => {
    // Утащить том за кадр нельзя: вернуть его оттуда нечем — кнопка открывает
    // книгу, а не ищет её.
    const frame = { width: 1, height: 0.6 };

    const kept = keptInFrame({ x: 5, y: -5 }, frame, CLOSED_RADIUS);

    expect(kept).toEqual({
      x: frame.width - CLOSED_RADIUS,
      y: -(frame.height - CLOSED_RADIUS),
    });
  });

  it('радиус закрытой книги накрывает её дальний угол', () => {
    /*
     * Сторож зажима. Начало координат книги — у корешка, половины стоят по одну
     * сторону от него, и «половина габарита» тут не работает: книга уже уезжала
     * за верхний край кадра, потому что отступ считали от середины тома.
     */
    const corner = Math.hypot(
      PAGE_W / 2 + COVER_W / 2,
      COVER_H / 2,
      CLOSED_THICKNESS / 2,
    );

    expect(CLOSED_RADIUS).toBeGreaterThanOrEqual(corner);
  });

  it('книга крупнее кадра прижимается к середине', () => {
    // Вырожденный случай: без зажима предел вышел бы отрицательным, и книгу
    // выбрасывало бы в противоположный угол.
    const kept = keptInFrame({ x: 2, y: 2 }, { width: 0.1, height: 0.1 }, 1);

    expect(kept).toEqual({ x: 0, y: 0 });
  });
});

describe('поза корешка', () => {
  it('у закрытой книги корешок стоит стенкой поперёк крышек', () => {
    const stand = spinePose(0);

    expect(stand.angle).toBeCloseTo(Math.PI / 2, 10);
  });

  it('у закрытой книги корешок приходит вплотную к краю крышек', () => {
    // Крышка шире страницы на `COVER_MARGIN` и центрована по её середине,
    // поэтому край переплёта уходит за корешок на половину припуска.
    const stand = spinePose(0);

    expect(stand.x + BOARD_T / 2).toBeCloseTo(-COVER_MARGIN / 2, 10);
  });

  it('у раскрытой книги корешок ложится плашмя', () => {
    const stand = spinePose(1);

    expect(stand.angle).toBeCloseTo(0, 10);
  });

  it('у раскрытой книги корешок уходит ниже крышек, а не вровень', () => {
    // Вровень две плоскости на одной глубине дерутся за буфер глубины: дно
    // жёлоба пошло бы полосами переплёта.
    const stand = spinePose(1);

    expect(stand.z + BOARD_T / 2).toBeLessThanOrEqual(-(BLOCK_T + BOARD_T));
  });

  it('доля за пределами отрезка зажимается', () => {
    expect([spinePose(-1), spinePose(2)]).toEqual([spinePose(0), spinePose(1)]);
  });
});

describe('привязка вершин листа к костям', () => {
  const WIDTH = 0.2;

  it('доли всегда дают в сумме единицу', () => {
    for (let step = 0; step <= 40; step++) {
      const x = -WIDTH / 2 + (WIDTH * step) / 40;
      const binding = vertexBinding(x, WIDTH, BONES);
      expect(binding.weight[0] + binding.weight[1]).toBeCloseTo(1, 10);
    }
  });

  it('вершина у корешка целиком на первой кости', () => {
    const binding = vertexBinding(-WIDTH / 2, WIDTH, BONES);
    expect(binding.index[0]).toBe(0);
    expect(binding.weight[0]).toBe(1);
  });

  it('вершина на внешнем краю целиком на последней кости', () => {
    const binding = vertexBinding(WIDTH / 2, WIDTH, BONES);
    expect(binding.index[0]).toBe(BONES - 1);
    expect(binding.weight[0]).toBe(1);
  });

  it('кость не убывает по мере удаления от корешка', () => {
    let previous = -1;

    for (let step = 0; step <= 40; step++) {
      const x = -WIDTH / 2 + (WIDTH * step) / 40;
      const index = vertexBinding(x, WIDTH, BONES).index[0];
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });

  it('одна кость — вырожденный случай, а не деление на ноль', () => {
    const binding = vertexBinding(0, WIDTH, 1);
    expect(binding).toEqual({ index: [0, 0], weight: [1, 0] });
  });

  it('атрибуты скиннинга дают по четыре числа на вершину', () => {
    const positions = [-0.1, 0, 0, 0, 0, 0, 0.1, 0, 0];
    const skin = pageSkin(positions, WIDTH, BONES);

    expect(skin.index).toHaveLength(12);
    expect(skin.weight).toHaveLength(12);

    for (let vertex = 0; vertex < 3; vertex++) {
      const sum = skin.weight[vertex * 4]! + skin.weight[vertex * 4 + 1]!;
      expect(sum).toBeCloseTo(1, 6);
    }
  });
});

describe('углы костей при перевороте', () => {
  const total = (progress: number) =>
    flipRotations(progress, BONES).reduce((sum, angle) => sum + angle, 0);

  it('в стопке лист плоский', () => {
    expect(flipRotations(0, BONES).every((angle) => angle === 0)).toBe(true);
  });

  it('в конце переворота лист повёрнут ровно на пол-оборота', () => {
    // Знак отрицательный: при положительном лист ныряет в −Z, внутрь
    // переплёта, и весь переворот проходит скрытым за корпусом книги.
    expect(total(1)).toBeCloseTo(-Math.PI, 10);
  });

  it('выгиб меняет форму листа, но не общий угол', () => {
    // Профиль выгиба симметричен и в сумме даёт ноль, поэтому на половине
    // переворота — ровно половина оборота, несмотря на максимальный выгиб.
    expect(total(0.5)).toBeCloseTo(-Math.PI / 2, 10);
  });

  it('весь поворот несёт шарнир у корешка, остальные кости только выгибают', () => {
    // Раздать поворот поровну нельзя: кости сдвинуты вдоль листа, и цепочка
    // свернётся в дугу вместо того, чтобы лечь на вторую стопку.
    const curls = (progress: number) => flipRotations(progress, BONES).slice(1);

    // На концах бумага плоская: гнуть её нечему.
    expect(curls(0).every((angle) => angle === 0)).toBe(true);
    expect(curls(1).every((angle) => Math.abs(angle) < 1e-12)).toBe(true);

    // В середине — выгнута.
    expect(curls(0.5).some((angle) => Math.abs(angle) > 0.05)).toBe(true);
  });

  it('угол растёт по модулю вместе с долей переворота', () => {
    let previous = -1;

    for (let step = 0; step <= 20; step++) {
      const angle = Math.abs(total(step / 20));
      expect(angle).toBeGreaterThan(previous);
      previous = angle;
    }
  });

  it('лист поднимается к зрителю, а не ныряет внутрь книги', () => {
    // Свободный край на середине переворота обязан оказаться в +Z.
    for (const progress of [0.25, 0.5, 0.75]) {
      expect(total(progress)).toBeLessThan(0);
    }
  });

  it('доля за пределами отрезка зажимается', () => {
    expect(total(-1)).toBeCloseTo(0, 10);
    expect(total(2)).toBeCloseTo(-Math.PI, 10);
  });

  it('цепочка длиной в одну кость забирает весь поворот', () => {
    expect(flipRotations(1, 1)).toEqual([-Math.PI]);
  });
});

describe('листающийся лист', () => {
  /*
   * Лист собирается на боевых размерах из `metrics.ts`, а не на переписанных
   * числах: переписанные пережили бы правку метрик молча и сторожили бы
   * вчерашнюю книгу.
   */
  const build = () => {
    const sheet = createSheet({
      width: PAGE_W,
      height: PAGE_H,
      lift: PAPER_LIFT,
      dip: GUTTER_DIP,
      inset: PAGE_INSET,
      clearance: SHEET_CLEARANCE,
      tilt: OPEN_TILT,
      front: new THREE.MeshBasicMaterial(),
      back: new THREE.MeshBasicMaterial(),
    });
    sheet.root.updateMatrixWorld(true);
    return sheet;
  };

  it('в покое лист сохраняет свою ширину', () => {
    // Сторожит позу привязки: если `Skeleton` собрать до того, как у костей
    // посчитаны мировые матрицы, обратные матрицы выходят единичными и лист
    // растягивается почти вдвое — 0.375 вместо 0.2. Глазами на статичном
    // кадре это не видно: вне переворота лист скрыт.
    const sheet = build();
    sheet.setProgress(0);
    sheet.root.updateMatrixWorld(true);

    const point = new THREE.Vector3();
    let min = Infinity;
    let max = -Infinity;

    for (
      let index = 0;
      index < requireAttribute(sheet.front.geometry, 'position').count;
      index++
    ) {
      sheet.front.getVertexPosition(index, point);
      min = Math.min(min, point.x);
      max = Math.max(max, point.x);
    }

    // Бумага уже полной ширины на отступ от корешка — там жёлоб со швом.
    expect(max - min).toBeCloseTo(PAGE_W - PAGE_INSET, 4);
  });

  it('лист не растягивается: дальняя точка не уходит за свою длину от шарнира', () => {
    const sheet = build();
    const point = new THREE.Vector3();

    for (let step = 0; step <= 20; step++) {
      sheet.setProgress(step / 20);
      sheet.root.updateMatrixWorld(true);

      let farthest = 0;
      for (
        let index = 0;
        index < requireAttribute(sheet.front.geometry, 'position').count;
        index++
      ) {
        sheet.front.getVertexPosition(index, point);
        // Шарнир стоит в начале координат листа; дальше своей ширины (плюс
        // половина высоты по вертикали) бумаге тянуться некуда.
        farthest = Math.max(farthest, Math.hypot(point.x, point.z));
      }

      expect(farthest).toBeLessThanOrEqual(PAGE_W * 1.02);
    }
  });

  it('в конце переворота лист занимает ровно левую половину', () => {
    // При равномерной раздаче поворота по цепочке лист сворачивался в трубку
    // и застывал поперёк книги, торча на 0.12 юнита к зрителю.
    const sheet = build();
    const point = new THREE.Vector3();

    sheet.setProgress(1);
    sheet.root.updateMatrixWorld(true);

    let minX = Infinity;
    let maxX = -Infinity;

    for (
      let index = 0;
      index < requireAttribute(sheet.front.geometry, 'position').count;
      index++
    ) {
      sheet.front.getVertexPosition(index, point);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
    }

    expect(minX).toBeCloseTo(-PAGE_W, 3);
    // Внутренний край не доходит до корешка ровно на отступ.
    expect(maxX).toBeCloseTo(-PAGE_INSET, 3);
  });

  it('на обеих стопках лист ложится в полосу лежащей страницы', () => {
    // Главный сторож укладки. Лежащая страница провалена в жёлоб: от `PAPER_LIFT` у
    // внешнего края до `PAPER_LIFT − GUTTER_DIP` у корешка. Плоский лист садился поверх
    // неё, и в момент подмены разворота бумага проваливалась разом — конец
    // переворота отдавал рывком. На обоих концах лист обязан лежать ровно в
    // этой же полосе.
    const sheet = build();
    const point = new THREE.Vector3();

    const band = (progress: number) => {
      sheet.setProgress(progress);
      sheet.root.updateMatrixWorld(true);

      let lowest = Infinity;
      let highest = -Infinity;

      for (
        let index = 0;
        index < requireAttribute(sheet.front.geometry, 'position').count;
        index++
      ) {
        // Без `localToWorld`: узел листа наклонён вместе с половиной книги, и
        // мировая высота включала бы этот наклон. Профиль бумаги меряем в
        // плоскости самой половины — там он обязан совпасть с лежащей страницей.
        sheet.front.getVertexPosition(index, point);
        lowest = Math.min(lowest, point.z);
        highest = Math.max(highest, point.z);
      }

      return { lowest, highest };
    };

    for (const progress of [0, 1]) {
      const { lowest, highest } = band(progress);
      // Просвет постоянный и с той же стороны на обеих стопках: прибавлять его
      // после множителя нельзя — поворот на −π обращает знак, и во второй
      // половине переворота лист вдавливался бы в левую стопку.
      // Нижняя точка — у внутреннего края бумаги, а он отступает от корешка.
      expect(lowest).toBeCloseTo(
        pageProfile(PAGE_INSET / PAGE_W, PAPER_LIFT, GUTTER_DIP) + SHEET_CLEARANCE,
        5,
      );
      expect(highest).toBeCloseTo(PAPER_LIFT + SHEET_CLEARANCE, 5);
    }
  });

  it('изнанка получает зеркальные UV, иначе текст на ней задом наперёд', () => {
    const sheet = build();
    const front = requireAttribute(sheet.front.geometry, 'uv');
    const back = requireAttribute(sheet.back.geometry, 'uv');

    for (let index = 0; index < front.count; index++) {
      expect(back.getX(index)).toBeCloseTo(1 - front.getX(index), 6);
      expect(back.getY(index)).toBeCloseTo(front.getY(index), 6);
    }
  });

  it('лист ни на одной доле переворота не встаёт к зрителю ребром', () => {
    /*
     * Без выгиба лист остаётся плоской пластиной на шарнире и ровно на
     * половине пути поворачивается к камере ребром. Плоскость нулевой толщины
     * с ребра невидима — замер давал обращённость 0.00, и сквозь лист был
     * виден мир за книгой. Выглядело это прозрачной страницей.
     */
    const sheet = build();
    const near = new THREE.Vector3();
    const far = new THREE.Vector3();
    const count = requireAttribute(sheet.front.geometry, 'position').count;

    for (let step = 1; step < 20; step++) {
      sheet.setProgress(step / 20);
      sheet.root.updateMatrixWorld(true);

      // Верхний ряд вершин: наклон каждого отрезка в плоскости xz говорит,
      // насколько этот кусок бумаги повёрнут к зрителю.
      let facing = 0;
      for (let index = 0; index + 1 < count / 2; index++) {
        sheet.front.getVertexPosition(index, near);
        sheet.front.getVertexPosition(index + 1, far);

        const alongX = far.x - near.x;
        const alongZ = far.z - near.z;
        const length = Math.hypot(alongX, alongZ) || 1;
        facing = Math.max(facing, Math.abs(alongX / length));
      }

      // Хоть какая-то часть листа обязана быть развёрнута к зрителю.
      expect(facing).toBeGreaterThan(0.5);
    }
  });

  it('лист занимает ровно ту же полосу бумаги, что и лежащая страница', () => {
    /*
     * Лист во всю ширину накрывал половину жёлоба вместе со швом. В конце
     * переворота он пропадает, и эта полоска разом меняется с бумаги на тёмный
     * шов — правый край левой страницы дёргался. Внутренний край листа обязан
     * стоять там же, где внутренний край страницы.
     */
    const sheet = build();
    const point = new THREE.Vector3();

    for (const progress of [0, 1]) {
      sheet.setProgress(progress);
      sheet.root.updateMatrixWorld(true);

      let innermost = Infinity;
      for (
        let index = 0;
        index < requireAttribute(sheet.front.geometry, 'position').count;
        index++
      ) {
        sheet.front.getVertexPosition(index, point);
        innermost = Math.min(innermost, Math.abs(point.x));
      }

      expect(innermost).toBeCloseTo(PAGE_INSET, 5);
    }
  });

  it('лист не проваливается под стопку ни на одной доле переворота', () => {
    /*
     * Просвет умножался на тот же множитель, что и профиль, а множитель к
     * середине переворота стремится к нулю. Высота лежащей страницы при этом
     * ничем не масштабируется, и у корешка — где поворот подъёма не даёт —
     * лист уходил под неё. Из-под него торчал чужой текст узкой полосой.
     */
    const sheet = build();
    const point = new THREE.Vector3();

    for (let step = 0; step <= 40; step++) {
      const progress = step / 40;
      sheet.setProgress(progress);
      sheet.root.updateMatrixWorld(true);

      for (
        let index = 0;
        index < requireAttribute(sheet.front.geometry, 'position').count;
        index++
      ) {
        sheet.front.getVertexPosition(index, point);
        sheet.front.localToWorld(point);

        // Стопка, над которой точка оказалась, и её высота в этом месте.
        const fromSpine = Math.min(Math.abs(point.x) / PAGE_W, 1);
        if (Math.abs(point.x) < PAGE_INSET) continue;

        expect(point.z).toBeGreaterThan(pageProfile(fromSpine, PAPER_LIFT, GUTTER_DIP));
      }
    }
  });

  it('лист скрывается и показывается обеими сторонами разом', () => {
    const sheet = build();

    sheet.setVisible(false);
    expect([sheet.front.visible, sheet.back.visible]).toEqual([false, false]);

    sheet.setVisible(true);
    expect([sheet.front.visible, sheet.back.visible]).toEqual([true, true]);
  });
});

describe('атрибут геометрии', () => {
  it('отдаёт атрибут, когда он есть', () => {
    const geometry = new THREE.PlaneGeometry(1, 1);

    const position = requireAttribute(geometry, 'position');

    expect(position.count).toBe(4);
  });

  it('падает с внятной ошибкой, когда атрибута нет', () => {
    // Утверждение о непустоте валилось бы позже и в другом месте — на
    // `undefined.count` посреди цикла по вершинам.
    const geometry = new THREE.BufferGeometry();

    expect(() => requireAttribute(geometry, 'position')).toThrow(
      /нет атрибута «position»/,
    );
  });
});

describe('щелчок по книге', () => {
  const closed = { opened: false, spread: 0, link: false };
  const open = (spread: number) => ({ opened: true, spread, link: false });

  it('закрытая книга раскрывается щелчком по любой половине', () => {
    expect(pickAction(closed, 'left')).toBe('open');
    expect(pickAction(closed, 'right')).toBe('open');
  });

  it('половина раскрытой книги решает направление', () => {
    expect(pickAction(open(3), 'right')).toBe('forward');
    expect(pickAction(open(3), 'left')).toBe('back');
  });

  it('на первом развороте левая страница закрывает книгу', () => {
    // Листать назад оттуда некуда, и без этого правила левая половина просто
    // не отвечает на щелчок — книга читается сломанной.
    expect(pickAction(open(0), 'left')).toBe('close');
  });

  it('вперёд с первого разворота листается как обычно', () => {
    expect(pickAction(open(0), 'right')).toBe('forward');
  });

  it('закладка ведёт на подсказки в любом состоянии', () => {
    expect(pickAction(closed, 'tab')).toBe('guide');
    expect(pickAction(open(7), 'tab')).toBe('guide');
  });

  it('ссылка старше листания и закрытия', () => {
    // Строка ссылки занимает одну строку из всей полосы: промахнуться мимо
    // неё легко, попасть случайно — нет. Поэтому она забирает щелчок.
    expect(pickAction({ opened: true, spread: 3, link: true }, 'right')).toBe('link');
    expect(pickAction({ opened: true, spread: 3, link: true }, 'left')).toBe('link');
    expect(pickAction({ opened: true, spread: 0, link: true }, 'left')).toBe('link');
  });

  it('у закрытой книги ссылок нет: на виду обложка', () => {
    expect(pickAction({ opened: false, spread: 0, link: true }, 'left')).toBe('open');
  });

  it('закладка старше ссылки: она лежит поверх страницы', () => {
    expect(pickAction({ opened: true, spread: 3, link: true }, 'tab')).toBe('guide');
  });
});

describe('разворот подсказок', () => {
  const layout = spreads();

  it('стоит сразу за обложкой', () => {
    // Управление нужно тому, кто книгу только что открыл, а не долиставшему до
    // конца.
    expect(layout[1]).toEqual({ kind: 'guide' });
  });

  it('в книге ровно один', () => {
    expect(layout.filter((spread) => spread.kind === 'guide')).toHaveLength(1);
  });

  it('закладка ведёт именно на него', () => {
    expect(layout[guideSpread(layout)]).toEqual({ kind: 'guide' });
  });

  it('падает с внятной ошибкой, если разворота нет', () => {
    expect(() => guideSpread([{ kind: 'cover' }])).toThrow(/нет разворота подсказок/);
  });

  it('главы не потерялись из-за вставки', () => {
    expect(layout.filter((spread) => spread.kind === 'chapter').length).toBe(
      experience.length,
    );
  });
});

describe('позы книги в кадре', () => {
  /** Углы габарита раскрытой книги в её собственных координатах. */
  const openCorners = (): THREE.Vector3[] => {
    const angles = wingAngles(1, OPEN_TILT);
    const points: THREE.Vector3[] = [];

    for (const sign of [1, -1] as const) {
      const spin = new THREE.Matrix4().makeRotationY(sign === 1 ? angles.right : angles.left);

      for (const x of [(sign * PAGE_W) / 2 - COVER_W / 2, (sign * PAGE_W) / 2 + COVER_W / 2])
        for (const y of [-COVER_H / 2, COVER_H / 2])
          for (const z of [-BLOCK_T - BOARD_T, 0])
            points.push(new THREE.Vector3(x, y, z).applyMatrix4(spin));
    }

    return points;
  };

  /** Насколько ближний угол книги не дошёл до кромки кадра, в долях NDC. */
  const marginOf = (aspect: number): number => {
    const camera = new THREE.PerspectiveCamera(65, aspect, 0.1, 1000);
    camera.updateMatrixWorld(true);

    // Книга стоит в системе координат камеры: её поза и есть матрица модели.
    const pose = new THREE.Matrix4().compose(
      READING.position,
      new THREE.Quaternion().setFromEuler(READING.rotation),
      new THREE.Vector3(1, 1, 1),
    );

    let worst = Infinity;
    for (const corner of openCorners()) {
      const point = corner.clone().applyMatrix4(pose).project(camera);
      worst = Math.min(worst, 1 - Math.abs(point.x), 1 - Math.abs(point.y));
    }

    return worst;
  };

  it('раскрытая книга помещается в кадр с запасом', () => {
    // Дистанция подбиралась ради читаемости текста, и легко подобрать её так,
    // что нижний угол уходит за кромку: наклон книги виден только на проекции.
    for (const aspect of [4 / 3, 16 / 10, 16 / 9, 21 / 9]) {
      expect(marginOf(aspect)).toBeGreaterThan(READING_MARGIN);
    }
  });

  it('убранная книга лежит в левой половине кадра', () => {
    expect(STOWED.position.x).toBeLessThan(0);
    expect(STOWED.position.y).toBeLessThan(0);
  });

  it('поворот убранной позы зеркален повороту в правом углу', () => {
    /*
     * Прежде книга лежала справа с поворотом (-0.5, -0.7, 0.26). Отражение по
     * горизонтали меняет знак у поворотов вокруг вертикали и вокруг взгляда и
     * оставляет наклон к зрителю: иначе том у левого края лежит корешком от
     * посетителя.
     */
    expect(STOWED.rotation.x).toBeCloseTo(-0.5, 6);
    expect(STOWED.rotation.y).toBeCloseTo(0.7, 6);
    expect(STOWED.rotation.z).toBeCloseTo(-0.26, 6);
  });
});

describe('палитра книги и токены оболочки', () => {
  /*
   * Панель управления миром одета в бумагу книги, но берёт цвета из CSS, а
   * холст страницы — из своего модуля: переменные CSS ему недоступны. Два
   * набора значений разъезжаются молча — на кадре это «панель другого
   * оттенка», и заметить это можно только рядом с открытой книгой.
   */
  const tokens = readFileSync('src/app/styles/tokens.css', 'utf8');

  const tokenValue = (name: string): string => {
    const found = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(tokens);
    if (!found?.[1]) throw new Error(`в токенах нет --color-${name}`);
    return found[1].trim();
  };

  it('бумага, чернила и охра совпадают со страницей', () => {
    expect(tokenValue('book-paper')).toBe(PAGE_PALETTE.paper);
    expect(tokenValue('book-ink')).toBe(PAGE_PALETTE.ink);
    expect(tokenValue('book-ink-muted')).toBe(PAGE_PALETTE.inkMuted);
    expect(tokenValue('book-accent')).toBe(PAGE_PALETTE.accent);
    expect(tokenValue('book-rule')).toBe(PAGE_PALETTE.rule);
  });

  it('закладка красится той же охрой, что и акцент страницы', () => {
    // Иначе язычок на обрезе читается наклейкой из другого набора.
    expect(TAB_COLOR).toBe(PAGE_PALETTE.accent);
    expect(TAB_INK).toBe(PAGE_PALETTE.paper);
  });
});

describe('пролистывание до закладки', () => {
  it('соседний разворот листается обычным переворотом', () => {
    // Ускорять этот случай значило бы завести два разных листания на одно
    // движение: до соседа листают и без закладки.
    expect(rifflePlan(1)).toEqual({ pace: FLIP_SECONDS, settle: FLIP_SECONDS });
    expect(rifflePlan(0).pace).toBe(FLIP_SECONDS);
  });

  it('пачка идёт быстрее одиночного переворота', () => {
    for (const count of [2, 5, 12, 20]) {
      expect(rifflePlan(count).pace).toBeLessThan(FLIP_SECONDS / 2 + 1e-9);
    }
  });

  it('чем длиннее дорога, тем быстрее лист', () => {
    expect(rifflePlan(4).pace).toBeGreaterThan(rifflePlan(12).pace);
  });

  it('лист не идёт быстрее пола видимости', () => {
    // Ниже пола пачка вырождается в мельтешение текстур: на переворот
    // остаётся меньше пяти кадров.
    expect(rifflePlan(200).pace).toBe(RIFFLE_MIN);
  });

  it('последний лист укладывается медленнее прочих, но не дольше обычного', () => {
    const long = rifflePlan(14);
    expect(long.settle).toBeGreaterThan(long.pace);
    expect(long.settle).toBeLessThanOrEqual(FLIP_SECONDS);
  });

  it('дорога через всю книгу занимает считаные секунды', () => {
    // Ради этого пролистывание и заведено: честные перевороты дали бы полминуты.
    const count = spreads().length - 1;
    const plan = rifflePlan(count);
    const total = plan.pace * (count - 1) + plan.settle;

    expect(total).toBeLessThan(4);
  });
});
