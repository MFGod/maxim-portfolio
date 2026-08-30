'use client';

import { Download } from 'lucide-react';

import { contactIcon, contactLinkTarget } from '@/components/ui/contact-links';
import {
  AppBody,
  Bullets,
  DataRow,
  Section,
  TagList,
} from '@/components/ui/primitives';
import { education, languages, profile, projects, resume, skills } from '@/data/resume';
import {
  durationInMonths,
  formatAge,
  formatDuration,
  formatPeriod,
} from '@/lib/format';
import { resumePdfPath } from '@/lib/site';
import { useWindowManager } from '@/lib/window-manager';

/** Раздел «AI-инструменты и агенты»: собственные проекты вне компаний. */
const personalProjects = projects.filter((project) => project.kind === 'personal');

export function ResumeApp() {
  const { open } = useWindowManager();

  return (
    <AppBody>
      <article>
        <header>
          <h2 className="text-ink font-display text-3xl tracking-tight">
            {profile.fullName}
          </h2>
          <p className="text-accent mt-1.5 text-sm tracking-[0.18em] uppercase">
            {profile.role}
          </p>
          <p className="text-2xs text-ink-faint mt-1 font-mono">
            {formatAge(profile.age)}, {profile.location}
          </p>

          <ul className="mt-5 flex flex-wrap gap-2">
            {profile.contacts.map((contact) => {
              const Icon = contactIcon[contact.kind];
              return (
                <li key={contact.kind}>
                  <a
                    href={contact.href}
                    {...contactLinkTarget(contact.kind)}
                    className="border-line-subtle bg-surface-2 text-ink-muted hover:border-line hover:bg-surface-3 hover:text-ink flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors duration-(--duration-fast)"
                  >
                    <Icon aria-hidden className="text-ink-faint size-3.5" />
                    <span className="font-mono">{contact.label}</span>
                  </a>
                </li>
              );
            })}

            <li>
              <a
                href={resumePdfPath}
                download
                className="border-accent-dim/60 bg-accent-wash text-ink hover:border-accent-dim flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors duration-(--duration-fast)"
              >
                <Download aria-hidden className="text-accent size-3.5" />
                <span className="font-mono">PDF</span>
              </a>
            </li>
          </ul>
        </header>

        <Section title="О себе">
          <div className="space-y-3">
            {profile.summary.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="text-ink-muted text-sm">
                {paragraph}
              </p>
            ))}
          </div>
        </Section>

        <Section title="Опыт работы">
          <div className="space-y-8">
            {resume.experience.map((position) => {
              const positionProjects = resume.projects.filter(
                (project) => project.positionId === position.id,
              );

              return (
                <div key={position.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="text-ink text-base font-medium">
                      {position.company}
                      <span className="text-ink-faint">, </span>
                      <span className="text-ink-muted">{position.role}</span>
                    </h3>
                    <p className="text-2xs text-ink-faint font-mono">
                      {formatPeriod(position.period)},{' '}
                      {formatDuration(durationInMonths(position.period))}
                    </p>
                  </div>

                  {position.summary ? (
                    <p className="text-ink-muted mt-2 text-sm">{position.summary}</p>
                  ) : null}

                  {positionProjects.length > 0 ? (
                    <ul className="mt-3 space-y-2.5">
                      {positionProjects.map((project) => (
                        <li key={project.slug}>
                          <button
                            type="button"
                            onClick={() => open('project', { slug: project.slug })}
                            className="group hover:border-line-subtle hover:bg-surface-2 w-full rounded-md border border-transparent px-2.5 py-2 text-left transition-colors duration-(--duration-fast)"
                          >
                            <span className="text-ink group-hover:text-accent text-sm font-medium">
                              {project.name}
                            </span>
                            <span className="text-2xs text-ink-faint ml-2 font-mono">
                              {project.stack.slice(0, 4).join(', ')}
                            </span>
                            <span className="text-ink-muted mt-0.5 block text-sm">
                              {project.tagline}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Навыки">
          <dl className="space-y-3.5">
            {skills.map((group) => (
              <div
                key={group.id}
                className="flex flex-col gap-1.5 sm:flex-row sm:gap-4"
              >
                <dt className="text-2xs text-ink-faint w-44 shrink-0 pt-1 font-mono tracking-wide uppercase">
                  {group.label}
                </dt>
                <dd className="min-w-0 flex-1">
                  <TagList items={group.items} label={group.label} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Образование и языки">
          <dl className="space-y-3">
            {education.map((entry) => (
              <DataRow key={entry.institution} label={String(entry.year)}>
                {entry.institution}. {entry.program}, {entry.level.toLowerCase()}.
              </DataRow>
            ))}
            <DataRow label="Языки">
              {languages
                .map((language) => `${language.name} — ${language.level}`)
                .join('. ')}
              .
            </DataRow>
          </dl>
        </Section>

        <Section title="AI-инструменты и агенты">
          <div className="space-y-5">
            {personalProjects.map((project) => (
              <div key={project.slug}>
                <p className="text-ink text-sm font-medium">
                  {project.name} — {project.tagline}
                </p>
                <div className="mt-2.5">
                  <Bullets items={[...project.contribution, ...project.engineering]} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      </article>
    </AppBody>
  );
}
