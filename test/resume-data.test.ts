import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { applications } from '@/data/applications';
import { experience, projects, resume, skills } from '@/data/resume';

describe('контентный слой', () => {
  it('слаги проектов уникальны — иначе разъедутся маршруты', () => {
    const slugs = projects.map((project) => project.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('каждый проект привязан к существующему месту работы', () => {
    const positionIds = new Set(experience.map((position) => position.id));
    for (const project of projects) {
      expect(positionIds.has(project.positionId)).toBe(true);
    }
  });

  it('ссылки из опыта указывают на существующие проекты', () => {
    const slugs = new Set(projects.map((project) => project.slug));
    for (const position of experience) {
      for (const slug of position.projectSlugs) {
        expect(slugs.has(slug)).toBe(true);
      }
    }
  });

  it('связь опыт → проекты согласована в обе стороны', () => {
    for (const position of experience) {
      const derived = projects
        .filter((project) => project.positionId === position.id)
        .map((project) => project.slug);
      expect(derived.sort()).toEqual([...position.projectSlugs].sort());
    }
  });

  it('у конфиденциальных проектов нет публичных ссылок', () => {
    for (const project of projects.filter((entry) => entry.confidential)) {
      expect(project.links).toHaveLength(0);
    }
  });

  it('у каждого проекта есть стек и описание вклада', () => {
    for (const project of projects) {
      expect(project.stack.length).toBeGreaterThan(0);
      expect(project.contribution.length).toBeGreaterThan(0);
      expect(project.tagline).not.toBe('');
    }
  });

  it('задача и решение заполняются парой — иначе UI покажет обрыв', () => {
    for (const project of projects) {
      expect(
        (project.problem === null) === (project.solution === null),
        `${project.slug}: problem и solution должны быть либо оба заполнены, либо оба null`,
      ).toBe(true);
    }
  });

  it('визуалы описаны по контракту галереи', () => {
    for (const project of projects) {
      for (const visual of project.visuals) {
        expect(visual.src, project.slug).toMatch(/^\/projects\/[a-z0-9-]+\.webp$/);
        expect(visual.alt.trim(), project.slug).not.toBe('');
        // Размер фиксирован форматом галереи: 16:10, см. docs/image-prompts.md.
        expect(visual.width, project.slug).toBe(1600);
        expect(visual.height, project.slug).toBe(1000);
      }
    }
  });

  it('файлы визуалов лежат в public — иначе галерея отрисует битые картинки', () => {
    const publicDir = fileURLToPath(new URL('../public', import.meta.url));
    for (const project of projects) {
      for (const visual of project.visuals) {
        expect(
          existsSync(`${publicDir}${visual.src}`),
          `нет файла: ${visual.src}`,
        ).toBe(true);
      }
    }
  });

  it('группы навыков не пустые и с уникальными идентификаторами', () => {
    const ids = skills.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of skills) expect(group.items.length).toBeGreaterThan(0);
  });

  it('маршруты приложений уникальны', () => {
    const routes = Object.values(applications)
      .map((app) => app.route)
      .filter((route): route is string => route !== null);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('схема ссылки соответствует виду контакта', () => {
    for (const contact of resume.profile.contacts) {
      const expected = contact.kind === 'email' ? /^mailto:/ : /^https:\/\//;
      expect(contact.href).toMatch(expected);
    }
  });
});
