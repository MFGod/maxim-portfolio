import type { AppId } from '@/data/applications';

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Область, доступная окнам: вьюпорт минус системная панель и док. */
export type Workspace = Rect;

type WindowStatus = 'normal' | 'minimized' | 'maximized';

/**
 * Чем окно отличается от других окон того же приложения. Полей ровно два, и
 * заполнено всегда одно: карточка проекта знает слаг, папка и редактор — узел
 * файловой системы.
 */
export type WindowPayload = {
  slug?: string;
  fileId?: string;
};

export type WindowInstance = {
  id: string;
  app: AppId;
  payload: WindowPayload | null;
  status: WindowStatus;
  rect: Rect;
  /** Куда вернуть окно из развёрнутого состояния. */
  restoreRect: Rect | null;
};

export type WindowManagerState = {
  windows: Record<string, WindowInstance>;
  /** z-порядок: индекс в массиве и есть слой. Последний — самый верхний. */
  order: string[];
  focusedId: string | null;
  /** Сколько окон открыли за сессию. От этого считается каскад. */
  openCount: number;
};

/** Как открывать окно. Собирается из настроек: редьюсер их не читает. */
export type OpenPreferences = {
  /** Сохранённая геометрия окна, если её просили запоминать. */
  rect?: Rect | null;
  /** Открывать развёрнутым. Сильнее сохранённой геометрии и центрирования. */
  maximized?: boolean;
  /** Ставить по центру без каскадного смещения. */
  centered?: boolean;
};

export type WindowAction =
  | {
      type: 'open';
      app: AppId;
      payload?: WindowPayload;
      workspace: Workspace;
      preferences?: OpenPreferences;
    }
  | { type: 'close'; id: string }
  | { type: 'closeAll' }
  | { type: 'focus'; id: string }
  | { type: 'minimize'; id: string }
  | { type: 'toggleMaximize'; id: string; workspace: Workspace }
  | { type: 'cycleFocus'; direction: 1 | -1 }
  | { type: 'setRect'; id: string; rect: Rect }
  | { type: 'fitToWorkspace'; workspace: Workspace };
