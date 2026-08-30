'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { techEdges, techNodeById, techNodes } from '@/data/tech-graph';
import { useGraphGestures, ZOOM_STEP } from '@/hooks/use-graph-gestures';
import { useGraphLoop } from '@/hooks/use-graph-loop';
import { useGraphPainter, type Highlight } from '@/hooks/use-graph-painter';
import { useGraphSpin } from '@/hooks/use-graph-spin';
import { useGraphViewport } from '@/hooks/use-graph-viewport';
import {
  DEFAULT_VIEWPORT,
  fitZoom,
  initialCamera,
  projectPoint,
  type Camera,
  type ProjectedPoint,
  type Viewport,
} from '@/lib/tech-graph/camera';
import {
  createGraphModel,
  createSimulation,
  type LayoutState,
} from '@/lib/tech-graph/layout';
import { edgePaths, fitCamera, neighbourMap } from '@/lib/tech-graph/render';

import { GraphHud } from './graph-hud';
import { GraphNodes } from './graph-nodes';

/** Радиус ореола под активным узлом. */
const HALO_RADIUS = 58;

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

/**
 * Граф технологий: шар из карточек, который вращается сам, отзывается на жесты
 * и раскладывается силовой симуляцией.
 */
export function TechGraph({ selectedId, onSelect, animated, autoSpin, hints }: Props) {
  const gradientId = useId();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hintsOpen, setHintsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cameraRef = useRef<Camera>({ ...initialCamera });
  const viewportRef = useRef<Viewport>({ ...DEFAULT_VIEWPORT });
  const baseZoomRef = useRef(1);
  const adjustedRef = useRef(false);
  const interactingRef = useRef(false);
  const highlightRef = useRef<Highlight>({ activeId: null, neighbours: new Set() });

  const simulationRef = useRef<LayoutState | null>(null);
  if (simulationRef.current == null) {
    simulationRef.current = createSimulation(createGraphModel(techNodes, techEdges));
  }

  const nodeLayerRef = useRef<SVGGElement | null>(null);
  const nodeElementsRef = useRef<(SVGGElement | null)[]>([]);
  const edgeLayersRef = useRef({
    far: null as SVGPathElement | null,
    near: null as SVGPathElement | null,
    active: null as SVGPathElement | null,
  });
  const haloRef = useRef<SVGCircleElement | null>(null);

  const { paint, schedulePaint } = useGraphPainter({
    nodeLayerRef,
    nodeElementsRef,
    edgeLayersRef,
    haloRef,
    cameraRef,
    viewportRef,
    baseZoomRef,
    simulationRef,
    highlightRef,
  });
  const { applySpin, push: pushSpin } = useGraphSpin({
    cameraRef,
    highlightRef,
    interactingRef,
    autoSpin,
  });

  const visibleRef = useRef(true);

  const model = useMemo(() => createGraphModel(techNodes, techEdges), []);

  const neighbours = useMemo(() => neighbourMap(techNodes, techEdges), []);

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

  const initialEdges = useMemo(
    () => edgePaths(initialPoints, model.links),
    [initialPoints, model],
  );

  /** Вписывает граф в сцену: после расстановки он не должен упираться в края. */
  const fitToViewport = useCallback(() => {
    const simulation = simulationRef.current;
    if (!simulation || adjustedRef.current) return;

    cameraRef.current = fitCamera(
      simulation.nodes,
      (id) => techNodeById.get(id)?.label ?? '',
      cameraRef.current,
      baseZoomRef.current,
      viewportRef.current,
    );
  }, []);

  const { startLoopRef, reheatRef } = useGraphLoop({
    simulationRef,
    visibleRef,
    animated,
    applySpin,
    paint,
    fitToViewport,
  });

  useGraphViewport({
    containerRef,
    svgRef,
    viewportRef,
    baseZoomRef,
    simulationRef,
    visibleRef,
    schedulePaint,
    fitToViewport,
    reheat: () => reheatRef.current(),
    startLoop: () => startLoopRef.current(),
  });

  const { handlers, zoomBy } = useGraphGestures({
    svgRef,
    cameraRef,
    viewportRef,
    baseZoomRef,
    simulationRef,
    adjustedRef,
    interactingRef,
    schedulePaint,
    startLoop: () => startLoopRef.current(),
    reheat: () => reheatRef.current(),
    onFling: pushSpin,
    onPick: (nodeId) => onSelect(nodeId && selectedId !== nodeId ? nodeId : null),
    onInteract: () => setHintsOpen(false),
    autoSpin,
  });

  const resetView = () => {
    cameraRef.current = { ...initialCamera };
    adjustedRef.current = false;
    fitToViewport();
    schedulePaint();
  };

  const activeId = hoveredId ?? selectedId;
  const activeNeighbours = activeId ? (neighbours.get(activeId) ?? null) : null;

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
        {...handlers}
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
            edgeLayersRef.current.far = element;
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
            edgeLayersRef.current.near = element;
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
            edgeLayersRef.current.active = element;
          }}
          d=""
          fill="none"
          strokeWidth={1.4}
          className="stroke-accent"
          pointerEvents="none"
        />

        <g ref={nodeLayerRef}>
          <GraphNodes
            nodes={model.nodes}
            points={initialPoints}
            activeId={activeId}
            activeNeighbours={activeNeighbours}
            selectedId={selectedId}
            onElement={(index, element) => {
              nodeElementsRef.current[index] = element;
            }}
            onHover={setHoveredId}
            onLeave={(id) =>
              setHoveredId((current) => (current === id ? null : current))
            }
          />
        </g>
      </svg>

      <GraphHud
        hints={hints}
        hintsOpen={hintsOpen}
        onToggleHints={() => setHintsOpen((open) => !open)}
        onZoomIn={() => zoomBy(ZOOM_STEP)}
        onZoomOut={() => zoomBy(1 / ZOOM_STEP)}
        onReset={resetView}
      />
    </div>
  );
}
