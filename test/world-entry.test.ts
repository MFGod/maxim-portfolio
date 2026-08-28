import { describe, expect, it } from 'vitest';

import { WORLD_BOUNDS, worldChapters, worldPeak } from '@/data/world-places';
import {
  WORLD_MIN_MEMORY_GB,
  WORLD_MIN_WIDTH,
  worldSupport,
  type WorldEnvironment,
} from '@/lib/world/capability';
import { PLAN_HEIGHT, PLAN_WIDTH, planPolyline, toPlan } from '@/lib/world/plan';

describe('готовность машины к миру', () => {
  const ready: WorldEnvironment = {
    viewportWidth: 1440,
    animations: 'full',
    webgl2: true,
    deviceMemory: 8,
  };

  it('всё сошлось — мир можно поднимать', () => {
    expect(worldSupport(ready)).toBe('ready');
  });

  it('выключенное движение сильнее остальных условий', () => {
    expect(
      worldSupport({ ...ready, animations: 'off', webgl2: false, viewportWidth: 320 }),
    ).toBe('motion-off');
  });

  it('узкий экран отсекается до проверки WebGL', () => {
    expect(worldSupport({ ...ready, viewportWidth: WORLD_MIN_WIDTH - 1 })).toBe(
      'small-screen',
    );
  });

  it('«покой» миру не мешает: он про амплитуду, а не про запуск', () => {
    expect(worldSupport({ ...ready, animations: 'reduced' })).toBe('ready');
  });

  it('без WebGL2 мира нет', () => {
    expect(worldSupport({ ...ready, webgl2: false })).toBe('no-webgl');
  });

  it('мало памяти — мира нет', () => {
    expect(worldSupport({ ...ready, deviceMemory: WORLD_MIN_MEMORY_GB - 1 })).toBe(
      'low-memory',
    );
  });

  it('браузер не сообщил память — это не повод отказывать', () => {
    expect(worldSupport({ ...ready, deviceMemory: null })).toBe('ready');
  });

  it('до гидратации ширина неизвестна и не блокирует', () => {
    expect(worldSupport({ ...ready, viewportWidth: null })).toBe('ready');
  });
});

describe('план мира', () => {
  const points = [
    ...worldChapters.flatMap((chapter) => [
      chapter.grace,
      ...chapter.projects.map((project) => project.at),
    ]),
    worldPeak,
  ];

  it('каждая метка попадает внутрь холста', () => {
    for (const point of points) {
      const flat = toPlan(point);
      expect(flat.x).toBeGreaterThanOrEqual(0);
      expect(flat.x).toBeLessThanOrEqual(PLAN_WIDTH);
      expect(flat.y).toBeGreaterThanOrEqual(0);
      expect(flat.y).toBeLessThanOrEqual(PLAN_HEIGHT);
    }
  });

  it('север сверху: меньший Z даёт меньший Y на холсте', () => {
    const north = toPlan([0, 0, WORLD_BOUNDS.minZ]);
    const south = toPlan([0, 0, WORLD_BOUNDS.maxZ]);
    expect(north.y).toBeLessThan(south.y);
  });

  it('ломаная маршрута состоит из пар координат', () => {
    const pairs = planPolyline(worldChapters.map((chapter) => chapter.grace)).split(
      ' ',
    );
    expect(pairs).toHaveLength(worldChapters.length);
    for (const pair of pairs) {
      expect(pair).toMatch(/^-?\d+\.\d{2},-?\d+\.\d{2}$/);
    }
  });
});
