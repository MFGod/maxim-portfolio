'use client';

import { useReducedMotion } from 'motion/react';
import { useState } from 'react';

import {
  techCategoryLabels,
  techEdges,
  techNodeById,
  techNodes,
  type TechCategory,
} from '@/data/tech-graph';
import { cn } from '@/lib/cn';
import { useSetting } from '@/lib/settings';

import { TechGraph } from './tech-graph';

/** Навыки по разделам. Набор статичен — считается один раз на модуль. */
const groupedSkills = (() => {
  const map = new Map<TechCategory, string[]>();
  for (const node of techNodes) {
    if (!node.category) continue;
    const items = map.get(node.category);
    if (items) items.push(node.label);
    else map.set(node.category, [node.label]);
  }
  return [...map.entries()];
})();

const HINTS = [
  'Нажмите на узел — увидите его связи',
  'Тяните — вращайте граф',
  'Shift + мышь или два пальца по touch pad — перемещайте',
  'Колесо — приближайте и отдаляйте',
];

export function SkillsApp() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const animationLevel = useSetting((settings) => settings.motion.animations);
  const systemReduceMotion = useReducedMotion();
  const animated = animationLevel !== 'off' && !systemReduceMotion;

  const links = selectedId
    ? techEdges
        .filter((edge) => edge.source === selectedId || edge.target === selectedId)
        .map((edge) => (edge.source === selectedId ? edge.target : edge.source))
    : [];

  const selected = selectedId ? techNodeById.get(selectedId) : null;

  return (
    <div className="@container relative flex h-full min-h-0 scrollbar-thin flex-col overflow-y-auto @md:overflow-hidden">
      <div className="relative h-[52vh] min-h-64 shrink-0 @md:h-full @md:min-h-0 @md:flex-1">
        <TechGraph
          selectedId={selectedId}
          onSelect={setSelectedId}
          animated={animated}
          autoSpin={animationLevel === 'full' && !systemReduceMotion}
          hints={HINTS}
        />
      </div>

      {selected ? (
        <footer
          className={cn(
            'shrink-0 px-4 pb-4',
            '@md:absolute @md:bottom-0 @md:left-0 @md:z-10 @md:max-w-96 @md:p-5',
          )}
        >
          <div className="border-line-subtle bg-glass-hud rounded-lg border p-3 backdrop-blur-(--glass-blur-soft)">
            <div className="flex items-baseline gap-2">
              <h3 className="text-ink font-display text-base tracking-tight">
                {selected.label}
              </h3>
              {selected.category ? (
                <span className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
                  {techCategoryLabels[selected.category]}
                </span>
              ) : null}
            </div>

            {links.length > 0 ? (
              <ul className="mt-2 flex max-h-32 scrollbar-thin flex-wrap gap-1.5 overflow-y-auto">
                {links.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(id)}
                      className={cn(
                        'border-accent-dim/35 bg-accent-wash text-2xs text-ink-muted rounded-sm border px-2 py-0.5 font-mono',
                        'hover:border-accent hover:text-ink transition-colors duration-(--duration-fast)',
                      )}
                    >
                      {techNodeById.get(id)?.label ?? id}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </footer>
      ) : null}

      <div className="shrink-0 px-4 pb-4 @md:sr-only">
        <h3 className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
          Весь стек по категориям
        </h3>
        <dl className="mt-2 space-y-2">
          {groupedSkills.map(([category, items]) => (
            <div key={category}>
              <dt className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
                {techCategoryLabels[category]}
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {items.map((item) => (
                  <span
                    key={item}
                    className="border-accent-dim/35 bg-accent-wash text-2xs text-ink-muted rounded-sm border px-2 py-0.5 font-mono"
                  >
                    {item}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
