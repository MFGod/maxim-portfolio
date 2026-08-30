'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useRouter } from 'next/navigation';

import { applications, type AppId } from '@/data/applications';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import {
  DOCK_RESERVE,
  MENUBAR_HEIGHT,
  SSR_VIEWPORT,
  WORKSPACE_INSET,
} from '@/lib/layout';
import { DESKTOP_ROUTE } from '@/lib/routes';
import { useSetting } from '@/lib/settings/hooks';
import { settingsStore } from '@/lib/settings/store';

import {
  readStoredWindows,
  snapshotWindows,
  writeStoredWindows,
  type StoredWindows,
} from './persistence';
import { emptyState, windowIdOf, windowReducer } from './reducer';
import type {
  OpenPreferences,
  Rect,
  WindowManagerState,
  WindowPayload,
  Workspace,
} from './types';

/** Рабочая область: вьюпорт минус панель и док. Скрытые места не занимают. */
function workspaceFrom(
  width: number,
  height: number,
  chrome: { menuBar: number; dock: number },
): Workspace {
  return {
    x: WORKSPACE_INSET,
    y: chrome.menuBar + WORKSPACE_INSET,
    width: Math.max(width - WORKSPACE_INSET * 2, 320),
    height: Math.max(height - chrome.menuBar - chrome.dock - WORKSPACE_INSET * 2, 240),
  };
}

const ssrWorkspace = workspaceFrom(SSR_VIEWPORT.width, SSR_VIEWPORT.height, {
  menuBar: MENUBAR_HEIGHT,
  dock: DOCK_RESERVE,
});

type WindowManagerContextValue = {
  state: WindowManagerState;
  workspace: Workspace;
  open: (app: AppId, payload?: WindowPayload) => void;
  close: (id: string) => void;
  /** Закрытие с учётом настройки подтверждения. Кнопки и клавиши идут сюда. */
  requestClose: (id: string) => void;
  pendingCloseId: string | null;
  confirmClose: () => void;
  cancelClose: () => void;
  closeAll: () => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  cycleFocus: (direction: 1 | -1) => void;
  commitRect: (id: string, rect: Rect) => void;
  isOpen: (app: AppId, payload?: WindowPayload) => boolean;
  zIndexOf: (id: string) => number;
};

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  /** Приложение из маршрута, открытое при загрузке. */
  initialApp?: AppId | null;
  initialPayload?: WindowPayload | null;
};

function createInitialState(
  app: AppId | null | undefined,
  payload: WindowPayload | null | undefined,
): WindowManagerState {
  if (!app) return emptyState;
  return windowReducer(emptyState, {
    type: 'open',
    app,
    ...(payload ? { payload } : {}),
    workspace: ssrWorkspace,
  });
}

const emptyStored: StoredWindows = { rects: {}, session: [], focused: null };

export function WindowManagerProvider({
  children,
  initialApp = null,
  initialPayload = null,
}: ProviderProps) {
  const [state, dispatch] = useReducer(
    windowReducer,
    { app: initialApp, payload: initialPayload },
    (seed) => createInitialState(seed.app, seed.payload),
  );
  const [workspace, setWorkspace] = useState<Workspace>(ssrWorkspace);
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);

  const router = useRouter();

  const workspaceRef = useRef(ssrWorkspace);
  const storedRef = useRef<StoredWindows>(emptyStored);
  const restoredRef = useRef(false);

  const showMenuBar = useSetting((settings) => settings.desktop.showMenuBar);
  const showDock = useSetting((settings) => settings.desktop.showDock);
  const autoHideDock = useSetting((settings) => settings.desktop.autoHideDock);

  const chrome = useMemo(
    () => ({
      menuBar: showMenuBar ? MENUBAR_HEIGHT : 0,
      dock: showDock && !autoHideDock ? DOCK_RESERVE : 0,
    }),
    [showMenuBar, showDock, autoHideDock],
  );

  const openWith = useCallback(
    (app: AppId, payload: WindowPayload | undefined, preferences: OpenPreferences) => {
      dispatch({
        type: 'open',
        app,
        ...(payload ? { payload } : {}),
        workspace: workspaceRef.current,
        preferences,
      });
    },
    [],
  );

  /** Запуск программы. */
  const open = useCallback(
    (app: AppId, payload?: WindowPayload) => {
      const meta = applications[app];
      if (meta.opensAs === 'page') {
        router.push(meta.route);
        return;
      }

      const settings = settingsStore.getSnapshot();
      const id = windowIdOf(app, payload);
      openWith(app, payload, {
        rect: settings.windows.rememberPositions
          ? (storedRef.current.rects[id] ?? null)
          : null,
        maximized: settings.windows.openMaximized,
        centered: settings.windows.openCentered,
      });
    },
    [openWith, router],
  );

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = workspaceFrom(window.innerWidth, window.innerHeight, chrome);
        workspaceRef.current = next;
        setWorkspace(next);
        dispatch({ type: 'fitToWorkspace', workspace: next });
      });
    };

    measure();
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [chrome]);

  /**
   * Восстановление прошлой сессии. `hydrate` вызывается здесь же: решение
   * принимается в layout-эффекте, до любых пассивных эффектов.
   */
  useIsomorphicLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    settingsStore.hydrate();
    storedRef.current = readStoredWindows();

    if (initialApp || window.location.pathname !== DESKTOP_ROUTE) return;

    const { behavior, windows } = settingsStore.getSnapshot();
    if (behavior.startup === 'none') return;

    const { session, focused, rects } = storedRef.current;
    const entries =
      behavior.startup === 'session'
        ? session
        : session.filter((entry) => entry.id === focused);

    for (const entry of entries) {
      const payload = entry.slug
        ? { slug: entry.slug }
        : entry.fileId
          ? { fileId: entry.fileId }
          : undefined;

      openWith(entry.app, payload, {
        rect: windows.rememberPositions ? (rects[entry.id] ?? null) : null,
        maximized: entry.status === 'maximized' || windows.openMaximized,
        centered: windows.openCentered,
      });
    }
  }, [initialApp, openWith]);

  useEffect(() => {
    if (!restoredRef.current) return;
    const next = snapshotWindows(state, storedRef.current);
    storedRef.current = next;

    const settings = settingsStore.getSnapshot();
    if (!settings.windows.rememberPositions && settings.behavior.startup === 'none') {
      return;
    }
    writeStoredWindows(next);
  }, [state]);

  const toggleMaximize = useCallback((id: string) => {
    dispatch({ type: 'toggleMaximize', id, workspace: workspaceRef.current });
  }, []);

  const close = useCallback((id: string) => dispatch({ type: 'close', id }), []);
  const closeAll = useCallback(() => dispatch({ type: 'closeAll' }), []);
  const focus = useCallback((id: string) => dispatch({ type: 'focus', id }), []);
  const minimize = useCallback((id: string) => dispatch({ type: 'minimize', id }), []);
  const cycleFocus = useCallback(
    (direction: 1 | -1) => dispatch({ type: 'cycleFocus', direction }),
    [],
  );
  const commitRect = useCallback(
    (id: string, rect: Rect) => dispatch({ type: 'setRect', id, rect }),
    [],
  );

  const requestClose = useCallback((id: string) => {
    if (!settingsStore.getSnapshot().windows.confirmClose) {
      dispatch({ type: 'close', id });
      return;
    }
    setPendingCloseId(id);
  }, []);

  const confirmClose = useCallback(() => {
    setPendingCloseId((id) => {
      if (id) dispatch({ type: 'close', id });
      return null;
    });
  }, []);

  const cancelClose = useCallback(() => setPendingCloseId(null), []);

  const value = useMemo<WindowManagerContextValue>(
    () => ({
      state,
      workspace,
      open,
      toggleMaximize,
      close,
      requestClose,
      pendingCloseId,
      confirmClose,
      cancelClose,
      closeAll,
      focus,
      minimize,
      cycleFocus,
      commitRect,
      isOpen: (app, payload) => Boolean(state.windows[windowIdOf(app, payload)]),
      zIndexOf: (id) => state.order.indexOf(id),
    }),
    [
      state,
      workspace,
      open,
      toggleMaximize,
      close,
      requestClose,
      pendingCloseId,
      confirmClose,
      cancelClose,
      closeAll,
      focus,
      minimize,
      cycleFocus,
      commitRect,
    ],
  );

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
}

/** Доступ к оконному менеджеру. Вне провайдера — исключение. */
export function useWindowManager(): WindowManagerContextValue {
  const context = useContext(WindowManagerContext);
  if (!context) {
    throw new Error('useWindowManager вызван вне WindowManagerProvider');
  }
  return context;
}
