import { describe, expect, it } from 'vitest';

import {
  clampIconPosition,
  defaultPositions,
  iconMetrics,
  iconsInRect,
  parseStoredPositions,
  resolvePositions,
  layoutIconPosition,
  snapToGrid,
} from '@/lib/desktop-icons';
import type { Workspace } from '@/lib/window-manager/types';

const workspace: Workspace = { x: 12, y: 42, width: 1256, height: 648 };
/** Габарит по умолчанию: те же 76×80, что были константой до настройки размера. */
const metrics = iconMetrics(76);
const ICON_SIZE = { width: metrics.width, height: metrics.height };
const ids = ['resume', 'projects', 'contact'];

describe('snapToGrid', () => {
  it('притягивает к ближайшему узлу сетки', () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(5)).toBe(0);
    expect(snapToGrid(7)).toBe(12);
    expect(snapToGrid(-7)).toBe(-12);
  });
});

describe('defaultPositions', () => {
  it('раскладывает ярлыки колонкой от левого верхнего угла', () => {
    const positions = defaultPositions(ids, workspace, metrics);
    expect(positions['resume']).toEqual({ x: 12, y: 42 });
    expect(positions['projects']?.x).toBe(12);
    expect(positions['projects']!.y).toBeGreaterThan(positions['resume']!.y);
  });

  it('на низком экране не выкидывает ярлыки за нижний край', () => {
    const short: Workspace = { x: 12, y: 42, width: 400, height: 200 };
    for (const position of Object.values(defaultPositions(ids, short, metrics))) {
      expect(position.y + ICON_SIZE.height).toBeLessThanOrEqual(short.y + short.height);
    }
  });
});

describe('clampIconPosition', () => {
  it('держит ярлык целиком внутри рабочей области', () => {
    expect(clampIconPosition({ x: -500, y: -500 }, workspace, metrics)).toEqual({
      x: 12,
      y: 42,
    });
    const far = clampIconPosition({ x: 99_999, y: 99_999 }, workspace, metrics);
    expect(far.x + ICON_SIZE.width).toBe(workspace.x + workspace.width);
    expect(far.y + ICON_SIZE.height).toBe(workspace.y + workspace.height);
  });

  it('не трогает позицию внутри границ', () => {
    expect(clampIconPosition({ x: 300, y: 300 }, workspace, metrics)).toEqual({
      x: 300,
      y: 300,
    });
  });
});

describe('parseStoredPositions', () => {
  it('пустое хранилище даёт пустой результат', () => {
    expect(parseStoredPositions(null, ids)).toEqual({});
  });

  it('битый JSON не роняет разбор', () => {
    expect(parseStoredPositions('{не json', ids)).toEqual({});
  });

  it('отбрасывает неизвестные ярлыки', () => {
    const raw = JSON.stringify({ resume: { x: 1, y: 2 }, unknown: { x: 3, y: 4 } });
    expect(parseStoredPositions(raw, ids)).toEqual({ resume: { x: 1, y: 2 } });
  });

  it('отбрасывает нечисловые и бесконечные координаты', () => {
    const raw = JSON.stringify({
      resume: { x: 'слева', y: 2 },
      projects: { x: 1 },
      contact: { x: 5, y: 6 },
    });
    expect(parseStoredPositions(raw, ids)).toEqual({ contact: { x: 5, y: 6 } });
  });

  it('массив вместо объекта не проходит', () => {
    expect(parseStoredPositions('[1,2,3]', ids)).toEqual({});
  });
});

describe('resolvePositions', () => {
  it('сохранённая позиция перекрывает раскладку по умолчанию', () => {
    const resolved = resolvePositions(
      ids,
      { projects: { x: 400, y: 300 } },
      workspace,
      metrics,
    );
    expect(resolved['projects']).toEqual({ x: 400, y: 300 });
    expect(resolved['resume']).toEqual({ x: 12, y: 42 });
  });

  it('после уменьшения экрана сохранённые позиции подтягиваются внутрь', () => {
    const small: Workspace = { x: 12, y: 42, width: 300, height: 300 };
    const resolved = resolvePositions(
      ids,
      { resume: { x: 900, y: 900 } },
      small,
      metrics,
    );
    expect(resolved['resume']!.x + ICON_SIZE.width).toBeLessThanOrEqual(
      small.x + small.width,
    );
  });

  it('возвращает позицию для каждого ярлыка', () => {
    expect(Object.keys(resolvePositions(ids, {}, workspace, metrics)).sort()).toEqual(
      [...ids].sort(),
    );
  });
});

describe('layoutIconPosition', () => {
  const inside = (position: { x: number; y: number }, area: Workspace) => {
    expect(position.x).toBeGreaterThanOrEqual(area.x);
    expect(position.y).toBeGreaterThanOrEqual(area.y);
    expect(position.x + ICON_SIZE.width).toBeLessThanOrEqual(area.x + area.width);
    expect(position.y + ICON_SIZE.height).toBeLessThanOrEqual(area.y + area.height);
  };

  it('выталкивает ярлык из зоны Hero', () => {
    const center = {
      x: workspace.x + workspace.width / 2 - ICON_SIZE.width / 2,
      y: workspace.y + workspace.height / 2 - ICON_SIZE.height / 2,
    };
    const rested = layoutIconPosition(center, workspace, metrics);

    expect(rested.x).not.toBe(center.x);
    inside(rested, workspace);
  });

  it('ручная раскладка зону Hero не обходит: место выбрал человек', () => {
    const center = {
      x: workspace.x + workspace.width / 2 - ICON_SIZE.width / 2,
      y: workspace.y + workspace.height / 2 - ICON_SIZE.height / 2,
    };
    expect(clampIconPosition(center, workspace, metrics)).toEqual(center);
  });

  it('на узком экране остаётся внутри рабочей области', () => {
    // Зона Hero шире самого экрана: выталкивать некуда, границы важнее.
    const narrow: Workspace = { x: 12, y: 42, width: 300, height: 300 };
    inside(layoutIconPosition({ x: 900, y: 900 }, narrow, metrics), narrow);
    inside(layoutIconPosition({ x: 150, y: 150 }, narrow, metrics), narrow);
    inside(layoutIconPosition({ x: -400, y: -400 }, narrow, metrics), narrow);
  });
});

describe('iconsInRect', () => {
  const positions = {
    resume: { x: 0, y: 0 },
    projects: { x: 0, y: 100 },
    contact: { x: 200, y: 0 },
  };
  const keys = ['resume', 'projects', 'contact'];

  it('берёт ярлыки, которых коснулась рамка', () => {
    const rect = { x: 10, y: 10, width: 20, height: 120 };
    expect(iconsInRect(positions, keys, rect, metrics)).toEqual(['resume', 'projects']);
  });

  it('касание краем уже попадание', () => {
    const rect = { x: ICON_SIZE.width, y: 0, width: 1, height: 1 };
    expect(iconsInRect(positions, keys, rect, metrics)).toEqual(['resume']);
  });

  it('пустая рамка на свободном месте ничего не берёт', () => {
    const rect = { x: 150, y: 300, width: 0, height: 0 };
    expect(iconsInRect(positions, keys, rect, metrics)).toEqual([]);
  });

  it('ярлыки без позиции пропускаются', () => {
    const rect = { x: 0, y: 0, width: 500, height: 500 };
    expect(iconsInRect(positions, [...keys, 'unknown'], rect, metrics)).toEqual(keys);
  });
});
