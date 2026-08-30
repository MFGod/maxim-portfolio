import { windowMeta, type AppId } from '@/data/applications';
import { deepFreeze } from '@/lib/freeze';

import type {
  OpenPreferences,
  Rect,
  WindowAction,
  WindowInstance,
  WindowManagerState,
  WindowPayload,
  Workspace,
} from './types';

/** Шаг каскада для окон, открытых подряд. */
const CASCADE_STEP = 26;
/** Через сколько окон каскад начинается заново. */
const CASCADE_LENGTH = 6;
/** Сколько пикселей окна остаётся видимым при перетаскивании за край. */
const MIN_VISIBLE = 96;

export const emptyState: WindowManagerState = deepFreeze({
  windows: {},
  order: [],
  focusedId: null,
  openCount: 0,
});

/**
 * Идентификатор окна: `AppId`, а если окно привязано к содержимому — `<app>:<ключ>`.
 * Так карточка проекта и каждая папка получают собственное окно, а обычная
 * программа остаётся в единственном экземпляре.
 */
export function windowIdOf(app: AppId, payload?: WindowPayload | null): string {
  const key = payload?.slug ?? payload?.fileId;
  return key ? `${app}:${key}` : app;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Окно не может стать меньше своего минимума и больше рабочей области. */
function constrainSize(app: AppId, size: Rect, workspace: Workspace): Rect {
  const { minSize } = windowMeta(app);
  const width = clamp(size.width, minSize.width, workspace.width);
  const height = clamp(size.height, minSize.height, workspace.height);
  return { ...size, width, height };
}

/** Держит окно в пределах экрана, разрешая частично заезжать за края. */
function constrainPosition(rect: Rect, workspace: Workspace): Rect {
  const minX = workspace.x - rect.width + MIN_VISIBLE;
  const maxX = workspace.x + workspace.width - MIN_VISIBLE;
  const minY = workspace.y;
  const maxY = workspace.y + workspace.height - MIN_VISIBLE;
  return {
    ...rect,
    x: Math.round(clamp(rect.x, minX, maxX)),
    y: Math.round(clamp(rect.y, minY, maxY)),
  };
}

/**
 * Вписывает окно в рабочую область целиком, если оно туда помещается. Нужно
 * после замера реального вьюпорта: окна с серверными размерами иначе остаются
 * под доком.
 */
function containWithin(rect: Rect, workspace: Workspace): Rect {
  const maxX = workspace.x + workspace.width - rect.width;
  const maxY = workspace.y + workspace.height - rect.height;
  return {
    ...rect,
    x: Math.round(maxX >= workspace.x ? clamp(rect.x, workspace.x, maxX) : rect.x),
    y: Math.round(maxY >= workspace.y ? clamp(rect.y, workspace.y, maxY) : rect.y),
  };
}

/**
 * Прямоугольник нового окна. Центрирование отменяет каскад, иначе «по центру»
 * промахнётся мимо центра. По вертикали 0.38 высоты — чуть выше геометрического.
 */
function initialRect(
  app: AppId,
  workspace: Workspace,
  cascadeIndex: number,
  centered: boolean,
): Rect {
  const { defaultSize } = windowMeta(app);
  const sized = constrainSize(
    app,
    { x: 0, y: 0, width: defaultSize.width, height: defaultSize.height },
    workspace,
  );

  const offset = centered ? 0 : (cascadeIndex % CASCADE_LENGTH) * CASCADE_STEP;
  const x = workspace.x + (workspace.width - sized.width) / 2 + offset;
  const y = workspace.y + (workspace.height - sized.height) * 0.38 + offset;

  return constrainPosition({ ...sized, x, y }, workspace);
}

/**
 * Где и в каком состоянии появляется новое окно. Приоритет предпочтений:
 * развёрнутое → сохранённое положение → центрирование → каскад.
 */
function openGeometry(
  app: AppId,
  workspace: Workspace,
  cascadeIndex: number,
  preferences: OpenPreferences | undefined,
): Pick<WindowInstance, 'status' | 'rect' | 'restoreRect'> {
  const remembered = preferences?.rect
    ? containWithin(constrainSize(app, preferences.rect, workspace), workspace)
    : null;
  const normal =
    remembered ??
    initialRect(app, workspace, cascadeIndex, preferences?.centered ?? false);

  if (preferences?.maximized) {
    return { status: 'maximized', rect: { ...workspace }, restoreRect: normal };
  }
  return { status: 'normal', rect: normal, restoreRect: null };
}

function bringToFront(order: string[], id: string): string[] {
  const without = order.filter((entry) => entry !== id);
  without.push(id);
  return without;
}

/** Верхнее не свёрнутое окно: ему уходит фокус после закрытия. */
function topmostVisible(
  order: string[],
  windows: Record<string, WindowInstance>,
): string | null {
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const id = order[index];
    if (id && windows[id] && windows[id].status !== 'minimized') return id;
  }
  return null;
}

/** Единственный переход состояния оконного менеджера. */
export function windowReducer(
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
      }

      const instance: WindowInstance = {
        id,
        app: action.app,
        payload: action.payload ?? null,
        ...openGeometry(
          action.app,
          action.workspace,
          state.openCount,
          action.preferences,
        ),
      };

      return {
        windows: { ...state.windows, [id]: instance },
        order: [...state.order, id],
        focusedId: id,
        openCount: state.openCount + 1,
      };
    }

    case 'close': {
      if (!state.windows[action.id]) return state;
      const windows = { ...state.windows };
      delete windows[action.id];
      const order = state.order.filter((entry) => entry !== action.id);
      return { ...state, windows, order, focusedId: topmostVisible(order, windows) };
    }

    case 'closeAll':
      return { ...emptyState, openCount: state.openCount };

    case 'focus': {
      const target = state.windows[action.id];
      if (!target) return state;
      if (state.focusedId === action.id && target.status !== 'minimized') return state;
      return {
        ...state,
        windows:
          target.status === 'minimized'
            ? { ...state.windows, [action.id]: { ...target, status: 'normal' } }
            : state.windows,
        order: bringToFront(state.order, action.id),
        focusedId: action.id,
      };
    }

    case 'minimize': {
      const target = state.windows[action.id];
      if (!target || target.status === 'minimized') return state;
      const windows = {
        ...state.windows,
        [action.id]: { ...target, status: 'minimized' as const },
      };
      return { ...state, windows, focusedId: topmostVisible(state.order, windows) };
    }

    case 'toggleMaximize': {
      const target = state.windows[action.id];
      if (!target) return state;

      const next: WindowInstance =
        target.status === 'maximized'
          ? {
              ...target,
              status: 'normal',
              rect: target.restoreRect ?? target.rect,
              restoreRect: null,
            }
          : {
              ...target,
              status: 'maximized',
              restoreRect: target.rect,
              rect: { ...action.workspace },
            };

      return {
        ...state,
        windows: { ...state.windows, [action.id]: next },
        order: bringToFront(state.order, action.id),
        focusedId: action.id,
      };
    }

    case 'cycleFocus': {
      const visible = state.order.filter(
        (id) => state.windows[id]?.status !== 'minimized',
      );
      if (visible.length < 2) return state;
      const current = state.focusedId ? visible.indexOf(state.focusedId) : -1;
      const nextIndex = (current + action.direction + visible.length) % visible.length;
      const nextId = visible[nextIndex];
      if (!nextId) return state;
      return { ...state, order: bringToFront(state.order, nextId), focusedId: nextId };
    }

    case 'setRect': {
      const target = state.windows[action.id];
      if (!target) return state;
      return {
        ...state,
        windows: { ...state.windows, [action.id]: { ...target, rect: action.rect } },
      };
    }

    case 'fitToWorkspace': {
      const windows: Record<string, WindowInstance> = {};
      for (const [id, instance] of Object.entries(state.windows)) {
        const rect =
          instance.status === 'maximized'
            ? { ...action.workspace }
            : containWithin(
                constrainSize(instance.app, instance.rect, action.workspace),
                action.workspace,
              );
        windows[id] = { ...instance, rect };
      }
      return { ...state, windows };
    }

    default:
      return state;
  }
}

export { constrainPosition, constrainSize };
