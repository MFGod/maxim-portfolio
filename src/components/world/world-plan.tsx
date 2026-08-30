'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { experience, projects } from '@/data/resume';
import { worldChapters, worldPeak, mainRoute } from '@/data/world-places';
import { formatPeriod } from '@/lib/format';
import { useTranslate } from '@/lib/i18n';
import { PLAN_VIEWBOX, planPolyline, toPlan } from '@/lib/world/plan';
import type { WorldSupport } from '@/lib/world/capability';

/** Радиусы в мировых юнитах: мир около 120 юнитов в поперечнике. */
const RADIUS = { chapter: 2.1, project: 1.1, peak: 2.6 };

const STATE_KEY: Record<WorldSupport, Parameters<ReturnType<typeof useTranslate>>[0]> =
  {
    ready: 'world.state.soon',
    'motion-off': 'world.state.motionOff',
    'small-screen': 'world.state.smallScreen',
    'no-webgl': 'world.state.noWebgl',
    'low-memory': 'world.state.lowMemory',
  };

function companyOf(positionId: string): string {
  return (
    experience.find((position) => position.id === positionId)?.company ?? positionId
  );
}

function projectName(slug: string): string {
  return projects.find((project) => project.slug === slug)?.name ?? slug;
}

/**
 * Главы и их проекты списком. Живёт рядом и с планом, и со сценой: в трёхмерном
 * мире он даёт клавиатурный доступ, в плоском — единственный способ открыть
 * карточку проекта.
 */
export function ChapterList() {
  const ordered = useMemo(
    () => [...worldChapters].sort((a, b) => a.order - b.order),
    [],
  );

  return (
    <ol className="mt-6 space-y-4">
      {ordered.map((chapter) => {
        const position = experience.find((entry) => entry.id === chapter.positionId);

        return (
          <li key={chapter.positionId}>
            <p className="text-2xs text-ink-faint font-mono">
              {position ? formatPeriod(position.period) : null}
              {chapter.branch ? <span className="ml-1.5">(ответвление)</span> : null}
            </p>
            <h3 className="text-ink font-display text-lg leading-snug">
              {companyOf(chapter.positionId)}
            </h3>

            <ul className="mt-2 flex flex-wrap gap-1.5">
              {chapter.projects.map((project) => (
                <li key={project.slug}>
                  <Link
                    href={`/projects/${project.slug}`}
                    className="border-line-subtle bg-surface-2 text-2xs text-ink-muted hover:border-accent-dim hover:bg-accent-wash hover:text-accent rounded-sm border px-2 py-1 transition-colors duration-(--duration-fast)"
                  >
                    {projectName(project.slug)}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

export function WorldPlan({ support }: { support: WorldSupport }) {
  const t = useTranslate();

  const route = useMemo(() => planPolyline(mainRoute().map((c) => c.grace)), []);
  const ordered = useMemo(
    () => [...worldChapters].sort((a, b) => a.order - b.order),
    [],
  );
  const peak = toPlan(worldPeak);

  return (
    <>
      <svg
        viewBox={PLAN_VIEWBOX}
        aria-hidden
        className="border-line-subtle bg-surface-2 block w-full rounded-sm border"
      >
        <polyline
          points={route}
          fill="none"
          stroke="var(--color-accent-dim)"
          strokeWidth={0.5}
          strokeDasharray="2 1.5"
          strokeLinejoin="round"
        />

        <g>
          <circle
            cx={peak.x}
            cy={peak.y}
            r={RADIUS.peak}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={0.4}
            strokeDasharray="1 1"
          />
          <text
            x={peak.x}
            y={peak.y - RADIUS.peak - 1.4}
            textAnchor="middle"
            fontSize={3}
            fill="var(--color-ink-faint)"
          >
            цель
          </text>
        </g>

        {ordered.map((chapter) => {
          const at = toPlan(chapter.grace);

          return (
            <g key={chapter.positionId}>
              {chapter.projects.map((project) => {
                const spot = toPlan(project.at);
                return (
                  <line
                    key={`${project.slug}-link`}
                    x1={at.x}
                    y1={at.y}
                    x2={spot.x}
                    y2={spot.y}
                    stroke="var(--color-line)"
                    strokeWidth={0.25}
                  />
                );
              })}

              {chapter.projects.map((project) => {
                const spot = toPlan(project.at);
                return (
                  <circle
                    key={project.slug}
                    cx={spot.x}
                    cy={spot.y}
                    r={RADIUS.project}
                    fill="var(--color-surface-1)"
                    stroke="var(--color-accent-dim)"
                    strokeWidth={0.35}
                  />
                );
              })}

              <circle
                cx={at.x}
                cy={at.y}
                r={RADIUS.chapter}
                fill={chapter.branch ? 'var(--color-surface-1)' : 'var(--color-accent)'}
                stroke="var(--color-accent)"
                strokeWidth={0.5}
              />
              <text
                x={at.x}
                y={at.y - RADIUS.chapter - 1.4}
                textAnchor="middle"
                fontSize={3.4}
                fill="var(--color-ink)"
              >
                {companyOf(chapter.positionId)}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="text-2xs text-ink-faint mt-2 font-mono">{t(STATE_KEY[support])}</p>

      <ChapterList />
    </>
  );
}
