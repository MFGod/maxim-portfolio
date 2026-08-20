'use client';

import { CircleQuestionMark, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { techEdges, techNodeById, techNodes } from '@/data/tech-graph';
import { cn } from '@/lib/cn';
import {
  DEFAULT_VIEWPORT,
  ZOOM_RANGE,
  cardScale,
  clampCamera,
  depthFactor,
  fitZoom,
  initialCamera,
  projectPoint,
  unprojectDelta,
  type Camera,
  type ProjectedPoint,
  type Viewport,
} from '@/lib/tech-graph/camera';
import {
  ALPHA_MIN,
  ALPHA_REHEAT,
  createGraphModel,
  createSimulation,
  moveNode,
  pinNode,
  reheat,
  setSpacing,
  settleLayout,
  stepSimulation,
  type LayoutState,
  type Vec3,
} from '@/lib/tech-graph/layout';

const NODE_HEIGHT = 28;
const CHAR_WIDTH = 7.1;
const LABEL_PADDING = 26;
const HALO_RADIUS = 58;
const MOVE_THRESHOLD = 4;
const FIT_MARGIN = 40;
const ROTATE_SPEED = 0.005;
const ZOOM_STEP = 1.22;

/**
 * Знак рыскания: при росте `yaw` передняя сторона шара уезжает влево, поэтому
 * жест, инерция и собственный ход считают скорость в экранных направлениях и
 * переводятся в угол через этот множитель. «Вправо» везде значит вправо.
 */
const YAW_DIRECTION = -1;

/** Собственное вращение шара, рад/с. Оборот примерно за полторы минуты. */
const IDLE_SPIN = 0.07;
/** Предел скорости после броска или подталкивания курсором. */
const MAX_SPIN = 0.9;
/** Скорость возврата к спокойному вращению, доля в секунду. */
const SPIN_SETTLE = 1.1;
/** Плавность выхода на целевую скорость. */
const SPIN_EASE = 5;
/** Ниже этого шар считается стоящим и кадры больше не запрашиваются. */
const SPIN_EPSILON = 0.002;

type Gesture = {
  kind: 'rotate' | 'pan' | 'node';
  pointerId: number;
  clientX: number;
  clientY: number;
  /** Последняя точка и время: из них считается инерция после броска. */
  lastX: number;
  lastY: number;
  lastTime: number;
  velocityX: number;
  velocityY: number;
  camera: Camera;
  unit: number;
  nodeIndex: number;
  nodeOrigin: Vec3;
  nodeScale: number;
  moved: boolean;
};

type Pinch = {
  distance: number;
  centerX: number;
  centerY: number;
  camera: Camera;
  unit: number;
};

type Props = {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Симуляция и её оседание. Выключается настройкой движения. */
  animated: boolean;
  /** Собственное вращение шара. Отключается на «уменьшенном» уровне движения. */
  autoSpin: boolean;
  /** Строки подсказки под кнопкой «?». */
  hints: string[];
};

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

function nodeWidth(label: string): number {
  return label.length * CHAR_WIDTH + LABEL_PADDING;
}

export function TechGraph({ selectedId, onSelect, animated, autoSpin, hints }: Props) {
  const gradientId = useId();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hintsOpen, setHintsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodeLayerRef = useRef<SVGGElement | null>(null);
  const nodeElements = useRef<(SVGGElement | null)[]>([]);
  const depthOrderRef = useRef<number[]>([]);
  const edgeLayers = useRef<{
    far: SVGPathElement | null;
    near: SVGPathElement | null;
    active: SVGPathElement | null;
  }>({ far: null, near: null, active: null });
  const haloRef = useRef<SVGCircleElement | null>(null);
  /** Что подсвечено сейчас. Читает `paint`, чтобы не перерисовывать React. */
  const highlightRef = useRef<{ activeId: string | null; neighbours: Set<string> }>({
    activeId: null,
    neighbours: new Set(),
  });

  const model = useMemo(() => createGraphModel(techNodes, techEdges), []);

  const simulationRef = useRef<LayoutState | null>(null);
  if (simulationRef.current == null) {
    simulationRef.current = createSimulation(createGraphModel(techNodes, techEdges));
  }

  const cameraRef = useRef<Camera>({ ...initialCamera });
  const viewportRef = useRef<Viewport>({ ...DEFAULT_VIEWPORT });
  const baseZoomRef = useRef(1);
  const gestureRef = useRef<Gesture | null>(null);
  const pinchRef = useRef<Pinch | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const reheatRef = useRef<() => void>(() => {});
  const startLoopRef = useRef<() => void>(() => {});
  const paintFrameRef = useRef(0);
  /** Пока человек не тронул граф, композицию подбирает автоподгонка. */
  const adjustedRef = useRef(false);
  /** Текущая угловая скорость шара, рад/с. */
  const spinRef = useRef({ yaw: IDLE_SPIN, pitch: 0 });
  /** Куда шар разгоняется: курсор и броски пишут сюда, скорость тянется следом. */
  const targetSpinRef = useRef({ yaw: IDLE_SPIN, pitch: 0 });
  const visibleRef = useRef(true);

  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const node of techNodes) map.set(node.id, new Set());
    for (const edge of techEdges) {
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    }
    return map;
  }, []);

  const initialPoints = useMemo<ProjectedPoint[]>(
    () =>
      model.nodes.map((node) =>
        projectPoint(
          node.position,
          initialCamera,
          fitZoom(DEFAULT_VIEWPORT),
          DEFAULT_VIEWPORT,
        ),
      ),
    [model],
  );

  const initialEdges = useMemo(() => {
    let far = '';
    let near = '';
    for (const link of model.links) {
      const from = initialPoints[link.source];
      const to = initialPoints[link.target];
      if (!from || !to) continue;
      const segment = `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
      if ((from.depth + to.depth) / 2 > 0) far += segment;
      else near += segment;
    }
    return { far, near };
  }, [initialPoints, model]);

  const paint = useCallback(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    const camera = cameraRef.current;
    const zoom = camera.zoom * baseZoomRef.current;
    const viewport = viewportRef.current;
    const card = cardScale(baseZoomRef.current);
    const highlight = highlightRef.current;

    const points = simulation.nodes.map((node) =>
      projectPoint(node.position, camera, zoom, viewport),
    );

    points.forEach((point, index) => {
      const element = nodeElements.current[index];
      if (!element) return;

      const scale = Math.min(1.18, Math.max(0.72, point.scale)) * card;
      element.setAttribute(
        'transform',
        `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)}) scale(${scale.toFixed(3)})`,
      );

      const id = simulation.nodes[index]?.id;
      const dimmed =
        highlight.activeId !== null &&
        id !== highlight.activeId &&
        !highlight.neighbours.has(id ?? '');
      element.style.opacity = (
        (0.4 + 0.6 * depthFactor(point.depth)) *
        (dimmed ? 0.2 : 1)
      ).toFixed(3);
    });

    sortByDepth(points, depthOrderRef, nodeLayerRef.current, nodeElements.current);

    // Связи рисуются тремя путями, а не шестью десятками линий: один узел SVG
    // вместо шестидесяти трёх — это и меньше записей в DOM, и меньше работы
    // растеризатору на каждом кадре поворота.
    let far = '';
    let near = '';
    let active = '';

    simulation.links.forEach((link) => {
      const from = points[link.source];
      const to = points[link.target];
      if (!from || !to) return;

      const segment = `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
      const sourceId = simulation.nodes[link.source]?.id;
      const targetId = simulation.nodes[link.target]?.id;

      if (
        highlight.activeId !== null &&
        (sourceId === highlight.activeId || targetId === highlight.activeId)
      ) {
        active += segment;
        return;
      }

      if ((from.depth + to.depth) / 2 > 0) far += segment;
      else near += segment;
    });

    edgeLayers.current.far?.setAttribute('d', far);
    edgeLayers.current.near?.setAttribute('d', near);
    edgeLayers.current.active?.setAttribute('d', active);

    const halo = haloRef.current;
    if (halo) {
      const index = highlight.activeId
        ? simulation.nodes.findIndex((node) => node.id === highlight.activeId)
        : -1;
      const point = index >= 0 ? points[index] : null;
      if (point) {
        halo.setAttribute('cx', point.x.toFixed(1));
        halo.setAttribute('cy', point.y.toFixed(1));
        halo.style.opacity = '1';
      } else {
        halo.style.opacity = '0';
      }
    }
  }, []);

  /**
   * Собственное вращение. Скорость тянется к цели, цель — к спокойному
   * значению, так что бросок плавно переходит в неспешный ход планеты.
   * Возвращает `true`, пока шар ещё движется.
   */
  const applySpin = useCallback(
    (seconds: number) => {
      if (!autoSpin) return false;
      if (gestureRef.current || pinchRef.current) return false;

      const spin = spinRef.current;
      const target = targetSpinRef.current;
      const settle = Math.min(1, SPIN_SETTLE * seconds);

      // Наведение на узел останавливает шар: подпись под курсором не должна уезжать.
      const paused = highlightRef.current.activeId !== null;
      const sign = target.yaw < 0 ? -1 : 1;
      target.yaw += (IDLE_SPIN * sign - target.yaw) * settle;
      target.pitch += (0 - target.pitch) * settle;

      const ease = Math.min(1, SPIN_EASE * seconds);
      spin.yaw += ((paused ? 0 : target.yaw) - spin.yaw) * ease;
      spin.pitch += ((paused ? 0 : target.pitch) - spin.pitch) * ease;

      if (Math.abs(spin.yaw) < SPIN_EPSILON && Math.abs(spin.pitch) < SPIN_EPSILON) {
        return false;
      }

      const camera = cameraRef.current;
      cameraRef.current = clampCamera({
        ...camera,
        yaw: camera.yaw + YAW_DIRECTION * spin.yaw * seconds,
        pitch: camera.pitch + spin.pitch * seconds,
      });
      return true;
    },
    [autoSpin],
  );

  /** Вписывает граф в сцену: после расстановки он не должен упираться в края. */
  const fitToViewport = useCallback(() => {
    const simulation = simulationRef.current;
    if (!simulation || adjustedRef.current) return;

    const viewport = viewportRef.current;
    const camera = cameraRef.current;
    const base = baseZoomRef.current;
    const card = cardScale(base);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of simulation.nodes) {
      const point = projectPoint(node.position, camera, camera.zoom * base, viewport);
      const halfWidth = (nodeWidth(techNodeById.get(node.id)?.label ?? '') / 2) * card;
      const halfHeight = (NODE_HEIGHT / 2) * card;
      minX = Math.min(minX, point.x - halfWidth);
      maxX = Math.max(maxX, point.x + halfWidth);
      minY = Math.min(minY, point.y - halfHeight);
      maxY = Math.max(maxY, point.y + halfHeight);
    }

    const width = maxX - minX;
    const height = maxY - minY;
    if (!Number.isFinite(width) || width <= 0 || height <= 0) return;

    const factor = Math.min(
      (viewport.width - FIT_MARGIN * 2) / width,
      (viewport.height - FIT_MARGIN * 2) / height,
      ZOOM_RANGE.max / camera.zoom,
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    cameraRef.current = clampCamera({
      ...camera,
      zoom: camera.zoom * factor,
      panX: -(centerX - viewport.width / 2 - camera.panX) * factor,
      panY: -(centerY - viewport.height / 2 - camera.panY) * factor,
    });
  }, []);

  const schedulePaint = useCallback(() => {
    if (paintFrameRef.current) return;
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = 0;
      paint();
    });
  }, [paint]);

  const handlersRef = useRef({ schedulePaint, fitToViewport });
  useEffect(() => {
    handlersRef.current = { schedulePaint, fitToViewport };
  }, [fitToViewport, schedulePaint]);

  // Наблюдатель создаётся один раз: пересоздание на каждом рендере отменяло
  // первый — и единственный — вызов, а сцена так и оставалась стартового размера.
  // Наблюдатель создаётся один раз: пересоздание на каждом рендере отменяло бы
  // его единственный вызов. Первый замер снимается синхронно — в фоновой вкладке
  // ResizeObserver молчит, а сцена нужна с правильным размером сразу.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const apply = (width: number, height: number) => {
      if (width < 1 || height < 1) return;
      const viewport = { width: Math.round(width), height: Math.round(height) };
      if (
        viewport.width === viewportRef.current.width &&
        viewport.height === viewportRef.current.height
      ) {
        return;
      }

      viewportRef.current = viewport;
      const base = fitZoom(viewport);
      baseZoomRef.current = base;
      svgRef.current?.setAttribute(
        'viewBox',
        `0 0 ${viewport.width} ${viewport.height}`,
      );

      const simulation = simulationRef.current;
      if (simulation && setSpacing(simulation, cardScale(base) / base)) {
        reheatRef.current();
      } else {
        handlersRef.current.fitToViewport();
      }
      handlersRef.current.schedulePaint();
    };

    const rect = container.getBoundingClientRect();
    apply(rect.width, rect.height);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) apply(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);

    // Вне экрана шар не крутится: незачем греть кадры ради того, чего не видно.
    const visibility = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry?.isIntersecting ?? true;
      if (visibleRef.current) startLoopRef.current();
    });
    visibility.observe(container);

    return () => {
      observer.disconnect();
      visibility.disconnect();
    };
  }, []);

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    let frame = 0;
    let running = false;
    let previous = 0;
    let framed = false;

    const loop = (time: number) => {
      const seconds = previous ? Math.min(0.05, (time - previous) / 1000) : 1 / 60;
      previous = time;

      const hot = animated && simulation.alpha > ALPHA_MIN;
      if (hot) stepSimulation(simulation);
      else if (!framed) {
        framed = true;
        fitToViewport();
      }

      const spinning = applySpin(seconds);
      paint();

      if (hot || spinning) {
        frame = requestAnimationFrame(loop);
      } else {
        running = false;
        frame = 0;
        previous = 0;
      }
    };

    const start = () => {
      if (running || !visibleRef.current) return;
      running = true;
      previous = 0;
      frame = requestAnimationFrame(loop);
    };

    startLoopRef.current = start;

    reheatRef.current = () => {
      if (!animated) {
        settleLayout(simulation);
        fitToViewport();
        paint();
        return;
      }
      reheat(simulation, ALPHA_REHEAT);
      start();
    };

    if (!animated) {
      settleLayout(simulation);
      fitToViewport();
      framed = true;
    }
    paint();
    start();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      running = false;
      reheatRef.current = () => {};
      startLoopRef.current = () => {};
    };
  }, [animated, applySpin, fitToViewport, paint]);

  const zoomBy = useCallback(
    (factor: number) => {
      adjustedRef.current = true;
      const camera = cameraRef.current;
      cameraRef.current = clampCamera({ ...camera, zoom: camera.zoom * factor });
      schedulePaint();
    },
    [schedulePaint],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [zoomBy]);

  const resetView = useCallback(() => {
    cameraRef.current = { ...initialCamera };
    adjustedRef.current = false;
    fitToViewport();
    schedulePaint();
  }, [fitToViewport, schedulePaint]);

  const beginPinch = useCallback(() => {
    const [first, second] = [...pointersRef.current.values()];
    const svg = svgRef.current;
    if (!first || !second || !svg) return;
    gestureRef.current = null;
    pinchRef.current = {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      centerX: (first.x + second.x) / 2,
      centerY: (first.y + second.y) / 2,
      camera: { ...cameraRef.current },
      unit: viewportRef.current.width / svg.getBoundingClientRect().width,
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

    adjustedRef.current = true;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }

    // Захват указателя — оптимизация, а не условие жеста: браузер вправе
    // отказать, и тогда жест продолжается по событиям самого узла.
    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // Работаем без захвата.
    }

    setHintsOpen(false);

    const unit = viewportRef.current.width / svg.getBoundingClientRect().width;
    const target =
      event.target instanceof Element ? event.target.closest('[data-node]') : null;
    const nodeId = target?.getAttribute('data-node') ?? null;
    const simulation = simulationRef.current;
    const nodeIndex =
      nodeId && simulation
        ? simulation.nodes.findIndex((item) => item.id === nodeId)
        : -1;
    const node = nodeIndex >= 0 ? (simulation?.nodes[nodeIndex] ?? null) : null;
    const panRequested = event.shiftKey || event.button === 1 || event.button === 2;

    gestureRef.current = {
      kind: node ? 'node' : panRequested ? 'pan' : 'rotate',
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
      camera: { ...cameraRef.current },
      unit,
      nodeIndex,
      nodeOrigin: node ? { ...node.position } : { x: 0, y: 0, z: 0 },
      nodeScale: node
        ? projectPoint(
            node.position,
            cameraRef.current,
            cameraRef.current.zoom * baseZoomRef.current,
            viewportRef.current,
          ).scale
        : 1,
      moved: false,
    };

    if (simulation && nodeIndex >= 0) pinNode(simulation, nodeIndex, true);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const tracked = pointersRef.current.get(event.pointerId);
    if (tracked) {
      tracked.x = event.clientX;
      tracked.y = event.clientY;
    }

    const pinch = pinchRef.current;
    if (pinch) {
      const [first, second] = [...pointersRef.current.values()];
      if (!first || !second) return;
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;

      cameraRef.current = clampCamera({
        ...pinch.camera,
        zoom: pinch.camera.zoom * (distance / Math.max(pinch.distance, 1)),
        panX: pinch.camera.panX + (centerX - pinch.centerX) * pinch.unit,
        panY: pinch.camera.panY + (centerY - pinch.centerY) * pinch.unit,
      });
      schedulePaint();
      return;
    }

    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dx = event.clientX - gesture.clientX;
    const dy = event.clientY - gesture.clientY;
    if (!gesture.moved && Math.abs(dx) + Math.abs(dy) < MOVE_THRESHOLD) return;
    gesture.moved = true;

    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0) {
      gesture.velocityX = (event.clientX - gesture.lastX) / elapsed;
      gesture.velocityY = (event.clientY - gesture.lastY) / elapsed;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      gesture.lastTime = event.timeStamp;
    }

    if (gesture.kind === 'rotate') {
      cameraRef.current = clampCamera({
        ...cameraRef.current,
        yaw: gesture.camera.yaw + YAW_DIRECTION * dx * ROTATE_SPEED,
        pitch: gesture.camera.pitch + dy * ROTATE_SPEED,
      });
      schedulePaint();
      return;
    }

    if (gesture.kind === 'pan') {
      cameraRef.current = clampCamera({
        ...cameraRef.current,
        panX: gesture.camera.panX + dx * gesture.unit,
        panY: gesture.camera.panY + dy * gesture.unit,
      });
      schedulePaint();
      return;
    }

    const simulation = simulationRef.current;
    if (!simulation) return;
    const delta = unprojectDelta(
      dx * gesture.unit,
      dy * gesture.unit,
      gesture.nodeScale,
      cameraRef.current,
      cameraRef.current.zoom * baseZoomRef.current,
    );
    moveNode(simulation, gesture.nodeIndex, {
      x: gesture.nodeOrigin.x + delta.x,
      y: gesture.nodeOrigin.y + delta.y,
      z: gesture.nodeOrigin.z + delta.z,
    });
    schedulePaint();
  };

  const finishPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;

    if (gesture.kind === 'rotate' && gesture.moved && autoSpin) {
      const target = targetSpinRef.current;
      target.yaw = clamp(gesture.velocityX * ROTATE_SPEED * 1000, MAX_SPIN);
      target.pitch = clamp(gesture.velocityY * ROTATE_SPEED * 400, MAX_SPIN * 0.5);
      spinRef.current = { ...target };
    }
    startLoopRef.current();

    const simulation = simulationRef.current;
    const node = gesture.kind === 'node' ? simulation?.nodes[gesture.nodeIndex] : null;
    if (simulation && node) {
      pinNode(simulation, gesture.nodeIndex, false);
      if (gesture.moved) reheatRef.current();
    }

    if (gesture.moved) return;
    if (gesture.kind === 'node' && node) {
      onSelect(selectedId === node.id ? null : node.id);
      return;
    }
    onSelect(null);
  };

  const activeId = hoveredId ?? selectedId;
  const activeNeighbours = activeId ? neighbours.get(activeId) : null;

  useEffect(() => {
    highlightRef.current = {
      activeId,
      neighbours: activeNeighbours ?? new Set<string>(),
    };
    schedulePaint();
  }, [activeId, activeNeighbours, schedulePaint]);

  return (
    <div
      ref={containerRef}
      className="relative size-full"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at center, color-mix(in oklab, var(--color-void) 55%, transparent), color-mix(in oklab, var(--color-void) 28%, transparent) 70%, transparent 100%)',
        contain: 'paint',
      }}
    >
      <svg
        ref={svgRef}
        aria-hidden
        viewBox={`0 0 ${DEFAULT_VIEWPORT.width} ${DEFAULT_VIEWPORT.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="size-full touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onDoubleClick={resetView}
        onContextMenu={(event) => event.preventDefault()}
      >
        <defs>
          <radialGradient id={gradientId}>
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.5" />
            <stop offset="55%" stopColor="var(--color-accent)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle
          ref={haloRef}
          cx={DEFAULT_VIEWPORT.width / 2}
          cy={DEFAULT_VIEWPORT.height / 2}
          r={HALO_RADIUS}
          fill={`url(#${gradientId})`}
          style={{ opacity: 0 }}
          className="transition-opacity duration-(--duration-base)"
          pointerEvents="none"
        />

        <path
          ref={(element) => {
            edgeLayers.current.far = element;
          }}
          d={initialEdges.far}
          fill="none"
          strokeWidth={0.8}
          className="stroke-line-strong"
          style={{ opacity: activeId ? 0.12 : 0.45 }}
          pointerEvents="none"
        />
        <path
          ref={(element) => {
            edgeLayers.current.near = element;
          }}
          d={initialEdges.near}
          fill="none"
          strokeWidth={0.8}
          className="stroke-line-strong"
          style={{ opacity: activeId ? 0.18 : 0.85 }}
          pointerEvents="none"
        />
        <path
          ref={(element) => {
            edgeLayers.current.active = element;
          }}
          d=""
          fill="none"
          strokeWidth={1.4}
          className="stroke-accent"
          pointerEvents="none"
        />

        <g ref={nodeLayerRef}>
          {model.nodes.map((modelNode, index) => {
            const node = techNodeById.get(modelNode.id);
            if (!node) return null;

            const point = initialPoints[index];
            const width = nodeWidth(node.label);
            const isActive = activeId === node.id;
            const isNeighbour = activeNeighbours?.has(node.id) ?? false;
            const isSelected = selectedId === node.id;

            return (
              <g
                key={node.id}
                ref={(element) => {
                  nodeElements.current[index] = element;
                }}
                data-node={node.id}
                transform={`translate(${point?.x ?? 0} ${point?.y ?? 0})`}
                className="cursor-pointer"
                onPointerEnter={() => setHoveredId(node.id)}
                onPointerLeave={() =>
                  setHoveredId((current) => (current === node.id ? null : current))
                }
              >
                <rect
                  x={-width / 2}
                  y={-NODE_HEIGHT / 2}
                  width={width}
                  height={NODE_HEIGHT}
                  rx={7}
                  className={cn(
                    'fill-surface-1/85 transition-[stroke,fill] duration-(--duration-fast)',
                    isActive || isSelected
                      ? 'stroke-accent fill-surface-2/90'
                      : isNeighbour
                        ? 'stroke-accent-dim'
                        : 'stroke-line',
                  )}
                  strokeWidth={isActive || isSelected ? 1.2 : 0.8}
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fontSize={12}
                  className={cn(
                    'pointer-events-none font-mono transition-colors duration-(--duration-fast)',
                    isActive || isSelected ? 'fill-accent-bright' : 'fill-ink-muted',
                  )}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-3 bottom-3 flex flex-col items-end gap-1">
        <ViewButton label="Приблизить" onClick={() => zoomBy(ZOOM_STEP)}>
          <Plus aria-hidden className="size-3.5" />
        </ViewButton>
        <ViewButton label="Отдалить" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <Minus aria-hidden className="size-3.5" />
        </ViewButton>
        <ViewButton label="Сбросить вид" onClick={resetView}>
          <RotateCcw aria-hidden className="size-3.5" />
        </ViewButton>
        <ViewButton
          label="Подсказки"
          expanded={hintsOpen}
          onClick={() => setHintsOpen((open) => !open)}
        >
          <CircleQuestionMark aria-hidden className="size-3.5" />
        </ViewButton>

        {hintsOpen ? (
          <ul
            className={cn(
              'border-line-subtle bg-glass-hud absolute right-9 bottom-0 w-56 space-y-1.5 rounded-lg border p-3',
              'text-2xs text-ink-muted backdrop-blur-(--glass-blur-soft)',
            )}
          >
            {hints.map((hint) => (
              <li key={hint} className="flex gap-2">
                <span
                  aria-hidden
                  className="border-accent/70 mt-1 size-1 shrink-0 rotate-45 border"
                />
                <span className="min-w-0">{hint}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Ближние узлы рисуются последними — иначе дальняя карточка перекрывает ближнюю,
 * и глубина читается наоборот. Перестановок ровно столько, сколько узлов реально
 * поменялись местами: при повороте это единицы, а не все сорок четыре.
 */
function sortByDepth(
  points: ProjectedPoint[],
  orderRef: { current: number[] },
  layer: SVGGElement | null,
  elements: (SVGGElement | null)[],
) {
  if (!layer) return;

  const order = points
    .map((point, index) => ({ index, depth: point.depth }))
    .sort((a, b) => b.depth - a.depth)
    .map((entry) => entry.index);

  const previous = orderRef.current;
  if (
    previous.length === order.length &&
    order.every((index, position) => previous[position] === index)
  ) {
    return;
  }

  orderRef.current = order;

  let reference: ChildNode | null = null;
  for (let position = order.length - 1; position >= 0; position -= 1) {
    const element = elements[order[position]!];
    if (!element) continue;
    if (element.nextSibling !== reference) layer.insertBefore(element, reference);
    reference = element;
  }
}

function ViewButton({
  label,
  onClick,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Задано для кнопки, раскрывающей панель. */
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
      className={cn(
        'group border-line-subtle bg-surface-1/70 relative grid size-7 place-items-center rounded-md border',
        'hover:border-accent-dim hover:text-ink backdrop-blur-(--glass-blur-soft)',
        'transition-colors duration-(--duration-fast)',
        expanded ? 'border-accent-dim text-ink' : 'text-ink-faint',
      )}
    >
      {children}
      {/* Подпись уезжает влево от колонки: снизу её обрезал бы край окна, а
          поверх кнопки она закрывала бы то, на что человек целится. */}
      <span
        aria-hidden
        className={cn(
          'border-line-subtle bg-glass-hud text-2xs text-ink-muted pointer-events-none absolute',
          'top-1/2 right-full mr-1.5 -translate-y-1/2 rounded-md border px-2 py-1 whitespace-nowrap',
          'opacity-0 backdrop-blur-(--glass-blur-soft) transition-opacity',
          'group-kbd-focus:opacity-100 duration-(--duration-fast) group-hover:opacity-100',
        )}
      >
        {label}
      </span>
    </button>
  );
}
