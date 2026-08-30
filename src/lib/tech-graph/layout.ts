import type { TechEdge, TechNode } from '@/data/tech-graph';

export type Vec3 = { x: number; y: number; z: number };

export type LayoutNode = {
  id: string;
  position: Vec3;
  velocity: Vec3;
  /** Полуширина карточки в мировых единицах: узлы не налезают друг на друга. */
  radius: number;
  /** Узел под пальцем: силы на него не действуют. */
  pinned: boolean;
};

export type LayoutLink = { source: number; target: number };

/**
 * Неизменяемая модель графа: порядок узлов, стартовые позиции и связи в виде
 * индексов. Считается один раз и одинаково на сервере и в браузере.
 */
export type GraphModel = {
  nodes: { id: string; position: Vec3; radius: number }[];
  links: LayoutLink[];
};

export type LayoutState = {
  nodes: LayoutNode[];
  links: LayoutLink[];
  /** Температура симуляции: падает до нуля, и граф замирает. */
  alpha: number;
  /**
   * Запас расстояния между карточками. Сцена сжимается сильнее, чем подписи,
   * и без этого множителя на узком экране узлы наезжали бы друг на друга.
   */
  spacing: number;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Радиус оболочки: узлы живут на поверхности шара, а не внутри него. */
export const SHELL_RADIUS = 390;
const CLUSTER_TIGHTNESS = 0.62;

const REPULSION = 170000;
const SPRING = 0.008;
const REST_LENGTH = 190;
/** Сила, возвращающая узел на поверхность шара. Держит форму против пружин. */
const SHELL = 3;
const DAMPING = 0.84;
const ALPHA_DECAY = 0.022;
const MAX_STEP = 14;
const MIN_DISTANCE = 30;
const SEPARATION = 0.55;
/** Карточка широкая и низкая: по вертикали узлам нужно много меньше места. */
const GAP_Y = 40;
/**
 * Разница глубин, до которой карточки считаются соседними по фронту. Дальше —
 * это перед и зад шара, их разводить в плоскости нельзя: развалится форма.
 */
const GAP_Z = 110;
const RADIUS_BASE = 14;
const RADIUS_PER_CHAR = 3.8;

export const ALPHA_START = 1;
export const ALPHA_MIN = 0.02;
/** Насколько разогревается симуляция после того, как узел отпустили. */
export const ALPHA_REHEAT = 0.18;

/** Точка на оболочке шара по направлению. Длина вектора значения не имеет. */
function onShell(direction: Vec3): Vec3 {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return {
    x: (direction.x / length) * SHELL_RADIUS,
    y: (direction.y / length) * SHELL_RADIUS,
    z: (direction.z / length) * SHELL_RADIUS,
  };
}

/** Равномерная точка на сфере: узлы расходятся без случайных чисел. */
function spherePoint(index: number, count: number): Vec3 {
  const y = count < 2 ? 0 : 1 - (2 * index) / (count - 1);
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * index;
  return { x: Math.cos(theta) * ring, y, z: Math.sin(theta) * ring };
}

/**
 * Стартовая композиция: категории расходятся по сфере, узлы внутри категории
 * держатся своим облаком. Раскладка детерминированная — сервер и клиент рисуют
 * одно и то же, а первый кадр уже читается.
 */
export function createGraphModel(nodes: TechNode[], edges: TechEdge[]): GraphModel {
  const groups = new Map<string, TechNode[]>();
  for (const node of nodes) {
    const key = node.category ?? 'core';
    const group = groups.get(key);
    if (group) group.push(node);
    else groups.set(key, [node]);
  }

  const index = new Map<string, number>();
  const modelNodes: GraphModel['nodes'] = [];
  const groupKeys = [...groups.keys()];

  groupKeys.forEach((key, groupIndex) => {
    const direction = spherePoint(groupIndex, groupKeys.length);
    const members = groups.get(key) ?? [];

    members.forEach((node, memberIndex) => {
      const offset = spherePoint(memberIndex, members.length);
      index.set(node.id, modelNodes.length);
      modelNodes.push({
        id: node.id,
        radius: RADIUS_BASE + node.label.length * RADIUS_PER_CHAR,
        position: onShell({
          x: direction.x + offset.x * CLUSTER_TIGHTNESS,
          y: direction.y + offset.y * CLUSTER_TIGHTNESS,
          z: direction.z + offset.z * CLUSTER_TIGHTNESS,
        }),
      });
    });
  });

  const links = edges.map((edge) => {
    const source = index.get(edge.source);
    const target = index.get(edge.target);
    if (source === undefined || target === undefined) {
      throw new Error(
        `Связь ${edge.source} → ${edge.target} ссылается на несуществующий узел`,
      );
    }
    return { source, target };
  });

  return { nodes: modelNodes, links };
}

/** Рабочее состояние симуляции: своя копия позиций, модель остаётся исходной. */
export function createSimulation(model: GraphModel): LayoutState {
  return {
    nodes: model.nodes.map((node) => ({
      id: node.id,
      radius: node.radius,
      position: { ...node.position },
      velocity: { x: 0, y: 0, z: 0 },
      pinned: false,
    })),
    links: model.links.map((link) => ({ ...link })),
    alpha: ALPHA_START,
    spacing: 1,
  };
}

/**
 * Один шаг симуляции: отталкивание всех пар, пружины по связям, слабое
 * притяжение к центру. Состояние меняется на месте — шаг вызывается каждый кадр.
 */
export function stepSimulation(state: LayoutState): LayoutState {
  const { nodes, links, alpha } = state;
  const count = nodes.length;
  const forces: Vec3[] = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0 }));

  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const a = nodes[i]!.position;
      const b = nodes[j]!.position;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      const dz = a.z - b.z;
      let distance = Math.hypot(dx, dy, dz);

      if (distance < MIN_DISTANCE) {
        dx += (i - j) * 0.5;
        dy += 0.5;
        distance = MIN_DISTANCE;
      }

      const push = REPULSION / (distance * distance * distance);
      const fi = forces[i]!;
      const fj = forces[j]!;
      fi.x += dx * push;
      fi.y += dy * push;
      fi.z += dz * push;
      fj.x -= dx * push;
      fj.y -= dy * push;
      fj.z -= dz * push;

      if (Math.abs(dz) > GAP_Z) continue;

      const gapX = (nodes[i]!.radius + nodes[j]!.radius) * state.spacing;
      const gapY = GAP_Y * state.spacing;
      const overlap = Math.hypot(dx / gapX, dy / gapY);
      if (overlap >= 1) continue;

      const planarX = Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 ? i - j : dx;
      const planar = Math.hypot(planarX, dy);
      const separation = (SEPARATION * (1 - overlap) * gapX) / planar;
      fi.x += planarX * separation;
      fi.y += dy * separation;
      fj.x -= planarX * separation;
      fj.y -= dy * separation;
    }
  }

  for (const link of links) {
    const a = nodes[link.source]!;
    const b = nodes[link.target]!;
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dz = b.position.z - a.position.z;
    const distance = Math.max(Math.hypot(dx, dy, dz), MIN_DISTANCE);
    const pull = ((distance - REST_LENGTH) * SPRING) / distance;

    const fa = forces[link.source]!;
    const fb = forces[link.target]!;
    fa.x += dx * pull;
    fa.y += dy * pull;
    fa.z += dz * pull;
    fb.x -= dx * pull;
    fb.y -= dy * pull;
    fb.z -= dz * pull;
  }

  for (let i = 0; i < count; i += 1) {
    const node = nodes[i]!;
    const force = forces[i]!;
    const length =
      Math.hypot(node.position.x, node.position.y, node.position.z) || MIN_DISTANCE;
    const shell = ((SHELL_RADIUS - length) * SHELL) / length;
    force.x += node.position.x * shell;
    force.y += node.position.y * shell;
    force.z += node.position.z * shell;

    if (node.pinned) {
      node.velocity.x = 0;
      node.velocity.y = 0;
      node.velocity.z = 0;
      continue;
    }

    node.velocity.x = (node.velocity.x + force.x * alpha) * DAMPING;
    node.velocity.y = (node.velocity.y + force.y * alpha) * DAMPING;
    node.velocity.z = (node.velocity.z + force.z * alpha) * DAMPING;

    node.position.x += clampStep(node.velocity.x);
    node.position.y += clampStep(node.velocity.y);
    node.position.z += clampStep(node.velocity.z);
  }

  state.alpha = alpha * (1 - ALPHA_DECAY);
  return state;
}

function clampStep(value: number): number {
  if (value > MAX_STEP) return MAX_STEP;
  if (value < -MAX_STEP) return -MAX_STEP;
  return value;
}

/** Узел под пальцем: силы на него не действуют, позицию задаёт указатель. */
export function pinNode(state: LayoutState, index: number, pinned: boolean): void {
  const node = state.nodes[index];
  if (!node) return;
  node.pinned = pinned;
}

export function moveNode(state: LayoutState, index: number, position: Vec3): void {
  const node = state.nodes[index];
  if (!node) return;
  node.position.x = position.x;
  node.position.y = position.y;
  node.position.z = position.z;
}

/** Запас расстояния под текущий масштаб сцены. Возвращает `true`, если он изменился. */
export function setSpacing(state: LayoutState, spacing: number): boolean {
  if (Math.abs(state.spacing - spacing) < 0.02) return false;
  state.spacing = spacing;
  return true;
}

/** Разогрев после ручного вмешательства: граф пересобирается и снова замирает. */
export function reheat(state: LayoutState, alpha: number): void {
  state.alpha = Math.max(state.alpha, alpha);
}

/** Догоняет симуляцию до покоя: нужен там, где движение выключено настройкой. */
export function settleLayout(state: LayoutState): LayoutState {
  let guard = 0;
  while (state.alpha > ALPHA_MIN && guard < 600) {
    stepSimulation(state);
    guard += 1;
  }
  return state;
}
