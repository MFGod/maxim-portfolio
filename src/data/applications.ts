import {
  Activity,
  AtSign,
  Gamepad2,
  FileText,
  Folder,
  FolderClosed,
  NotepadText,
  Code2,
  Cpu,
  Layers,
  Milestone,
  Monitor,
  Settings,
  SquareTerminal,
  UserRound,
} from 'lucide-react';

import { GithubMark } from '@/components/ui/brand-icons';
import { GITHUB_LOGIN } from '@/lib/github';
import type { IconComponent } from '@/components/ui/icons';
import type { TranslationKey } from '@/lib/i18n/ru';
import { deepFreeze } from '@/lib/freeze';

export const APP_IDS = deepFreeze([
  'computer',
  'resume',
  'arcade',
  'projects',
  'project',
  'about',
  'experience',
  'skills',
  'terminal',
  'arcade',
  'source',
  'github',
  'system',
  'activity',
  'contact',
  'settings',
  'folder',
  'editor',
] as const);

export type AppId = (typeof APP_IDS)[number];

export type ApplicationMeta = {
  id: AppId;
  title: string;
  /** Подпись под иконкой на рабочем столе и во всплывающей подсказке дока. */
  hint: string;
  icon: IconComponent;
  /** Адрес для deep linking. `null` — окно без собственного маршрута. */
  route: string | null;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  /** Показывать ли в доке. */
  inDock: boolean;
  /** Показывать ли иконкой на рабочем столе. */
  onDesktop: boolean;
  /**
   * Корпус окна. `glass` убирает фон, тень и плашку заголовка: содержимое
   * ложится прямо на обои и само отвечает за читаемость.
   */
  chrome?: 'solid' | 'glass';
  /**
   * Ключ перевода заголовка. Есть только у системных приложений: содержимое
   * резюме одноязычное, а надписи оболочки следуют за настройкой языка.
   */
  titleKey?: TranslationKey;
  /** Ключ перевода подписи. Идёт в паре с `titleKey`. */
  hintKey?: TranslationKey;
};

export const applications: Record<AppId, ApplicationMeta> = deepFreeze({
  computer: {
    id: 'computer',
    title: 'Мой компьютер',
    hint: 'Вся навигация в одном окне',
    icon: Monitor,
    route: null,
    defaultSize: { width: 760, height: 580 },
    minSize: { width: 420, height: 360 },
    inDock: true,
    onDesktop: true,
  },
  arcade: {
    id: 'arcade',
    title: 'Аркада',
    titleKey: 'arcade.title',
    hint: 'Маленькие игры и общая таблица результатов',
    hintKey: 'arcade.subtitle',
    icon: Gamepad2,
    route: '/arcade',
    defaultSize: { width: 900, height: 640 },
    minSize: { width: 360, height: 440 },
    inDock: true,
    onDesktop: false,
  },
  resume: {
    id: 'resume',
    title: 'Резюме',
    hint: 'Полное резюме на одной странице',
    icon: FileText,
    route: '/resume',
    defaultSize: { width: 760, height: 640 },
    minSize: { width: 380, height: 320 },
    inDock: true,
    onDesktop: false,
  },
  projects: {
    id: 'projects',
    title: 'Проекты',
    hint: 'Коммерческие и собственные проекты',
    icon: FolderClosed,
    route: '/projects',
    defaultSize: { width: 880, height: 600 },
    minSize: { width: 420, height: 320 },
    inDock: true,
    onDesktop: false,
  },
  project: {
    id: 'project',
    title: 'Проект',
    hint: 'Карточка проекта',
    icon: FolderClosed,
    route: null,
    defaultSize: { width: 660, height: 580 },
    minSize: { width: 360, height: 300 },
    inDock: false,
    onDesktop: false,
  },
  about: {
    id: 'about',
    title: 'Обо мне',
    hint: 'Специализация и подход к работе',
    icon: UserRound,
    route: '/about',
    defaultSize: { width: 600, height: 560 },
    minSize: { width: 360, height: 300 },
    inDock: true,
    onDesktop: true,
  },
  experience: {
    id: 'experience',
    title: 'Опыт',
    hint: 'Карьерный путь по годам',
    icon: Milestone,
    route: '/experience',
    defaultSize: { width: 720, height: 600 },
    minSize: { width: 380, height: 320 },
    inDock: true,
    onDesktop: true,
  },
  skills: {
    id: 'skills',
    title: 'Стек',
    hint: 'Граф технологий и связей',
    icon: Layers,
    route: '/skills',
    defaultSize: { width: 960, height: 660 },
    minSize: { width: 360, height: 340 },
    inDock: true,
    onDesktop: true,
    chrome: 'glass',
  },
  terminal: {
    id: 'terminal',
    title: 'Терминал',
    hint: 'Те же данные, но командами',
    icon: SquareTerminal,
    route: null,
    defaultSize: { width: 640, height: 420 },
    minSize: { width: 340, height: 240 },
    inDock: true,
    onDesktop: false,
  },
  source: {
    id: 'source',
    title: 'Исходный код',
    hint: 'Как устроен этот рабочий стол',
    icon: Code2,
    route: null,
    defaultSize: { width: 860, height: 620 },
    minSize: { width: 380, height: 340 },
    inDock: true,
    onDesktop: false,
  },
  github: {
    id: 'github',
    title: 'GitHub',
    hint: `github.com/${GITHUB_LOGIN}`,
    icon: GithubMark,
    route: null,
    defaultSize: { width: 620, height: 540 },
    minSize: { width: 340, height: 300 },
    inDock: true,
    onDesktop: false,
  },
  system: {
    id: 'system',
    title: 'О системе',
    hint: 'Из чего собран этот рабочий стол',
    icon: Cpu,
    route: null,
    defaultSize: { width: 640, height: 560 },
    minSize: { width: 360, height: 320 },
    inDock: true,
    onDesktop: false,
  },
  activity: {
    id: 'activity',
    title: 'Мониторинг',
    hint: 'Живые показатели рантайма',
    icon: Activity,
    route: null,
    defaultSize: { width: 640, height: 540 },
    minSize: { width: 360, height: 320 },
    inDock: true,
    onDesktop: false,
  },
  settings: {
    id: 'settings',
    title: 'Настройки',
    titleKey: 'app.title',
    hint: 'Внешний вид и поведение',
    hintKey: 'app.subtitle',
    icon: Settings,
    route: '/settings',
    defaultSize: { width: 760, height: 560 },
    minSize: { width: 340, height: 320 },
    inDock: true,
    onDesktop: false,
  },
  folder: {
    id: 'folder',
    title: 'Папка',
    hint: 'Содержимое папки',
    icon: Folder,
    route: null,
    defaultSize: { width: 720, height: 500 },
    minSize: { width: 360, height: 280 },
    inDock: false,
    onDesktop: false,
  },
  editor: {
    id: 'editor',
    title: 'Текстовый документ',
    hint: 'Правка текстового файла',
    icon: NotepadText,
    route: null,
    defaultSize: { width: 620, height: 480 },
    minSize: { width: 320, height: 240 },
    inDock: false,
    onDesktop: false,
  },
  contact: {
    id: 'contact',
    title: 'Контакты',
    hint: 'Как со мной связаться',
    icon: AtSign,
    route: '/contact',
    defaultSize: { width: 520, height: 440 },
    minSize: { width: 320, height: 280 },
    inDock: true,
    onDesktop: false,
  },
});

/**
 * Окна без собственной программы: карточка проекта, папка и текстовый файл
 * открываются содержимым, а не запуском из дока или списка программ.
 */
const contentWindows: AppId[] = ['project', 'folder', 'editor'];

/** Запускаемые программы — всё, что человек открывает сам. */
export const programIds: AppId[] = APP_IDS.filter((id) => !contentWindows.includes(id));

/**
 * Док держит только то, чем пользуются постоянно, и делится на группы: слева
 * навигация и содержимое резюме, справа инструменты. Остальные программы живут
 * в «Моём компьютере» и в поиске — как Launchpad и Spotlight в macOS.
 */
export const dockGroups: AppId[][] = deepFreeze([
  ['computer', 'resume', 'projects', 'contact'],
  ['terminal', 'arcade', 'settings'],
]);

/** Плоский порядок дока. Используется там, где группы не нужны. */
export const dockOrder: AppId[] = dockGroups.flat();

/**
 * Программы по назначению. «Мой компьютер» показывает их этими группами: список
 * из тринадцати одинаковых плиток не читается, три подписанных — читаются.
 */
export const programGroups: { id: string; label: string; apps: AppId[] }[] = deepFreeze(
  [
    {
      id: 'resume',
      label: 'Резюме',
      apps: ['resume', 'projects', 'experience', 'skills', 'about', 'contact'],
    },
    {
      id: 'tools',
      label: 'Инструменты',
      apps: ['terminal', 'source', 'github', 'arcade'],
    },
    { id: 'system', label: 'Система', apps: ['system', 'activity', 'settings'] },
  ],
);

/**
 * Полный список для мобильного лаунчера и «Моего компьютера»: там показывают
 * всё, что можно открыть, а не сокращённый док.
 */
export const launcherOrder: AppId[] = deepFreeze([
  'computer',
  'resume',
  'projects',
  'experience',
  'skills',
  'about',
  'contact',
  'terminal',
  'source',
  'github',
  'system',
  'activity',
  'settings',
]);

type ExternalLink = {
  id: string;
  title: string;
  hint: string;
  icon: IconComponent;
  href: string;
};

/** Ссылки наружу. В доке их нет: GitHub открывается собственным окном. */
export const externalLinks: ExternalLink[] = deepFreeze([
  {
    id: 'github',
    title: 'GitHub',
    hint: 'github.com/MFGod',
    icon: GithubMark,
    href: 'https://github.com/MFGod',
  },
]);

/** Обратный индекс: маршрут → приложение. Нужен для deep linking. */
export const routeToApp = new Map<string, AppId>(
  Object.values(applications)
    .filter((app): app is ApplicationMeta & { route: string } => app.route !== null)
    .map((app) => [app.route, app.id]),
);
