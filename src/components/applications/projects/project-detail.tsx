'use client';

import {
  AppBody,
  Bullets,
  LinkOut,
  Section,
  TagList,
} from '@/components/ui/primitives';
import { experience, getProject } from '@/data/resume';
import { formatPeriod } from '@/lib/format';

export function ProjectDetail({ slug }: { slug: string }) {
  const project = getProject(slug);

  if (!project) {
    return (
      <AppBody>
        <p className="text-ink-muted text-sm">
          Проект <span className="text-ink font-mono">{slug}</span> не найден.
        </p>
      </AppBody>
    );
  }

  const position = experience.find((entry) => entry.id === project.positionId);

  return (
    <AppBody>
      <article>
        <header>
          <h2 className="text-ink font-display text-2xl tracking-tight">
            {project.name}
          </h2>
          <p className="text-ink-muted mt-1.5 text-sm">{project.tagline}</p>
          {position ? (
            <p className="text-2xs text-ink-faint mt-3 font-mono">
              {position.company}
              <span className="mx-1.5">·</span>
              {formatPeriod(position.period)}
            </p>
          ) : null}
        </header>

        <Section title="Стек">
          <TagList items={project.stack} label={`Технологии проекта ${project.name}`} />
        </Section>

        {project.problem ? (
          <Section title="Задача">
            <p className="text-ink-muted text-sm">{project.problem}</p>
          </Section>
        ) : null}

        {project.solution ? (
          <Section title="Решение">
            <p className="text-ink-muted text-sm">{project.solution}</p>
          </Section>
        ) : null}

        <Section title="Мой вклад">
          <Bullets items={project.contribution} />
        </Section>

        {project.engineering.length > 0 ? (
          <Section title="Инженерные решения">
            <Bullets items={project.engineering} />
          </Section>
        ) : null}

        {project.visuals.length > 0 ? (
          <Section title="Архитектура">
            <div className="grid gap-3 sm:grid-cols-2">
              {project.visuals.map((visual) => (
                // eslint-disable-next-line @next/next/no-img-element -- статические ассеты фиксированного размера
                <img
                  key={visual.src}
                  src={visual.src}
                  alt={visual.alt}
                  width={visual.width}
                  height={visual.height}
                  loading="lazy"
                  decoding="async"
                  className="border-line-subtle bg-surface-2 w-full rounded-md border"
                />
              ))}
            </div>
          </Section>
        ) : null}

        {project.links.length > 0 ? (
          <Section title="Ссылки">
            <ul className="space-y-1.5">
              {project.links.map((link) => (
                <li key={link.href}>
                  <LinkOut href={link.href} className="text-sm">
                    {link.label}
                  </LinkOut>
                </li>
              ))}
            </ul>
          </Section>
        ) : project.confidential ? (
          <Section title="Ссылки">
            <p className="text-ink-faint text-sm">
              Коммерческий проект — публичных ссылок и скриншотов нет. Детали готов
              разобрать на созвоне.
            </p>
          </Section>
        ) : null}
      </article>
    </AppBody>
  );
}
