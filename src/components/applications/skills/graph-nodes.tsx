'use client';

import { techNodeById } from '@/data/tech-graph';
import { cn } from '@/lib/cn';
import type { ProjectedPoint } from '@/lib/tech-graph/camera';
import { NODE_HEIGHT, nodeWidth } from '@/lib/tech-graph/render';

type Props = {
  /** Узлы модели в порядке отрисовки: карточке нужен только идентификатор. */
  nodes: readonly { id: string }[];
  /** Стартовые позиции: дальше карточки двигает `paint`, минуя React. */
  points: ProjectedPoint[];
  activeId: string | null;
  activeNeighbours: ReadonlySet<string> | null;
  selectedId: string | null;
  /** Узлы слоя запоминаются по индексу: по ним идёт отрисовка каждого кадра. */
  onElement: (index: number, element: SVGGElement | null) => void;
  onHover: (id: string) => void;
  /** Уход курсора: сбрасывает подсветку, если она всё ещё на этом узле. */
  onLeave: (id: string) => void;
};

/**
 * Слой карточек. React рисует их один раз и только пересчитывает подсветку —
 * положение на каждом кадре пишет `paint` прямо в атрибут `transform`.
 */
export function GraphNodes({
  nodes,
  points,
  activeId,
  activeNeighbours,
  selectedId,
  onElement,
  onHover,
  onLeave,
}: Props) {
  return (
    <>
      {nodes.map((modelNode, index) => {
        const node = techNodeById.get(modelNode.id);
        if (!node) return null;

        const point = points[index];
        const width = nodeWidth(node.label);
        const isActive = activeId === node.id;
        const isNeighbour = activeNeighbours?.has(node.id) ?? false;
        const isSelected = selectedId === node.id;

        return (
          <g
            key={node.id}
            ref={(element) => {
              onElement(index, element);
            }}
            data-node={node.id}
            transform={`translate(${point?.x ?? 0} ${point?.y ?? 0})`}
            className="cursor-pointer"
            onPointerEnter={() => onHover(node.id)}
            onPointerLeave={() => onLeave(node.id)}
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
    </>
  );
}
