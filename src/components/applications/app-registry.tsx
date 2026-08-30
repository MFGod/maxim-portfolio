'use client';

import { applications, type AppId } from '@/data/applications';
import { getProject } from '@/data/resume';
import { fileStore } from '@/lib/files/store';
import { translator } from '@/lib/i18n';
import type { Locale } from '@/lib/settings/types';
import type { WindowInstance } from '@/lib/window-manager/types';

import { AboutApp } from './about/about-app';
import { ArcadeApp } from './arcade/arcade-app';
import { ActivityApp } from './activity/activity-app';
import { ComputerApp } from './computer/computer-app';
import { ContactApp } from './contact/contact-app';
import { ExperienceApp } from './experience/experience-app';
import { EditorApp } from './files/editor-app';
import { FolderApp } from './files/folder-app';
import { GithubApp } from './github/github-app';
import { ProjectDetail } from './projects/project-detail';
import { ProjectsApp } from './projects/projects-app';
import { SettingsApp } from './settings/settings-app';
import { ResumeApp } from './resume/resume-app';
import { SkillsApp } from './skills/skills-app';
import { SourceApp } from './source/source-app';
import { SystemApp } from './system/system-app';
import { TerminalApp } from './terminal/terminal-app';

/**
 * Контент приложений подключён статически, а не через `next/dynamic`: весь
 * текст сайта — одно резюме, и он весит меньше рантайма ленивой загрузки.
 * Заодно всё содержимое попадает в серверный HTML.
 */
export function AppContent({ instance }: { instance: WindowInstance }) {
  switch (instance.app) {
    case 'computer':
      return <ComputerApp />;
    case 'resume':
      return <ResumeApp />;
    case 'projects':
      return <ProjectsApp />;
    case 'project':
      return <ProjectDetail slug={instance.payload?.slug ?? ''} />;
    case 'about':
      return <AboutApp />;
    case 'experience':
      return <ExperienceApp />;
    case 'skills':
      return <SkillsApp />;
    case 'contact':
      return <ContactApp />;
    case 'arcade':
      return <ArcadeApp />;
    case 'world':
      return null;
    case 'terminal':
      return <TerminalApp />;
    case 'source':
      return <SourceApp />;
    case 'github':
      return <GithubApp />;
    case 'system':
      return <SystemApp />;
    case 'activity':
      return <ActivityApp />;
    case 'settings':
      return <SettingsApp />;
    case 'folder':
      return <FolderApp fileId={instance.payload?.fileId ?? ''} />;
    case 'editor':
      return <EditorApp fileId={instance.payload?.fileId ?? ''} />;
    default: {
      const exhaustive: never = instance.app;
      void exhaustive;
      return null;
    }
  }
}

/**
 * Заголовок приложения. Системные переводятся, контентные нет: их названия —
 * часть резюме.
 */
export function appTitle(app: AppId, locale: Locale): string {
  const meta = applications[app];
  return meta.titleKey ? translator(locale)(meta.titleKey) : meta.title;
}

export function appHint(app: AppId, locale: Locale): string {
  const meta = applications[app];
  return meta.hintKey ? translator(locale)(meta.hintKey) : meta.hint;
}

export function labelOf(
  instance: WindowInstance,
  locale: Locale,
): { title: string; subtitle?: string } {
  if (instance.app === 'folder' || instance.app === 'editor') {
    const node = instance.payload?.fileId
      ? fileStore.getSnapshot().nodes[instance.payload.fileId]
      : null;
    return {
      title: node?.name ?? applications[instance.app].title,
      subtitle: instance.app === 'editor' ? 'текст' : undefined,
    };
  }
  if (instance.app === 'project') {
    const project = instance.payload?.slug ? getProject(instance.payload.slug) : null;
    return {
      title: project?.name ?? 'Проект',
      subtitle: project ? project.stack[0] : undefined,
    };
  }
  return { title: appTitle(instance.app, locale) };
}
