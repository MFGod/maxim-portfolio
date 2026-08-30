import { describe, expect, it } from 'vitest';

import { MAP_BOUNDS, SEA_LEVEL, type WorldBounds } from '@/lib/world/bounds';
import {
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
  cloudField,
  cloudPlaces,
  cloudRing,
  fieldSway,
  floorReach,
  overlapStep,
  type CloudPlacement,
} from '@/lib/world/clouds';

/** Комьев в одном ряду: раскладка отдаёт ряды подряд, одним массивом. */
const PER_ROW = RING_LENGTH();

function RING_LENGTH() {
  return cloudRing().length / CLOUD_ROWS;
}

const RING = cloudRing();

/** Сторона границы, на которой стоит комок: по тому, к какой он ближе. */
function sideOf(place: CloudPlacement, bounds: WorldBounds = MAP_BOUNDS) {
  const distances = [
    { side: 'юг', value: Math.abs(place.z - bounds.minZ) },
    { side: 'север', value: Math.abs(place.z - bounds.maxZ) },
    { side: 'запад', value: Math.abs(place.x - bounds.minX) },
    { side: 'восток', value: Math.abs(place.x - bounds.maxX) },
  ];

  return distances.sort((a, b) => a.value - b.value)[0]!.side;
}

/** Насколько комок кольца выступает за его середину поперёк: половина толщины. */
function reachOf(ring: { scale: number }): number {
  const thickest = Math.max(...CLOUD_MODELS.map((model) => model.depth));
  return (thickest * ring.scale * CLOUD_SCALE_MAX) / 2;
}

/** Наибольший просвет между соседями вдоль кромки. */
function widestGap(): number {
  let widest = -Infinity;

  for (let index = 0; index < PER_ROW; index++) {
    const here = RING[index]!;
    const next = RING[(index + 1) % PER_ROW]!;

    const reach = (place: CloudPlacement) => {
      const turn = Math.abs(((place.yaw + Math.PI / 4) % (Math.PI / 2)) - Math.PI / 4);
      return (CLOUD_MODELS[place.model]!.width * place.scale * Math.cos(turn)) / 2;
    };

    const between = Math.hypot(next.x - here.x, next.z - here.z);
    widest = Math.max(widest, between - reach(here) - reach(next));
  }

  return widest;
}

describe('раскладка гряды по кромке', () => {
  it('кольцо замкнуто и покрывает все четыре стороны', () => {
    const sides = new Set(RING.map((place) => sideOf(place)));

    expect(sides).toEqual(new Set(['юг', 'север', 'запад', 'восток']));
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

  it('углы заняты так же, как середины сторон', () => {
    const corners = [
      [MAP_BOUNDS.minX, MAP_BOUNDS.minZ],
      [MAP_BOUNDS.maxX, MAP_BOUNDS.minZ],
      [MAP_BOUNDS.maxX, MAP_BOUNDS.maxZ],
      [MAP_BOUNDS.minX, MAP_BOUNDS.maxZ],
    ] as const;

    for (const [x, z] of corners) {
      const nearest = Math.min(
        ...RING.map((place) => Math.hypot(place.x - x, place.z - z)),
      );
      expect(nearest).toBeLessThan(CLOUD_STEP);
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
  it('комья держатся кромки, а не разбредаются по морю', () => {
    const band = (CLOUD_ROWS - 1) * CLOUD_ROW_INSET + CLOUD_SWAY;

    for (const place of RING) {
      const edge = Math.min(
        Math.abs(place.x - MAP_BOUNDS.minX),
        Math.abs(place.x - MAP_BOUNDS.maxX),
        Math.abs(place.z - MAP_BOUNDS.minZ),
        Math.abs(place.z - MAP_BOUNDS.maxZ),
      );

      expect(edge).toBeLessThanOrEqual(band);
    }
  });

  it('гряда не дотягивается до середины карты', () => {
    const thickest = Math.max(...CLOUD_MODELS.map((model) => model.depth));
    const inward =
      (CLOUD_ROWS - 1) * CLOUD_ROW_INSET +
      CLOUD_SWAY +
      (thickest * CLOUD_SCALE_MAX) / 2;

    const half = Math.min(
      (MAP_BOUNDS.maxX - MAP_BOUNDS.minX) / 2,
      (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ) / 2,
    );

    expect(inward).toBeLessThan(half / 4);
  });
});

describe('поле облаков за границей', () => {
  const FIELD = cloudField();

  it('всё поле лежит снаружи границ мира', () => {
    for (const place of FIELD) {
      const outside =
        place.x < MAP_BOUNDS.minX ||
        place.x > MAP_BOUNDS.maxX ||
        place.z < MAP_BOUNDS.minZ ||
        place.z > MAP_BOUNDS.maxZ;

      expect(outside).toBe(true);
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

  it('подложка кончается дальше самого дальнего комка', () => {
    const last = CLOUD_FIELD[CLOUD_FIELD.length - 1]!;
    const reachOfLast = fieldSway(CLOUD_FIELD.length - 1) + reachOf(last);

    expect(floorReach()).toBeGreaterThan(last.out + reachOfLast);
  });

  it('раскладка поля одна и та же от загрузки к загрузке', () => {
    expect(cloudField()).toEqual(FIELD);
  });
});

describe('гряда на слабой машине', () => {
  it('без поля остаётся одна кромка, и она не редеет', () => {
    const full = cloudPlaces();

    const light = cloudPlaces(MAP_BOUNDS, false);

    expect(light).toEqual(cloudRing());
    expect(full.length - light.length).toBe(cloudField().length);
  });

  it('снятое поле уносит больше половины комьев', () => {
    const full = cloudPlaces();

    const light = cloudPlaces(MAP_BOUNDS, false);

    expect(light.length / full.length).toBeLessThan(0.5);
  });
});
