import { deepFreeze } from '@/lib/freeze';

/**
 * Модель настроек. Списки допустимых значений живут только здесь: их читают
 * парсер хранилища, применение к DOM и интерфейс Settings.
 */

export const THEMES = deepFreeze(['system', 'light', 'dark'] as const);
export type ThemePreference = (typeof THEMES)[number];

/** Тема после разрешения «системной». */
export type ResolvedTheme = 'light' | 'dark';

export const ACCENTS = deepFreeze(['ember', 'moss', 'tide', 'plum', 'stone'] as const);
type AccentId = (typeof ACCENTS)[number];

export const WALLPAPERS = deepFreeze([
  'default',
  'minimal',
  'deep',
  'gradient',
] as const);
type WallpaperId = (typeof WALLPAPERS)[number];

export const TRANSPARENCY_LEVELS = deepFreeze(['default', 'reduced', 'off'] as const);
type TransparencyLevel = (typeof TRANSPARENCY_LEVELS)[number];

export const DENSITIES = deepFreeze(['comfortable', 'compact'] as const);
export type Density = (typeof DENSITIES)[number];

export const ANIMATION_LEVELS = deepFreeze(['full', 'reduced', 'off'] as const);
export type AnimationLevel = (typeof ANIMATION_LEVELS)[number];

export const TEXT_SCALES = deepFreeze(['default', 'large', 'larger'] as const);
type TextScale = (typeof TEXT_SCALES)[number];

/** Кольцо фокуса усиливается, но не отключается: без него нет навигации с клавиатуры. */
export const FOCUS_RINGS = deepFreeze(['standard', 'strong'] as const);
type FocusRing = (typeof FOCUS_RINGS)[number];

/** Что открывать при загрузке. */
export const STARTUP_MODES = deepFreeze(['none', 'lastApp', 'session'] as const);
type StartupMode = (typeof STARTUP_MODES)[number];

export const LOCALES = deepFreeze(['ru', 'en'] as const);
export type Locale = (typeof LOCALES)[number];

/** Размер иконок дока в пикселях. Шаг кратен сетке интерфейса. */
export const DOCK_SIZE = deepFreeze({
  min: 36,
  max: 60,
  step: 4,
  default: 44,
} as const);

/**
 * Размер плитки значка в пикселях. Одна величина на всю систему: и ярлык на
 * столе, и плитка в окне папки берут её, поэтому «значки одного размера»
 * держится само собой, а не соглашением между двумя компонентами.
 */
/** Режимы отображения содержимого папки. Порядок задаёт переключатель. */
export const FILE_VIEWS = deepFreeze(['icons', 'list', 'columns', 'gallery'] as const);
export type FileView = (typeof FILE_VIEWS)[number];

/** Способы группировки содержимого папки. Порядок задаёт меню. */
export const FILE_GROUPS = deepFreeze(['none', 'kind', 'name', 'modified'] as const);
export type FileGroup = (typeof FILE_GROUPS)[number];

export const ICON_SIZE_RANGE = deepFreeze({
  min: 56,
  max: 104,
  step: 4,
  default: 76,
} as const);

export type Settings = {
  appearance: {
    theme: ThemePreference;
    accent: AccentId;
    wallpaper: WallpaperId;
    transparency: TransparencyLevel;
    density: Density;
  };
  motion: {
    /** Общий уровень движения. «Уменьшить движение» пишет сюда же. */
    animations: AnimationLevel;
    windowAnimations: boolean;
    dockAnimations: boolean;
    hoverEffects: boolean;
  };
  desktop: {
    showIcons: boolean;
    showDock: boolean;
    autoHideDock: boolean;
    dockSize: number;
    dockMagnification: boolean;
    showMenuBar: boolean;
    /** Тени окон: настройка рабочего стола, общая для всех окон. */
    windowShadows: boolean;
  };
  windows: {
    rememberPositions: boolean;
    openCentered: boolean;
    openMaximized: boolean;
    confirmClose: boolean;
  };
  behavior: {
    startup: StartupMode;
    startupAnimation: boolean;
    welcomeMessage: boolean;
  };
  accessibility: {
    highContrast: boolean;
    textScale: TextScale;
    focusRing: FocusRing;
    /** Одноклавишные сокращения (/, ?, Esc) мешают части пользователей. */
    singleKeyShortcuts: boolean;
  };
  files: {
    iconSize: number;
    view: FileView;
    group: FileGroup;
  };
  language: Locale;
};
