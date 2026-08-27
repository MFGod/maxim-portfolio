'use client';

import { ChevronRight } from 'lucide-react';

import { appHint, appTitle } from '@/components/applications/app-registry';
import { applications, programGroups, type AppId } from '@/data/applications';
import { projects } from '@/data/resume';
import { formatCount } from '@/lib/format';
import { useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';

/** Все программы, разложенные по назначению. */
export function Programs() {
  const { open } = useWindowManager();
  const locale = useSetting((settings) => settings.language);

  return (
    <div className="h-full scrollbar-thin overflow-y-auto px-(--app-pad-x) py-(--app-pad-y)">
      {programGroups.map((group) => (
        <section key={group.id} className="mt-7 first:mt-0">
          <h3 className="text-ink font-display text-base tracking-[0.16em] uppercase">
            {group.label}
          </h3>
          <div
            aria-hidden
            className="mt-2 mb-3 h-px"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--color-accent-dim), transparent)',
            }}
          />

          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {group.apps.map((id) => (
              <ProgramTile key={id} id={id} onOpen={() => open(id)} locale={locale} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ProgramTile({
  id,
  onOpen,
  locale,
}: {
  id: AppId;
  onOpen: () => void;
  locale: Parameters<typeof appTitle>[1];
}) {
  const app = applications[id];
  const Icon = app.icon;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group border-line-subtle bg-surface-1/60 hover:border-accent-dim/60 hover:bg-surface-2 flex w-full flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors duration-(--duration-fast)"
      >
        <span className="border-line-subtle bg-surface-2/80 text-ink-muted group-hover:border-accent-dim group-hover:text-accent grid size-9 place-items-center rounded-md border transition-colors duration-(--duration-fast)">
          <Icon aria-hidden className="size-4.5" strokeWidth={1.5} />
        </span>
        <span className="min-w-0">
          <span className="text-ink block truncate text-sm font-medium">
            {appTitle(id, locale)}
          </span>
          <span className="text-ink-faint mt-0.5 block truncate text-xs">
            {appHint(id, locale)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function Projects() {
  const { open } = useWindowManager();

  return (
    <div className="h-full scrollbar-thin overflow-y-auto px-(--app-pad-x) py-(--app-pad-y)">
      <p className="text-ink-muted text-sm">
        {formatCount(projects.length, ['проект', 'проекта', 'проектов'])} — карточка
        открывается отдельным окном.
      </p>

      <ul className="divide-line-subtle border-line-subtle mt-4 divide-y rounded-lg border">
        {projects.map((project) => (
          <li key={project.slug}>
            <button
              type="button"
              onClick={() => open('project', { slug: project.slug })}
              className="group hover:bg-surface-2 kbd-focus:bg-surface-2 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-(--duration-fast)"
            >
              <span className="min-w-0 flex-1">
                <span className="text-ink group-hover:text-accent block truncate text-sm font-medium">
                  {project.name}
                </span>
                <span className="text-ink-faint mt-0.5 block truncate text-xs">
                  {project.tagline}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="text-ink-faint group-hover:text-accent size-4 shrink-0 transition-transform duration-(--duration-fast) group-hover:translate-x-0.5"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
