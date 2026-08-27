import { deepFreeze } from '@/lib/freeze';

/**
 * Экскурсия по исходникам для окна «Исходный код». Фрагменты — куски реальных
 * файлов проекта: `test/source-tour.test.ts` ищет каждый в своём файле и падает,
 * когда код и витрина расходятся.
 *
 * Привязки к номерам строк здесь нет намеренно. Строки уезжают от любой правки
 * выше по файлу, и тест падал бы на изменениях, которые фрагмента не касаются.
 * Поиск идёт по содержимому: значение имеет сам код, а не его координаты.
 *
 * Фрагменты хранятся без общего отступа — срез из глубины функции иначе уезжает
 * вправо и не читается в узком окне. Тест применяет тот же сдвиг.
 */

export const SOURCE_GROUPS = deepFreeze([
  { id: 'desktop', label: 'Рабочий стол' },
  { id: 'window', label: 'Окна' },
  { id: 'applications', label: 'Приложения' },
  { id: 'data', label: 'Данные' },
  { id: 'settings', label: 'Настройки' },
  { id: 'components', label: 'Компоненты' },
] as const);

export type SourceGroupId = (typeof SOURCE_GROUPS)[number]['id'];

export type SourceEntry = {
  id: string;
  group: SourceGroupId;
  /** Путь от корня репозитория. */
  path: string;
  title: string;
  /** Зачем этот модуль существует. */
  purpose: string;
  /** За что отвечает. */
  responsibilities: string[];
  /** Как это работает и почему сделано именно так. */
  note: string;
  code: string;
};

export const sourceTour: SourceEntry[] = deepFreeze([
  {
    id: 'window-reducer',
    group: 'window',
    path: 'src/lib/window-manager/reducer.ts',
    title: 'windowReducer',
    purpose:
      'Состояние окон меняется только здесь. Компоненты вызывают действия и не трогают геометрию напрямую.',
    responsibilities: [
      'открытие, закрытие, фокус',
      'z-порядок: индекс в массиве и есть слой',
      'свёртывание и разворот',
      'геометрия при перетаскивании и изменении размера',
    ],
    note: 'Повторное открытие не создаёт второе окно: тот же идентификатор возвращает окно наверх и снимает свёрнутое состояние.',
    code: `export function windowReducer(
  state: WindowManagerState,
  action: WindowAction,
): WindowManagerState {
  switch (action.type) {
    case 'open': {
      const id = windowIdOf(action.app, action.payload);
      const existing = state.windows[id];

      if (existing) {
        return {
          ...state,
          windows: {
            ...state.windows,
            [id]: {
              ...existing,
              status: existing.status === 'minimized' ? 'normal' : existing.status,
            },
          },
          order: bringToFront(state.order, id),
          focusedId: id,
        };
      }`,
  },
  {
    id: 'pointer-drag',
    group: 'window',
    path: 'src/hooks/use-pointer-drag.ts',
    title: 'usePointerDrag',
    purpose: 'Перетаскивание и изменение размера на Pointer Events, без библиотек.',
    responsibilities: [
      'порог до начала жеста — чтобы клик остался кликом',
      'запись в узел внутри requestAnimationFrame',
      'состояние обновляется один раз, на pointerup',
    ],
    note: 'Во время жеста значение пишется прямо в CSS-переменные узла, в состояние уходит один раз на pointerup. Кадр при перетаскивании остаётся ровным.',
    code: `const handleMove = (moveEvent: PointerEvent) => {
  const dx = moveEvent.clientX - originX;
  const dy = moveEvent.clientY - originY;

  if (!started) {
    if (Math.abs(dx) <= threshold && Math.abs(dy) <= threshold) return;
    started = true;
    movedRef.current = true;
    document.body.classList.add('dragging-surface');
    onStart?.(node);
  }

  moveEvent.preventDefault();
  latest = compute(start, dx, dy);
  if (!frame) frame = requestAnimationFrame(flush);
};`,
  },
  {
    id: 'app-meta',
    group: 'applications',
    path: 'src/data/applications.ts',
    title: 'ApplicationMeta',
    purpose:
      'Реестр приложений: одно описание на док, рабочий стол, поиск и маршрутизацию.',
    responsibilities: [
      'иконка и подписи',
      'маршрут для deep linking',
      'размеры окна по умолчанию и минимум',
      'где показывать: док, рабочий стол',
      'корпус окна: обычный или стеклянный',
    ],
    note: 'Чтобы добавить приложение, достаточно записи в реестре и ветки в AppContent. Док, поиск и «Мой компьютер» подхватят его сами.',
    code: `export type ApplicationMeta = {
  id: AppId;
  title: string;
  /** Подпись под иконкой на рабочем столе и во всплывающей подсказке дока. */
  hint: string;
  icon: IconComponent;
  /** Адрес для deep linking. \`null\` — окно без собственного маршрута. */
  route: string | null;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  /** Показывать ли в доке. */
  inDock: boolean;
  /** Показывать ли иконкой на рабочем столе. */
  onDesktop: boolean;
  /**
   * Корпус окна. \`glass\` убирает фон, тень и плашку заголовка: содержимое
   * ложится прямо на обои и само отвечает за читаемость.
   */
  chrome?: 'solid' | 'glass';
  /**
   * Ключ перевода заголовка. Есть только у системных приложений: содержимое
   * резюме одноязычное, а надписи оболочки следуют за настройкой языка.
   */
  titleKey?: TranslationKey;
  /** Ключ перевода подписи. Идёт в паре с \`titleKey\`. */
  hintKey?: TranslationKey;
};`,
  },
  {
    id: 'app-content',
    group: 'applications',
    path: 'src/components/applications/app-registry.tsx',
    title: 'AppContent',
    purpose: 'Сопоставление идентификатора приложения с его содержимым.',
    responsibilities: [
      'одна ветка на приложение',
      'окно проекта получает слаг через payload',
      'папка и текстовый файл — узел файловой системы оттуда же',
    ],
    note: 'Содержимое подключено статически: весь текст сайта — одно резюме, оно легче рантайма ленивой загрузки. Побочный эффект приятный: всё попадает в серверный HTML.',
    code: `export function AppContent({ instance }: { instance: WindowInstance }) {
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
    }`,
  },
  {
    id: 'resume-project',
    group: 'data',
    path: 'src/types/resume.ts',
    title: 'Project',
    purpose: 'Контракт проекта в резюме. UI читает только типы из этого файла.',
    responsibilities: [
      'задача, решение, вклад — раздельно',
      'связь с местом работы через positionId',
      'null там, где в резюме факта нет',
    ],
    note: 'null стоит там, где формулировки нет в исходном резюме. Компонент не рисует блок, для которого нет данных.',
    code: `export type Project = {
  slug: string;
  name: string;
  /** \`Position.id\`, к которому относится проект. */
  positionId: string;
  kind: ProjectKind;
  /** Одна строка: что это за продукт. */
  tagline: string;
  stack: string[];
  /** Задача, которую решал продукт или конкретно я. \`null\` — в резюме не зафиксировано. */
  problem: string | null;
  /** Как решали. \`null\` — в резюме не зафиксировано. */
  solution: string | null;
  /** Что делал лично. Формулировки из резюме. */
  contribution: string[];
  /** Инженерные решения, которые стоит показать отдельно. */
  engineering: string[];
  links: ProjectLink[];
  /** Пусто, пока нет утверждённых визуалов: UI не рисует галерею. */
  visuals: ProjectVisual[];
  /** Коммерческий проект под NDA: без публичных ссылок и реальных скриншотов. */
  confidential: boolean;
};`,
  },
  {
    id: 'settings-apply',
    group: 'settings',
    path: 'src/lib/settings/store.ts',
    title: 'applyToDocument',
    purpose:
      'Настройки становятся атрибутами и переменными на html, а внешний вид описан в CSS через них.',
    responsibilities: [
      'атрибуты темы, акцента, плотности, движения',
      'размеры дока через CSS-переменные',
      'цвет системной панели браузера',
    ],
    note: 'Смена темы обходится без перерисовки React-дерева. Стартовый скрипт выставляет атрибуты до первой отрисовки, поэтому чужая тема не мигает.',
    code: `function applyToDocument(next: Settings): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const attributes = attributesFor(next, systemPreferences());
  for (const [name, value] of Object.entries(attributes)) {
    if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }

  for (const [property, value] of Object.entries(cssVariablesFor(next))) {
    root.style.setProperty(property, value);
  }

  const theme = attributes['data-theme'] as ResolvedTheme | undefined;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && theme && THEME_COLORS[theme]) {
    meta.setAttribute('content', THEME_COLORS[theme]);
  }
}`,
  },
  {
    id: 'dock-magnify',
    group: 'desktop',
    path: 'src/components/dock/dock.tsx',
    title: 'useDockMagnify',
    purpose: 'Увеличение иконок дока по близости курсора.',
    responsibilities: [
      'расстояние от курсора до центра иконки',
      'масштаб пишется в CSS-переменную кнопки',
      'сброс при уходе курсора и при выключенной настройке',
    ],
    note: 'Масштаб пишется в CSS-переменную кнопки внутри requestAnimationFrame, мимо состояния React. Движение мыши не вызывает рендеров.',
    code: `function useDockMagnify(
  ref: React.RefObject<HTMLUListElement | null>,
  enabled: boolean,
) {
  const frameRef = useRef(0);

  const reset = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    const items = ref.current?.querySelectorAll<HTMLElement>('[data-hover-lift]');
    items?.forEach((item) => item.style.removeProperty('--magnify'));
  }, [ref]);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  useEffect(() => reset, [reset]);

  const onPointerMove = (event: React.PointerEvent<HTMLUListElement>) => {
    if (!enabled) return;
    const list = ref.current;
    if (!list) return;

    const pointerX = event.clientX;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const items = list.querySelectorAll<HTMLElement>('[data-hover-lift]');
      items.forEach((item) => {
        const box = item.getBoundingClientRect();
        const distance = Math.abs(pointerX - (box.left + box.width / 2));
        const falloff = Math.max(0, 1 - distance / MAGNIFY_RADIUS);
        item.style.setProperty('--magnify', String(1 + MAGNIFY_GAIN * falloff));
      });
    });
  };

  return { onPointerMove, onPointerLeave: reset };
}`,
  },
  {
    id: 'window-keyboard',
    group: 'components',
    path: 'src/components/window/window-frame.tsx',
    title: 'Клавиатура в заголовке окна',
    purpose: 'Перемещение окна с клавиатуры.',
    responsibilities: [
      'шаг 24 px, с Shift — 4 px',
      'заголовок в таб-порядке',
      'жест и клавиатура пишут в одно состояние',
    ],
    note: 'Заголовок попадает в таб-порядок, стрелки двигают окно, Shift уменьшает шаг. Жест и клавиатура пишут в одно состояние, поэтому поведение совпадает.',
    code: `const handleTitleBarKeyDown = (event: KeyboardEvent<HTMLElement>) => {
  const step = event.shiftKey ? NUDGE_STEP_FINE : NUDGE_STEP;
  const moves: Record<string, [number, number]> = {
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
  };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  nudge(move[0], move[1]);
};`,
  },
]);
