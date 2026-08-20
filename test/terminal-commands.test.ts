import { describe, expect, it } from 'vitest';

import { profile } from '@/data/profile';
import { runCommand } from '@/components/applications/terminal/commands';
import { projects } from '@/data/projects';

describe('runCommand', () => {
  it('пустой ввод ничего не выводит', () => {
    expect(runCommand('   ')).toEqual({ lines: [] });
  });

  it('неизвестная команда подсказывает help, а не молчит', () => {
    const result = runCommand('deploy');
    expect(result.lines[0]).toBe('command not found: deploy');
    expect(result.lines).toContain('Список команд — help');
  });

  it('whoami отдаёт имя и должность', () => {
    const result = runCommand('whoami');
    expect(result.lines[0]).toContain('Жихарев');
    expect(result.lines[1]).toBe(profile.role);
  });

  it('skills фильтрует по категории', () => {
    const result = runCommand('skills ai');
    expect(result.lines.join('\n')).toContain('Claude Code');
    expect(result.lines.join('\n')).not.toContain('Webpack 5');
  });

  it('skills с несуществующей категорией не падает', () => {
    expect(runCommand('skills кобол').lines[0]).toContain('не найдена');
  });

  it('open по слагу проекта возвращает эффект открытия окна', () => {
    const slug = projects[0]!.slug;
    expect(runCommand(`open ${slug}`).effect).toEqual({
      type: 'open',
      app: 'project',
      slug,
    });
  });

  it('open по имени приложения открывает приложение', () => {
    expect(runCommand('open resume').effect).toEqual({ type: 'open', app: 'resume' });
  });

  it('open без аргумента объясняет, что делать', () => {
    expect(runCommand('open').lines[0]).toContain('Укажи цель');
  });

  it('resume открывает окно резюме и печатает выжимку', () => {
    const result = runCommand('resume');
    expect(result.effect).toEqual({ type: 'open', app: 'resume' });
    expect(result.lines[0]).toBe(profile.fullName);
    expect(result.lines.join('\n')).toContain(profile.summary[0]!);
  });

  it('github открывает окно и печатает ссылку из контактов', () => {
    const github = profile.contacts.find((contact) => contact.kind === 'github');
    const result = runCommand('github');
    expect(result.effect).toEqual({ type: 'open', app: 'github' });
    expect(result.lines.join('\n')).toContain(github!.href);
  });

  it('clear просит очистить экран, а не печатает пустоту', () => {
    expect(runCommand('clear').effect).toEqual({ type: 'clear' });
  });

  it('деструктивная команда отклоняется', () => {
    expect(runCommand('rm -rf /').lines[0]).toContain('Отклонено');
  });
});
