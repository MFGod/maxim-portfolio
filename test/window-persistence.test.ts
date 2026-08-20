import { describe, expect, it } from 'vitest';

import {
  parseStoredWindows,
  snapshotWindows,
  WINDOWS_VERSION,
} from '@/lib/window-manager/persistence';
import type { WindowInstance, WindowManagerState } from '@/lib/window-manager/types';

const rect = { x: 10, y: 20, width: 300, height: 200 };

function stored(value: unknown, version: number = WINDOWS_VERSION): string {
  return JSON.stringify({ version, ...(value as object) });
}

function instance(partial: Partial<WindowInstance>): WindowInstance {
  return {
    id: 'resume',
    app: 'resume',
    payload: null,
    status: 'normal',
    rect,
    restoreRect: null,
    ...partial,
  };
}

function state(windows: WindowInstance[]): WindowManagerState {
  return {
    windows: Object.fromEntries(windows.map((entry) => [entry.id, entry])),
    order: windows.map((entry) => entry.id),
    focusedId: windows.at(-1)?.id ?? null,
    openCount: windows.length,
  };
}

describe('parseStoredWindows', () => {
  it('не падает на мусоре', () => {
    const empty = { rects: {}, session: [], focused: null };
    expect(parseStoredWindows(null)).toEqual(empty);
    expect(parseStoredWindows('{сломано')).toEqual(empty);
    expect(parseStoredWindows('[]')).toEqual(empty);
    expect(parseStoredWindows(stored({ rects: {} }, WINDOWS_VERSION + 1))).toEqual(
      empty,
    );
  });

  it('отбрасывает неизвестные приложения и битые прямоугольники', () => {
    const parsed = parseStoredWindows(
      stored({
        rects: {
          resume: rect,
          broken: { x: 1, y: 'два' },
          huge: { ...rect, width: Infinity },
        },
        session: [
          { id: 'resume', app: 'resume', status: 'normal' },
          { id: 'ghost', app: 'ghost', status: 'normal' },
          { id: 'nope' },
        ],
        focused: 'resume',
      }),
    );

    expect(Object.keys(parsed.rects)).toEqual(['resume']);
    expect(parsed.session).toEqual([
      { id: 'resume', app: 'resume', slug: null, fileId: null, status: 'normal' },
    ]);
    expect(parsed.focused).toBe('resume');
  });

  it('свёрнутое окно восстанавливается обычным', () => {
    const parsed = parseStoredWindows(
      stored({ session: [{ id: 'resume', app: 'resume', status: 'minimized' }] }),
    );

    expect(parsed.session[0]?.status).toBe('normal');
  });
});

describe('snapshotWindows', () => {
  const previous = { rects: {}, session: [], focused: null };

  it('запоминает положение и состав открытых окон', () => {
    const snapshot = snapshotWindows(
      state([
        instance({}),
        instance({
          id: 'project:pharma-twa',
          app: 'project',
          payload: { slug: 'pharma-twa' },
        }),
      ]),
      previous,
    );

    expect(snapshot.rects['resume']).toEqual(rect);
    expect(snapshot.session).toEqual([
      { id: 'resume', app: 'resume', slug: null, fileId: null, status: 'normal' },
      {
        id: 'project:pharma-twa',
        app: 'project',
        slug: 'pharma-twa',
        fileId: null,
        status: 'normal',
      },
    ]);
    expect(snapshot.focused).toBe('project:pharma-twa');
  });

  it('у развёрнутого окна запоминает размер до разворота', () => {
    const restoreRect = { x: 1, y: 2, width: 400, height: 300 };
    const snapshot = snapshotWindows(
      state([instance({ status: 'maximized', restoreRect })]),
      previous,
    );

    expect(snapshot.rects['resume']).toEqual(restoreRect);
    expect(snapshot.session[0]?.status).toBe('maximized');
  });

  it('положение закрытых окон не теряется', () => {
    const snapshot = snapshotWindows(state([]), {
      ...previous,
      rects: { resume: rect },
    });
    expect(snapshot.rects['resume']).toEqual(rect);
    expect(snapshot.session).toEqual([]);
  });
});
