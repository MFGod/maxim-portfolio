'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

import { YAW_DIRECTION } from '@/hooks/use-graph-spin';
import {
  clampCamera,
  projectPoint,
  unprojectDelta,
  type Camera,
  type Viewport,
} from '@/lib/tech-graph/camera';
import {
  moveNode,
  pinNode,
  type LayoutState,
  type Vec3,
} from '@/lib/tech-graph/layout';

/** Ниже этого сдвига жест остаётся нажатием, а не поворотом. */
const MOVE_THRESHOLD = 4;
/** Радиан на пиксель при повороте шара. */
const ROTATE_SPEED = 0.005;
/** Шаг колеса и кнопок масштаба. */
export const ZOOM_STEP = 1.22;

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

type Options = {
  svgRef: RefObject<SVGSVGElement | null>;
  cameraRef: RefObject<Camera>;
  viewportRef: RefObject<Viewport>;
  baseZoomRef: RefObject<number>;
  simulationRef: RefObject<LayoutState | null>;
  /** Человек тронул граф — автоподгонка больше не вмешивается. */
  adjustedRef: RefObject<boolean>;
  /** Идёт жест: собственное вращение на это время замирает. */
  interactingRef: RefObject<boolean>;
  schedulePaint: () => void;
  /** Перезапуск цикла кадров: после броска шар должен доехать. */
  startLoop: () => void;
  /** Разогрев симуляции: узел, который передвинули, тянет за собой соседей. */
  reheat: () => void;
  /** Бросок переходит в инерцию вращения. */
  onFling: (yawVelocity: number, pitchVelocity: number) => void;
  /** Нажатие по узлу или по пустому месту. */
  onPick: (nodeId: string | null) => void;
  /** Любое нажатие закрывает панель подсказок. */
  onInteract: () => void;
  /** Инерция есть только при включённом собственном вращении. */
  autoSpin: boolean;
};

/**
 * Указатель над графом: поворот шара, панорама, перетаскивание узла и щипок.
 * Камера и симуляция меняются в ссылках сцены, наружу уходит только выбор узла.
 */
export function useGraphGestures({
  svgRef,
  cameraRef,
  viewportRef,
  baseZoomRef,
  simulationRef,
  adjustedRef,
  interactingRef,
  schedulePaint,
  startLoop,
  reheat,
  onFling,
  onPick,
  onInteract,
  autoSpin,
}: Options) {
  const gestureRef = useRef<Gesture | null>(null);
  const pinchRef = useRef<Pinch | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());

  /** Пикселей сцены на пиксель экрана: жест и модель считаются в одних единицах. */
  const unitOf = (svg: SVGSVGElement) =>
    viewportRef.current.width / svg.getBoundingClientRect().width;

  const zoomBy = useCallback(
    (factor: number) => {
      adjustedRef.current = true;
      const camera = cameraRef.current;
      cameraRef.current = clampCamera({ ...camera, zoom: camera.zoom * factor });
      schedulePaint();
    },
    [adjustedRef, cameraRef, schedulePaint],
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
  }, [svgRef, zoomBy]);

  const beginPinch = () => {
    const [first, second] = [...pointersRef.current.values()];
    const svg = svgRef.current;
    if (!first || !second || !svg) return;
    gestureRef.current = null;
    pinchRef.current = {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      centerX: (first.x + second.x) / 2,
      centerY: (first.y + second.y) / 2,
      camera: { ...cameraRef.current },
      unit: unitOf(svg),
    };
    interactingRef.current = true;
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

    adjustedRef.current = true;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }

    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // Работаем без захвата.
    }

    onInteract();

    const simulation = simulationRef.current;
    const target =
      event.target instanceof Element ? event.target.closest('[data-node]') : null;
    const nodeId = target?.getAttribute('data-node') ?? null;
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
      unit: unitOf(svg),
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
    interactingRef.current = true;

    if (simulation && nodeIndex >= 0) pinNode(simulation, nodeIndex, true);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
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

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    interactingRef.current = pinchRef.current !== null;

    if (gesture.kind === 'rotate' && gesture.moved && autoSpin) {
      onFling(
        gesture.velocityX * ROTATE_SPEED * 1000,
        gesture.velocityY * ROTATE_SPEED * 400,
      );
    }
    startLoop();

    const simulation = simulationRef.current;
    const node = gesture.kind === 'node' ? simulation?.nodes[gesture.nodeIndex] : null;
    if (simulation && node) {
      pinNode(simulation, gesture.nodeIndex, false);
      if (gesture.moved) reheat();
    }

    if (gesture.moved) return;
    onPick(gesture.kind === 'node' && node ? node.id : null);
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    zoomBy,
  };
}
