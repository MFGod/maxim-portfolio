import { describe, expect, it } from 'vitest';

import type { AppId } from '@/data/applications';
import { emptyState, windowReducer } from '@/lib/window-manager/reducer';
import type {
  OpenPreferences,
  WindowManagerState,
  Workspace,
} from '@/lib/window-manager/types';

const workspace: Workspace = { x: 12, y: 42, width: 1256, height: 648 };

function open(state: WindowManagerState, app: AppId): WindowManagerState {
  return windowReducer(state, { type: 'open', app, workspace });
}

describe('windowReducer', () => {
  it('открывает окно, ставит его в фокус и кладёт наверх стопки', () => {
    const state = open(emptyState, 'resume');

    expect(Object.keys(state.windows)).toEqual(['resume']);
    expect(state.focusedId).toBe('resume');
    expect(state.order).toEqual(['resume']);
  });

  it('вписывает новое окно в рабочую область', () => {
    const { rect } = open(emptyState, 'resume').windows['resume']!;

    expect(rect.x).toBeGreaterThanOrEqual(workspace.x);
    expect(rect.y).toBeGreaterThanOrEqual(workspace.y);
    expect(rect.x + rect.width).toBeLessThanOrEqual(workspace.x + workspace.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(workspace.y + workspace.height);
  });

  it('не создаёт второе окно того же приложения, а разворачивает существующее', () => {
    let state = open(emptyState, 'resume');
    state = windowReducer(state, { type: 'minimize', id: 'resume' });
    state = open(state, 'resume');

    expect(Object.keys(state.windows)).toHaveLength(1);
    expect(state.windows['resume']?.status).toBe('normal');
    expect(state.focusedId).toBe('resume');
  });

  it('возвращает свёрнутое окно наверх по фокусу — так его открывает док', () => {
    let state = open(emptyState, 'resume');
    state = open(state, 'projects');
    state = windowReducer(state, { type: 'minimize', id: 'resume' });

    expect(state.windows['resume']?.status).toBe('minimized');
    expect(state.focusedId).toBe('projects');

    state = windowReducer(state, { type: 'focus', id: 'resume' });

    expect(state.windows['resume']?.status).toBe('normal');
    expect(state.focusedId).toBe('resume');
    expect(state.order.at(-1)).toBe('resume');
  });

  it('открывает карточки разных проектов как отдельные окна', () => {
    let state = windowReducer(emptyState, {
      type: 'open',
      app: 'project',
      payload: { slug: 'pharma-twa' },
      workspace,
    });
    state = windowReducer(state, {
      type: 'open',
      app: 'project',
      payload: { slug: 'ats-platform' },
      workspace,
    });

    expect(state.order).toEqual(['project:pharma-twa', 'project:ats-platform']);
  });

  it('раскладывает окна каскадом, а не одно поверх другого', () => {
    let state = open(emptyState, 'resume');
    state = open(state, 'projects');

    expect(state.windows['projects']?.rect.y).not.toBe(state.windows['resume']?.rect.y);
  });

  it('фокус переносит окно в конец порядка — это и есть z-index', () => {
    let state = open(emptyState, 'resume');
    state = open(state, 'projects');
    state = windowReducer(state, { type: 'focus', id: 'resume' });

    expect(state.order).toEqual(['projects', 'resume']);
    expect(state.order.indexOf('resume')).toBeGreaterThan(
      state.order.indexOf('projects'),
    );
  });

  it('после закрытия фокус уходит верхнему видимому окну', () => {
    let state = open(emptyState, 'resume');
    state = open(state, 'projects');
    state = open(state, 'skills');
    state = windowReducer(state, { type: 'minimize', id: 'projects' });
    state = windowReducer(state, { type: 'close', id: 'skills' });

    expect(state.focusedId).toBe('resume');
  });

  it('не оставляет фокус на свёрнутом окне', () => {
    let state = open(emptyState, 'resume');
    state = windowReducer(state, { type: 'minimize', id: 'resume' });

    expect(state.focusedId).toBeNull();
  });

  it('разворачивает окно на рабочую область и возвращает прежний размер', () => {
    let state = open(emptyState, 'resume');
    const original = state.windows['resume']!.rect;

    state = windowReducer(state, { type: 'toggleMaximize', id: 'resume', workspace });
    expect(state.windows['resume']?.rect).toEqual(workspace);
    expect(state.windows['resume']?.status).toBe('maximized');

    state = windowReducer(state, { type: 'toggleMaximize', id: 'resume', workspace });
    expect(state.windows['resume']?.rect).toEqual(original);
    expect(state.windows['resume']?.status).toBe('normal');
  });

  it('переключение фокуса по кругу пропускает свёрнутые окна', () => {
    let state = open(emptyState, 'resume');
    state = open(state, 'projects');
    state = open(state, 'skills');
    state = windowReducer(state, { type: 'minimize', id: 'projects' });
    state = windowReducer(state, { type: 'cycleFocus', direction: 1 });

    expect(state.focusedId).toBe('resume');
  });

  it('после уменьшения вьюпорта окна остаются внутри экрана', () => {
    let state = open(emptyState, 'projects');
    const small: Workspace = { x: 12, y: 42, width: 500, height: 400 };
    state = windowReducer(state, { type: 'fitToWorkspace', workspace: small });

    const rect = state.windows['projects']!.rect;
    expect(rect.width).toBeLessThanOrEqual(small.width);
    expect(rect.height).toBeLessThanOrEqual(small.height);
    expect(rect.x).toBeGreaterThanOrEqual(small.x);
    expect(rect.y + rect.height).toBeLessThanOrEqual(small.y + small.height);
  });

  it('развёрнутое окно после ресайза занимает новую рабочую область', () => {
    let state = open(emptyState, 'resume');
    state = windowReducer(state, { type: 'toggleMaximize', id: 'resume', workspace });
    const small: Workspace = { x: 12, y: 42, width: 500, height: 400 };
    state = windowReducer(state, { type: 'fitToWorkspace', workspace: small });

    expect(state.windows['resume']?.rect).toEqual(small);
  });

  it('игнорирует действия для несуществующих окон', () => {
    const state = windowReducer(emptyState, { type: 'close', id: 'ghost' });
    expect(state).toBe(emptyState);
  });
});

describe('предпочтения открытия', () => {
  const openWith = (
    state: WindowManagerState,
    app: AppId,
    preferences: OpenPreferences,
  ) => windowReducer(state, { type: 'open', app, workspace, preferences });

  it('сохранённое положение перекрывает раскладку по умолчанию', () => {
    const rect = { x: 200, y: 120, width: 500, height: 400 };
    const state = openWith(emptyState, 'resume', { rect });

    expect(state.windows['resume']?.rect).toEqual(rect);
    expect(state.windows['resume']?.status).toBe('normal');
  });

  it('сохранённое положение вписывается в рабочую область', () => {
    const state = openWith(emptyState, 'resume', {
      rect: { x: 5000, y: 4000, width: 500, height: 400 },
    });
    const rect = state.windows['resume']!.rect;

    expect(rect.x + rect.width).toBeLessThanOrEqual(workspace.x + workspace.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(workspace.y + workspace.height);
  });

  it('развёрнутое открытие сильнее сохранённого положения', () => {
    const rect = { x: 200, y: 120, width: 500, height: 400 };
    const state = openWith(emptyState, 'resume', { rect, maximized: true });

    expect(state.windows['resume']?.status).toBe('maximized');
    expect(state.windows['resume']?.rect).toEqual(workspace);
    expect(state.windows['resume']?.restoreRect).toEqual(rect);
  });

  it('центрирование отменяет каскадное смещение', () => {
    let cascaded = open(emptyState, 'resume');
    cascaded = open(cascaded, 'projects');
    let centered = openWith(emptyState, 'resume', { centered: true });
    centered = openWith(centered, 'projects', { centered: true });

    const first = centered.windows['resume']!.rect;
    const second = centered.windows['projects']!.rect;
    expect(first.y).toBe(
      Math.round(workspace.y + (workspace.height - first.height) * 0.38),
    );
    expect(second.x).toBe(
      Math.round(workspace.x + (workspace.width - second.width) / 2),
    );
    expect(cascaded.windows['projects']!.rect.x).not.toBe(second.x);
  });
});
