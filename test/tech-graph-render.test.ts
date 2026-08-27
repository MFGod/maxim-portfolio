import { describe, expect, it } from 'vitest';

import {
  initialCamera,
  projectPoint,
  type ProjectedPoint,
} from '@/lib/tech-graph/camera';
import type { LayoutNode } from '@/lib/tech-graph/layout';
import {
  clamp,
  depthOrder,
  edgePaths,
  fitCamera,
  neighbourMap,
  nodeWidth,
  sameOrder,
} from '@/lib/tech-graph/render';

const point = (x: number, y: number, depth: number): ProjectedPoint => ({
  x,
  y,
  depth,
  scale: 1,
});

describe('nodeWidth', () => {
  it('растёт вместе с длиной подписи', () => {
    expect(nodeWidth('TS')).toBeLessThan(nodeWidth('TypeScript'));
  });

  it('у пустой подписи остаются только поля карточки', () => {
    expect(nodeWidth('')).toBe(26);
  });
});

describe('clamp', () => {
  it('держит значение в симметричном пределе', () => {
    expect(clamp(5, 2)).toBe(2);
    expect(clamp(-5, 2)).toBe(-2);
    expect(clamp(1, 2)).toBe(1);
  });
});

describe('edgePaths', () => {
  const points = [point(0, 0, -1), point(10, 0, -1), point(20, 0, 2)];

  it('разводит связи по слоям: середина за центром шара — дальний слой', () => {
    const paths = edgePaths(points, [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
    ]);

    expect(paths.near).toBe('M0.0 0.0L10.0 0.0');
    expect(paths.far).toBe('M10.0 0.0L20.0 0.0');
    expect(paths.active).toBe('');
  });

  it('связи подсвеченного узла уходят в отдельный слой', () => {
    const paths = edgePaths(points, [{ source: 0, target: 1 }], {
      idAt: (index) => ['a', 'b', 'c'][index],
      activeId: 'a',
    });

    expect(paths.active).toBe('M0.0 0.0L10.0 0.0');
    expect(paths.near).toBe('');
  });

  it('пропускает связь, у которой нет точки', () => {
    expect(edgePaths(points, [{ source: 0, target: 9 }])).toEqual({
      far: '',
      near: '',
      active: '',
    });
  });
});

describe('depthOrder', () => {
  it('ставит дальние узлы первыми, ближние — последними', () => {
    expect(depthOrder([point(0, 0, -1), point(0, 0, 1), point(0, 0, 0)])).toEqual([
      1, 2, 0,
    ]);
  });
});

describe('sameOrder', () => {
  it('различает перестановку и совпадение', () => {
    expect(sameOrder([0, 1, 2], [0, 1, 2])).toBe(true);
    expect(sameOrder([0, 1, 2], [0, 2, 1])).toBe(false);
    expect(sameOrder([0, 1], [0, 1, 2])).toBe(false);
  });
});

describe('fitCamera', () => {
  const viewport = { width: 1000, height: 700 };
  const camera = { ...initialCamera };
  const at = (x: number, y: number, z: number): LayoutNode => ({
    id: 'n',
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    radius: 20,
    pinned: false,
  });

  it('вписывает разбросанный граф внутрь сцены', () => {
    const spread = [at(-800, -600, 0), at(800, 600, 0)];
    const fitted = fitCamera(spread, () => 'TypeScript', camera, 1, viewport);

    const points = spread.map((node) =>
      projectPoint(node.position, fitted, fitted.zoom, viewport),
    );
    for (const point of points) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(viewport.width);
    }
    expect(fitted.zoom).toBeLessThan(camera.zoom);
  });

  it('на пустом списке узлов оставляет камеру как есть', () => {
    expect(fitCamera([], () => '', camera, 1, viewport)).toEqual(camera);
  });
});

describe('neighbourMap', () => {
  it('связь попадает в оба узла: подсветка работает с любой стороны', () => {
    const map = neighbourMap(
      [
        { id: 'react', label: 'React' },
        { id: 'next', label: 'Next.js' },
      ],
      [{ source: 'react', target: 'next' }],
    );

    expect([...(map.get('react') ?? [])]).toEqual(['next']);
    expect([...(map.get('next') ?? [])]).toEqual(['react']);
  });

  it('узел без связей получает пустое множество, а не undefined', () => {
    const map = neighbourMap([{ id: 'solo', label: 'Solo' }], []);
    expect(map.get('solo')?.size).toBe(0);
  });
});
