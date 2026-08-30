import { describe, expect, it } from 'vitest';

import { techEdges, techNodeById, techNodes } from '@/data/tech-graph';
import {
  ALPHA_MIN,
  SHELL_RADIUS,
  createGraphModel,
  createSimulation,
  moveNode,
  pinNode,
  settleLayout,
  stepSimulation,
} from '@/lib/tech-graph/layout';

describe('конфигурация графа', () => {
  it('не содержит повторяющихся узлов', () => {
    expect(techNodeById.size).toBe(techNodes.length);
  });

  it('связывает только существующие узлы и не замыкает узел на себя', () => {
    for (const edge of techEdges) {
      expect(techNodeById.has(edge.source), edge.source).toBe(true);
      expect(techNodeById.has(edge.target), edge.target).toBe(true);
      expect(edge.source).not.toBe(edge.target);
    }
  });

  it('не содержит повторяющихся связей', () => {
    const seen = new Set(
      techEdges.map((edge) => [edge.source, edge.target].sort().join('↔')),
    );
    expect(seen.size).toBe(techEdges.length);
  });

  it('не оставляет узлов без единой связи', () => {
    const connected = new Set(techEdges.flatMap((edge) => [edge.source, edge.target]));
    const orphans = techNodes.filter((node) => !connected.has(node.id));
    expect(orphans.map((node) => node.id)).toEqual([]);
  });
});

describe('createGraphModel', () => {
  it('даёт одинаковую раскладку при каждом вызове', () => {
    const first = createGraphModel(techNodes, techEdges);
    const second = createGraphModel(techNodes, techEdges);
    expect(second.nodes).toEqual(first.nodes);
    expect(second.links).toEqual(first.links);
  });

  it('переводит связи в индексы узлов', () => {
    const model = createGraphModel(techNodes, techEdges);
    expect(model.nodes).toHaveLength(techNodes.length);
    expect(model.links).toHaveLength(techEdges.length);

    for (const link of model.links) {
      expect(model.nodes[link.source]).toBeDefined();
      expect(model.nodes[link.target]).toBeDefined();
    }
  });

  it('падает на связи с несуществующим узлом', () => {
    expect(() =>
      createGraphModel(techNodes, [{ source: 'react', target: 'cobol' }]),
    ).toThrow(/cobol/);
  });
});

describe('симуляция', () => {
  it('не меняет модель, из которой создана', () => {
    const model = createGraphModel(techNodes, techEdges);
    const snapshot = structuredClone(model);
    settleLayout(createSimulation(model));
    expect(model).toEqual(snapshot);
  });

  it('останавливается и оставляет конечные координаты', () => {
    const simulation = settleLayout(
      createSimulation(createGraphModel(techNodes, techEdges)),
    );

    expect(simulation.alpha).toBeLessThanOrEqual(ALPHA_MIN);
    for (const node of simulation.nodes) {
      expect(Number.isFinite(node.position.x), node.id).toBe(true);
      expect(Number.isFinite(node.position.y), node.id).toBe(true);
      expect(Number.isFinite(node.position.z), node.id).toBe(true);
      expect(
        Math.hypot(node.position.x, node.position.y, node.position.z),
      ).toBeLessThan(2000);
    }
  });

  it('раскладывает узлы по оболочке шара', () => {
    const simulation = settleLayout(
      createSimulation(createGraphModel(techNodes, techEdges)),
    );

    for (const node of simulation.nodes) {
      const radius = Math.hypot(node.position.x, node.position.y, node.position.z);
      expect(radius, node.id).toBeGreaterThan(SHELL_RADIUS * 0.9);
      expect(radius, node.id).toBeLessThan(SHELL_RADIUS * 1.1);
    }
  });

  it('покрывает поверхность без больших пустот', () => {
    const simulation = settleLayout(
      createSimulation(createGraphModel(techNodes, techEdges)),
    );
    const directions = simulation.nodes.map((node) => normalize(node.position));

    const samples = 400;
    const golden = Math.PI * (3 - Math.sqrt(5));
    let widest = 0;

    for (let i = 0; i < samples; i += 1) {
      const y = 1 - (2 * i) / (samples - 1);
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const probe = { x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring };

      let nearest = Math.PI;
      for (const direction of directions) {
        const dot =
          probe.x * direction.x + probe.y * direction.y + probe.z * direction.z;
        nearest = Math.min(nearest, Math.acos(Math.min(1, Math.max(-1, dot))));
      }
      widest = Math.max(widest, nearest);
    }

    expect((widest * 180) / Math.PI).toBeLessThan(28);
  });

  it('разводит узлы: ни одна пара не слипается в точку', () => {
    const simulation = settleLayout(
      createSimulation(createGraphModel(techNodes, techEdges)),
    );

    for (let i = 0; i < simulation.nodes.length; i += 1) {
      for (let j = i + 1; j < simulation.nodes.length; j += 1) {
        const a = simulation.nodes[i]!.position;
        const b = simulation.nodes[j]!.position;
        expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(120);
      }
    }
  });

  it('держит закреплённый узел на месте', () => {
    const simulation = createSimulation(createGraphModel(techNodes, techEdges));
    pinNode(simulation, 0, true);
    moveNode(simulation, 0, { x: 10, y: 20, z: 30 });

    for (let step = 0; step < 20; step += 1) stepSimulation(simulation);

    expect(simulation.nodes[0]!.position).toEqual({ x: 10, y: 20, z: 30 });
  });
});

function normalize(point: { x: number; y: number; z: number }) {
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  return { x: point.x / length, y: point.y / length, z: point.z / length };
}
