/**
 * Память окон: где они стояли и что было открыто в прошлый раз. Включается
 * настройками — без них ничего не пишется и не читается.
 */

import { APP_IDS, type AppId } from '@/data/applications';
import { readStorage, writeJson } from '@/lib/storage';

import type { Rect, WindowInstance, WindowManagerState } from './types';

const WINDOWS_STORAGE_KEY = 'portfolio:windows';
export const WINDOWS_VERSION = 1;

type SessionEntry = {
  id: string;
  app: AppId;
  slug: string | null;
  /** Узел файловой системы: для окна папки и редактора. */
  fileId: string | null;
  status: 'normal' | 'maximized';
};

export type StoredWindows = {
  rects: Record<string, Rect>;
  session: SessionEntry[];
  focused: string | null;
};

const EMPTY: StoredWindows = { rects: {}, session: [], focused: null };

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false;
  const rect = value as Record<string, unknown>;
  return (['x', 'y', 'width', 'height'] as const).every(
    (key) => typeof rect[key] === 'number' && Number.isFinite(rect[key]),
  );
}

function isAppId(value: unknown): value is AppId {
  return typeof value === 'string' && (APP_IDS as readonly string[]).includes(value);
}

/**
 * Содержимое localStorage — внешние данные. Берём только известные приложения,
 * конечные числа и знакомые состояния, остальное отбрасываем.
 */
export function parseStoredWindows(raw: string | null): StoredWindows {
  if (!raw) return EMPTY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }

  if (typeof parsed !== 'object' || parsed === null) return EMPTY;
  const envelope = parsed as Record<string, unknown>;
  if (envelope['version'] !== WINDOWS_VERSION) return EMPTY;

  const rects: Record<string, Rect> = {};
  const storedRects = envelope['rects'];
  if (typeof storedRects === 'object' && storedRects !== null) {
    for (const [id, value] of Object.entries(storedRects as Record<string, unknown>)) {
      if (isRect(value)) {
        rects[id] = {
          x: value.x,
          y: value.y,
          width: value.width,
          height: value.height,
        };
      }
    }
  }

  const session: SessionEntry[] = [];
  const storedSession = envelope['session'];
  if (Array.isArray(storedSession)) {
    for (const value of storedSession) {
      if (typeof value !== 'object' || value === null) continue;
      const entry = value as Record<string, unknown>;
      if (!isAppId(entry['app']) || typeof entry['id'] !== 'string') continue;
      const slug = typeof entry['slug'] === 'string' ? entry['slug'] : null;
      const fileId = typeof entry['fileId'] === 'string' ? entry['fileId'] : null;
      const status = entry['status'] === 'maximized' ? 'maximized' : 'normal';
      session.push({ id: entry['id'], app: entry['app'], slug, fileId, status });
    }
  }

  const focused = typeof envelope['focused'] === 'string' ? envelope['focused'] : null;
  return { rects, session, focused };
}

/** Память окон из localStorage. Недоступное хранилище — пустой результат. */
export function readStoredWindows(): StoredWindows {
  return parseStoredWindows(readStorage(WINDOWS_STORAGE_KEY));
}

/**
 * Снимок состояния для записи. Чистая функция. У развёрнутого окна сохраняется
 * размер до разворота, иначе оно таким и восстановится.
 */
export function snapshotWindows(
  state: WindowManagerState,
  previous: StoredWindows,
): StoredWindows {
  const rects = { ...previous.rects };
  const session: SessionEntry[] = [];

  for (const id of state.order) {
    const instance: WindowInstance | undefined = state.windows[id];
    if (!instance) continue;
    rects[id] = instance.restoreRect ?? instance.rect;
    session.push({
      id,
      app: instance.app,
      slug: instance.payload?.slug ?? null,
      fileId: instance.payload?.fileId ?? null,
      status: instance.status === 'maximized' ? 'maximized' : 'normal',
    });
  }

  return { rects, session, focused: state.focusedId };
}

/** Записывает память окон. Недоступное хранилище — молча ничего. */
export function writeStoredWindows(value: StoredWindows): void {
  writeJson(WINDOWS_STORAGE_KEY, { version: WINDOWS_VERSION, ...value });
}
