import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { MAP_BOUNDS, SEA_LEVEL, type WorldBounds } from '@/lib/world/bounds';
import {
  attachClouds,
  boundsCenter,
  CLOUD_FIELD,
  CLOUD_MODELS,
  CLOUD_ROW_INSET,
  CLOUD_ROWS,
  CLOUD_SCALE_MAX,
  CLOUD_SCALE_MIN,
  CLOUD_SINK,
  CLOUD_SLIDE,
  CLOUD_STEP,
  CLOUD_SWAY,
  CLOUD_YAW,
  HORIZON_MARGIN,
  cloudCircle,
  cloudField,
  cloudPlaces,
  cloudReach,
  cloudRing,
  fieldSway,
  floorRadius,
  overlapStep,
  type CloudPlacement,
  CLOUD_BOUNDARY_RADIUS,
} from '@/lib/world/clouds';

/** Комьев в одном ряду: раскладка отдаёт ряды подряд, одним массивом. */
const PER_ROW = RING_LENGTH();

function RING_LENGTH() {
  return cloudRing().length / CLOUD_ROWS;
}

const RING = cloudRing();
const CIRCLE = cloudCircle();

/** Расстояние от середины карты. */
function radiusOf(place: { x: number; z: number }): number {
  return Math.hypot(place.x - CIRCLE.x, place.z - CIRCLE.z);
}

/** Направление на комок от середины карты, от 0 до 2π. */
function angleOf(place: { x: number; z: number }): number {
  const turn = Math.PI * 2;
  return (Math.atan2(place.z - CIRCLE.z, place.x - CIRCLE.x) + turn) % turn;
}

/** Насколько комок выходит наружу за прямоугольник карты. */
function outsideOf(place: { x: number; z: number }, bounds: WorldBounds): number {
  const x = Math.max(bounds.minX - place.x, place.x - bounds.maxX, 0);
  const z = Math.max(bounds.minZ - place.z, place.z - bounds.maxZ, 0);

  return Math.hypot(x, z);
}

/** Половина толщины самого крупного комка кольца такого размера. */
function reachOf(ring: { scale: number }): number {
  const thickest = Math.max(...CLOUD_MODELS.map((model) => model.depth));
  return (thickest * ring.scale * CLOUD_SCALE_MAX) / 2;
}

/** Длинная ось комка в мире: `yaw` — поворот вокруг вертикали. */
function axisOf(place: CloudPlacement): [number, number] {
  return [Math.cos(place.yaw), -Math.sin(place.yaw)];
}

/** Наибольший просвет между соседями вдоль окружности. */
function widestGap(): number {
  let widest = -Infinity;

  for (let index = 0; index < PER_ROW; index++) {
    const here = RING[index]!;
    const next = RING[(index + 1) % PER_ROW]!;

    const between = Math.hypot(next.x - here.x, next.z - here.z);
    const dx = (next.x - here.x) / between;
    const dz = (next.z - here.z) / between;

    /** Половина длины комка, посчитанная вдоль отрезка до соседа. */
    const reach = (place: CloudPlacement) => {
      const [ax, az] = axisOf(place);
      const along = Math.abs(ax * dx + az * dz);
      return (CLOUD_MODELS[place.model]!.width * place.scale * along) / 2;
    };

    widest = Math.max(widest, between - reach(here) - reach(next));
  }

  return widest;
}

describe('круг границы мира', () => {
  it('вписывает в себя всю карту, а не обрамляет её по кромке', () => {
    const corners = [
      [MAP_BOUNDS.minX, MAP_BOUNDS.minZ],
      [MAP_BOUNDS.maxX, MAP_BOUNDS.minZ],
      [MAP_BOUNDS.maxX, MAP_BOUNDS.maxZ],
      [MAP_BOUNDS.minX, MAP_BOUNDS.maxZ],
    ] as const;

    for (const [x, z] of corners) {
      expect(radiusOf({ x, z })).toBeCloseTo(CLOUD_BOUNDARY_RADIUS, 6);
    }

    expect(CIRCLE.radius).toBeCloseTo(CLOUD_BOUNDARY_RADIUS + HORIZON_MARGIN, 6);
  });

  it('зазор до углов больше, чем весь заход кольца внутрь', () => {
    const inward =
      (CLOUD_ROWS - 1) * CLOUD_ROW_INSET + CLOUD_SWAY + reachOf({ scale: 1 });

    expect(inward).toBeLessThan(HORIZON_MARGIN);
  });
});

describe('раскладка гряды по окружности', () => {
  it('кольцо замкнуто и покрывает весь обход', () => {
    const SECTORS = 24;
    const filled = new Set(
      RING.map((place) => Math.floor((angleOf(place) / (Math.PI * 2)) * SECTORS)),
    );

    expect(filled.size).toBe(SECTORS);
    expect(RING.length).toBe(PER_ROW * CLOUD_ROWS);
    expect(RING.length).toBeGreaterThan(300);
    expect(RING.length).toBeLessThan(500);
  });

  it('между соседями не остаётся просвета', () => {
    expect(widestGap()).toBeLessThan(0);

    const narrowest = Math.min(...CLOUD_MODELS.map((model) => model.width));
    expect(CLOUD_STEP * (1 + CLOUD_SLIDE)).toBeLessThan(
      narrowest * CLOUD_SCALE_MIN * Math.cos(CLOUD_YAW),
    );
  });

  it('ни один комок не заходит на карту', () => {
    for (const place of RING) {
      const body = (CLOUD_MODELS[place.model]!.depth * place.scale) / 2;

      expect(outsideOf(place, MAP_BOUNDS)).toBeGreaterThan(body);
    }
  });

  it('второй ряд не повторяет первый', () => {
    expect(CLOUD_ROWS).toBeGreaterThan(1);

    for (let index = 0; index < PER_ROW; index++) {
      const first = RING[index]!;
      const second = RING[index + PER_ROW]!;

      expect(Math.hypot(second.x - first.x, second.z - first.z)).toBeGreaterThan(
        CLOUD_STEP / 4,
      );
    }
  });

  it('раскладка одна и та же от загрузки к загрузке', () => {
    expect(cloudRing()).toEqual(RING);
  });
});

describe('посадка комка в воду', () => {
  it('низ каждого комка под уровнем моря, и тем глубже, чем комок крупнее', () => {
    for (const place of RING) {
      const shape = CLOUD_MODELS[place.model]!;
      const bottom = place.y + shape.bottom * place.scale;

      expect(bottom).toBeCloseTo(
        SEA_LEVEL - shape.height * place.scale * CLOUD_SINK,
        6,
      );
      expect(bottom).toBeLessThan(SEA_LEVEL);
    }
  });

  it('ни один комок не тонет целиком', () => {
    expect(CLOUD_SINK).toBeLessThan(1);

    for (const place of RING) {
      const top =
        place.y +
        (CLOUD_MODELS[place.model]!.bottom + CLOUD_MODELS[place.model]!.height) *
          place.scale;
      expect(top).toBeGreaterThan(SEA_LEVEL);
    }
  });
});

describe('гряда и предел камеры', () => {
  it('комья держатся окружности, а не разбредаются по морю', () => {
    const band = (CLOUD_ROWS - 1) * CLOUD_ROW_INSET + CLOUD_SWAY;

    for (const place of RING) {
      expect(Math.abs(radiusOf(place) - CIRCLE.radius)).toBeLessThanOrEqual(band);
    }
  });
});

describe('поле облаков за кольцом', () => {
  const FIELD = cloudField();

  it('всё поле лежит снаружи кольца', () => {
    for (const place of FIELD) {
      expect(radiusOf(place)).toBeGreaterThan(CIRCLE.radius);
    }
  });

  it('кольца идут наружу и перекрывают друг друга', () => {
    for (let index = 1; index < CLOUD_FIELD.length; index++) {
      const inner = CLOUD_FIELD[index - 1]!;
      const outer = CLOUD_FIELD[index]!;

      expect(outer.out).toBeGreaterThan(inner.out);
      expect(outer.scale).toBeGreaterThan(inner.scale);
      expect(inner.out + fieldSway(index - 1) + reachOf(inner)).toBeGreaterThan(
        outer.out - fieldSway(index) - reachOf(outer),
      );
    }

    const bank = CLOUD_SWAY + reachOf({ scale: 1 });

    expect(CLOUD_FIELD[0]!.out - fieldSway(0) - reachOf(CLOUD_FIELD[0]!)).toBeLessThan(
      bank,
    );
  });

  it('каждое кольцо сплошное само по себе', () => {
    for (const ring of CLOUD_FIELD) {
      const step = overlapStep(ring.scale);
      const narrowest = Math.min(...CLOUD_MODELS.map((model) => model.width));

      expect(step * (1 + CLOUD_SLIDE)).toBeLessThan(
        narrowest * CLOUD_SCALE_MIN * ring.scale * Math.cos(CLOUD_YAW),
      );
    }
  });

  it('гряда и поле вместе укладываются в бюджет кадра', () => {
    const total = cloudRing().length + FIELD.length;
    expect(total).toBeLessThan(1000);
  });

  it('вылет поля посчитан по самому дальнему комку', () => {
    for (const place of FIELD) {
      expect(radiusOf(place)).toBeLessThan(cloudReach());
    }

    const last = CLOUD_FIELD[CLOUD_FIELD.length - 1]!;
    expect(cloudReach()).toBeGreaterThan(CIRCLE.radius + last.out);
  });

  it('подложка кончается дальше самого дальнего комка', () => {
    expect(floorRadius()).toBeGreaterThan(cloudReach());
  });

  it('раскладка поля одна и та же от загрузки к загрузке', () => {
    expect(cloudField()).toEqual(FIELD);
  });
});

describe('гряда на слабой машине', () => {
  it('без поля остаётся одно кольцо, и оно не редеет', () => {
    const full = cloudPlaces();

    const light = cloudPlaces(MAP_BOUNDS, false);

    expect(light).toEqual(cloudRing());
    expect(full.length - light.length).toBe(cloudField().length);
  });

  it('снятое поле уносит около половины комьев', () => {
    const full = cloudPlaces();

    const light = cloudPlaces(MAP_BOUNDS, false);

    expect(light.length / full.length).toBeLessThan(0.6);
  });
});

describe('подложка под полем', () => {
  /** Комок-заглушка: габарит тот же, что в раскладке, — файлов в тесте нет. */
  function fakeModel(model: (typeof CLOUD_MODELS)[number]) {
    const geometry = new THREE.BoxGeometry(model.width, model.height, model.depth);
    geometry.translate(0, model.bottom + model.height / 2, 0);

    const scene = new THREE.Object3D();
    scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));

    return { scene };
  }

  it('идёт кольцом от кромки карты до края круга', () => {
    const parent = new THREE.Object3D();
    const clouds = attachClouds(parent, CLOUD_MODELS.map(fakeModel), MAP_BOUNDS);
    clouds.setLight(0xffffff, 0x50638e);

    const floor = parent.getObjectByName('CloudFloor') as THREE.Mesh;
    const position = floor.geometry.getAttribute('position');
    const center = boundsCenter();

    expect(floor.geometry.getAttribute('color').count).toBe(position.count);

    for (let index = 0; index < position.count; index++) {
      const radius = Math.hypot(
        position.getX(index) - center.x,
        position.getZ(index) - center.z,
      );

      expect(position.getY(index)).toBeLessThan(SEA_LEVEL);

      /** Чётные вершины — внутренний край по кромке карты, нечётные — внешний. */
      if (index % 2 === 0) {
        expect(radius).toBeLessThanOrEqual(CLOUD_BOUNDARY_RADIUS);
      } else {
        expect(radius).toBeCloseTo(floorRadius(), 3);
      }
    }

    clouds.dispose();
    expect(parent.children.length).toBe(0);
  });
});
