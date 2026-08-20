import { applications, launcherOrder, type AppId } from '@/data/applications';
import { about } from '@/data/about';
import { experience, profile, projects, skills } from '@/data/resume';
import { formatPeriod } from '@/lib/format';

type CommandResult = {
  lines: string[];
  /** Побочный эффект: очистить экран или открыть окно. */
  effect?: { type: 'clear' } | { type: 'open'; app: AppId; slug?: string };
};

type Command = {
  name: string;
  usage: string;
  description: string;
  run: (args: string[]) => CommandResult;
};

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

const commands: Command[] = [
  {
    name: 'help',
    usage: 'help',
    description: 'Список команд',
    run: () => ({
      lines: [
        'Доступные команды:',
        '',
        ...registry().map(
          (command) => `  ${pad(command.usage, 18)}${command.description}`,
        ),
        '',
        'Подсказка: ↑ и ↓ листают историю, Tab дополняет команду.',
      ],
    }),
  },
  {
    name: 'whoami',
    usage: 'whoami',
    description: 'Кто это',
    run: () => ({
      lines: [
        profile.fullName,
        profile.role,
        `${profile.location} · ${profile.contacts.map((c) => c.label).join(' · ')}`,
      ],
    }),
  },
  {
    name: 'about',
    usage: 'about',
    description: 'Кратко о специализации',
    run: () => ({
      lines: about.flatMap((section) => [`## ${section.title}`, ...section.body, '']),
    }),
  },
  {
    name: 'resume',
    usage: 'resume',
    description: 'Открыть резюме',
    run: () => ({
      lines: [profile.fullName, profile.role, '', ...profile.summary, ''],
      effect: { type: 'open', app: 'resume' },
    }),
  },
  {
    name: 'skills',
    usage: 'skills [группа]',
    description: 'Технологии по категориям',
    run: (args) => {
      const query = args[0]?.toLowerCase();
      const groups = query
        ? skills.filter(
            (group) =>
              group.id.includes(query) || group.label.toLowerCase().includes(query),
          )
        : skills;

      if (groups.length === 0) {
        return { lines: [`Категория «${args[0]}» не найдена. Попробуй: skills`] };
      }

      return {
        lines: groups.flatMap((group) => [
          `${group.label}:`,
          `  ${group.items.join(', ')}`,
          '',
        ]),
      };
    },
  },
  {
    name: 'experience',
    usage: 'experience',
    description: 'Места работы',
    run: () => ({
      lines: experience.flatMap((position) => [
        `${position.company} — ${position.role}`,
        `  ${formatPeriod(position.period)}`,
        '',
      ]),
    }),
  },
  {
    name: 'projects',
    usage: 'projects',
    description: 'Список проектов',
    run: () => ({
      lines: [
        ...projects.map((project) => `  ${pad(project.slug, 24)}${project.name}`),
        '',
        'Открыть карточку: open <slug>',
      ],
    }),
  },
  {
    name: 'open',
    usage: 'open <цель>',
    description: 'Открыть приложение или проект',
    run: (args) => {
      const target = args[0];
      if (!target) {
        return {
          lines: [`Укажи цель. Например: open resume, open ${projects[0]?.slug ?? ''}`],
        };
      }

      if (target in applications && target !== 'project') {
        return {
          lines: [`Открываю «${applications[target as AppId].title}»…`],
          effect: { type: 'open', app: target as AppId },
        };
      }

      const project = projects.find((entry) => entry.slug === target);
      if (project) {
        return {
          lines: [`Открываю «${project.name}»…`],
          effect: { type: 'open', app: 'project', slug: project.slug },
        };
      }

      return {
        lines: [
          `Не знаю цель «${target}».`,
          `Приложения: ${launcherOrder.join(', ')}`,
          'Проекты: projects',
        ],
      };
    },
  },
  {
    name: 'contact',
    usage: 'contact',
    description: 'Контакты',
    run: () => ({
      lines: profile.contacts.map(
        (contact) => `  ${pad(contact.kind, 10)}${contact.label}  ${contact.href}`,
      ),
    }),
  },
  {
    name: 'github',
    usage: 'github',
    description: 'Открыть GitHub',
    run: () => {
      const github = profile.contacts.find((contact) => contact.kind === 'github');
      if (!github) return { lines: ['GitHub в контактах не указан.'] };
      return {
        lines: [`  ${github.label}  ${github.href}`],
        effect: { type: 'open', app: 'github' },
      };
    },
  },
  {
    name: 'arcade',
    usage: 'arcade',
    description: 'Открыть аркаду',
    run: () => ({
      lines: [
        'Три в ряд — собирайте линии за минуту.',
        'Башня — сбрасывайте блок в нужный момент.',
        'Память — повторяйте последовательность.',
        'У каждой игры своя таблица результатов.',
      ],
      effect: { type: 'open', app: 'arcade' },
    }),
  },
  {
    name: 'ls',
    usage: 'ls',
    description: 'Что вообще есть',
    run: () => ({
      lines: [launcherOrder.map((app) => `${app}/`).join('  ')],
    }),
  },
  {
    name: 'clear',
    usage: 'clear',
    description: 'Очистить экран',
    run: () => ({ lines: [], effect: { type: 'clear' } }),
  },
];

/** Пасхалки отдельно: в `help` они не попадают. */
const easterEggs: Record<string, string[]> = {
  sudo: ['Прав не хватает. И это правильно.'],
  'rm -rf /': [
    'Отклонено. safety-guard из agents-config не пропускает такое даже в шутку.',
  ],
  exit: ['Окно закрывается кнопкой или Esc.'],
  vim: [':q — и ты свободен.'],
};

function registry(): Command[] {
  return commands;
}

export const commandNames = commands.map((command) => command.name);

export function runCommand(input: string): CommandResult {
  const trimmed = input.trim();
  if (!trimmed) return { lines: [] };

  const easterEgg = easterEggs[trimmed.toLowerCase()];
  if (easterEgg) return { lines: easterEgg };

  const [name, ...args] = trimmed.split(/\s+/);
  const command = commands.find((entry) => entry.name === name);

  if (!command) {
    return { lines: [`command not found: ${name}`, 'Список команд — help'] };
  }

  return command.run(args);
}
