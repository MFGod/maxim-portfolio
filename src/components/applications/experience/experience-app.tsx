'use client';

import { AppBody } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { experience, projects } from '@/data/resume';
import { durationInMonths, formatDuration, formatPeriod } from '@/lib/format';
import { useWindowManager } from '@/lib/window-manager';

export function ExperienceApp() {
  const { open } = useWindowManager();

  return (
    <AppBody>
      <h2 className="text-ink font-display text-2xl tracking-tight">Карьерный путь</h2>
      <p className="text-ink-muted mt-1 text-sm">
        Сверху — текущее место. Полное резюме — в приложении «Резюме».
      </p>

      <ol className="relative mt-7 space-y-8 pl-6">
        <span
          aria-hidden
          className="absolute top-2 bottom-1 left-0 w-0.5 -translate-x-1/2"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, var(--color-accent), var(--color-accent-dim) 40%, var(--color-line))',
          }}
        />

        {experience.map((position) => {
          const related = projects.filter((p) => p.positionId === position.id);
          const isCurrent = position.period.to === null;

          return (
            <li key={position.id} className="relative">
              {/* Узел: ромб на оси линии. Ось одна на всех — левый край
                  списка; и линия, и ромб съезжают на половину своей ширины,
                  поэтому подгонять смещение вручную не нужно. По вертикали
                  центр ромба совпадает с серединой строки периода. */}
              <span
                aria-hidden
                className={cn(
                  'absolute top-1 left-0 -ml-6 size-2 -translate-x-1/2 rotate-45 border',
                  isCurrent
                    ? 'bg-accent border-accent shadow-(--glow-soft)'
                    : 'bg-surface-2 border-accent-dim',
                )}
              />

              <p className="text-2xs text-ink-faint font-mono">
                {formatPeriod(position.period)}
                <span className="mx-1.5">·</span>
                {formatDuration(durationInMonths(position.period))}
              </p>

              <h3 className="text-ink font-display mt-1 text-xl leading-snug">
                {position.company}
              </h3>
              <p className="text-accent text-2xs mt-0.5 tracking-[0.18em] uppercase">
                {position.role}
              </p>

              {position.summary ? (
                <p className="text-ink-muted mt-2.5 text-sm">{position.summary}</p>
              ) : null}

              {related.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {related.map((project) => (
                    <li key={project.slug}>
                      <button
                        type="button"
                        onClick={() => open('project', { slug: project.slug })}
                        className="border-line-subtle bg-surface-2 text-2xs text-ink-muted hover:border-accent-dim hover:bg-accent-wash hover:text-accent rounded-sm border px-2 py-1 transition-colors duration-(--duration-fast)"
                      >
                        {project.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </AppBody>
  );
}
