'use client';

import { ArrowUpRight, Lock } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';
import { experience, projects } from '@/data/resume';
import { formatYears } from '@/lib/format';
import { useWindowManager } from '@/lib/window-manager';

const ALL = 'all';

/** Компании, у которых есть хотя бы один проект. */
const groups = experience
  .map((position) => ({
    id: position.id,
    label: position.company,
    count: projects.filter((project) => project.positionId === position.id).length,
  }))
  .filter((entry) => entry.count > 0);

export function ProjectsApp() {
  const { open } = useWindowManager();
  const [group, setGroup] = useState<string>(ALL);

  const visible =
    group === ALL ? projects : projects.filter((p) => p.positionId === group);

  return (
    <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <nav
        aria-label="Группы проектов"
        className="border-line-subtle bg-surface-0/60 shrink-0 scrollbar-thin overflow-x-auto border-b p-2 sm:w-52 sm:overflow-y-auto sm:border-r sm:border-b-0"
      >
        <ul className="flex gap-1 sm:flex-col">
          <SidebarItem
            label="Все проекты"
            count={projects.length}
            active={group === ALL}
            onSelect={() => setGroup(ALL)}
          />
          {groups.map((entry) => (
            <SidebarItem
              key={entry.id}
              label={entry.label}
              count={entry.count}
              active={group === entry.id}
              onSelect={() => setGroup(entry.id)}
            />
          ))}
        </ul>
      </nav>

      <div className="@container min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        <ul className="grid gap-3 p-3 @3xl:grid-cols-2">
          {visible.map((project) => {
            const position = experience.find(
              (entry) => entry.id === project.positionId,
            );
            return (
              <li key={project.slug}>
                <button
                  type="button"
                  onClick={() => open('project', { slug: project.slug })}
                  data-hover-lift
                  className={cn(
                    'group border-line-subtle bg-surface-1/60 relative flex h-full w-full flex-col overflow-hidden rounded-lg border p-4 text-left',
                    'transition-[border-color,background-color,box-shadow,translate] duration-(--duration-base)',
                    'hover:border-accent-dim/70 hover:bg-surface-2/70 hover:-translate-y-0.5 hover:shadow-(--glow-soft)',
                    'kbd-focus:border-accent-dim/70',
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-px opacity-40 transition-opacity duration-(--duration-base) group-hover:opacity-100"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, transparent, var(--color-accent), transparent)',
                    }}
                  />

                  <div className="flex items-start gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-ink font-display group-hover:text-accent line-clamp-2 text-lg leading-tight transition-colors duration-(--duration-fast)">
                          {project.name}
                        </span>
                        {project.confidential ? (
                          <Lock
                            aria-label="Коммерческий проект без публичных ссылок"
                            className="text-ink-faint size-3 shrink-0"
                          />
                        ) : null}
                      </span>
                      <span className="text-2xs text-ink-faint mt-1 block font-mono">
                        {position?.company}
                        {position ? (
                          <>
                            <span className="mx-1.5">·</span>
                            {formatYears(position.period)}
                          </>
                        ) : null}
                      </span>
                    </span>

                    <ArrowUpRight
                      aria-hidden
                      className="text-ink-faint group-hover:text-accent size-4 shrink-0 transition-[color,transform] duration-(--duration-fast) group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </div>

                  <span className="text-ink-muted mt-2.5 block text-sm">
                    {project.tagline}
                  </span>

                  <span className="mt-auto flex flex-wrap gap-1.5 pt-3.5">
                    {project.stack.map((item) => (
                      <span
                        key={item}
                        className="border-accent-dim/35 bg-accent-wash text-2xs text-ink-muted rounded-sm border px-2 py-0.5 font-mono"
                      >
                        {item}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SidebarItem({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active || undefined}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs whitespace-nowrap transition-colors duration-(--duration-fast)',
          active
            ? 'border-accent-dim/50 bg-accent-wash text-ink border'
            : 'text-ink-muted hover:bg-surface-2 hover:text-ink border border-transparent',
        )}
      >
        <span className="truncate">{label}</span>
        <span className="text-2xs text-ink-faint font-mono">{count}</span>
      </button>
    </li>
  );
}
