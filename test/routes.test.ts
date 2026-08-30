import { describe, expect, it } from 'vitest';

import { applications, routeToApp, windowMeta } from '@/data/applications';
import { DESKTOP_ROUTE, pathnameFromWindow, targetFromPathname } from '@/lib/routes';
import { settingsSectionStore } from '@/lib/settings/section-store';
import type { WindowInstance } from '@/lib/window-manager/types';

function instance(partial: Partial<WindowInstance>): WindowInstance {
  return {
    id: 'x',
    app: 'resume',
    payload: null,
    status: 'normal',
    rect: { x: 0, y: 0, width: 0, height: 0 },
    restoreRect: null,
    ...partial,
  };
}

describe('targetFromPathname', () => {
  it('маршрут приложения открывает нужное окно', () => {
    expect(targetFromPathname('/resume')).toEqual({ app: 'resume' });
  });

  it('хвостовой слэш не ломает разбор', () => {
    expect(targetFromPathname('/projects/')).toEqual({ app: 'projects' });
  });

  it('маршрут проекта переносит слаг в payload', () => {
    expect(targetFromPathname('/projects/pharma-twa')).toEqual({
      app: 'project',
      payload: { slug: 'pharma-twa' },
    });
  });

  it('корень и неизвестный маршрут не открывают ничего', () => {
    expect(targetFromPathname('/')).toBeNull();
    expect(targetFromPathname('/unknown')).toBeNull();
  });

  it('корень занят картой и окна не открывает', () => {
    expect(applications.world.route).toBe('/');
    expect(routeToApp.has('/')).toBe(false);
  });

  it('рабочий стол — свой адрес, а не корень', () => {
    expect(DESKTOP_ROUTE).toBe('/desktop');
    expect(targetFromPathname(DESKTOP_ROUTE)).toBeNull();
  });
});

describe('программы-страницы', () => {
  it('карта открывается страницей, а не окном', () => {
    expect(applications.world.opensAs).toBe('page');
  });

  it('обратный индекс держит только оконные программы', () => {
    for (const id of routeToApp.values()) {
      expect(applications[id].opensAs).not.toBe('page');
    }
  });

  it('геометрию окна у программы-страницы не спрашивают', () => {
    expect(() => windowMeta('world')).toThrow(/окна у неё нет/);
    expect(windowMeta('resume').defaultSize.width).toBeGreaterThan(0);
  });
});

describe('pathnameFromWindow', () => {
  it('окно приложения отдаёт свой маршрут', () => {
    expect(pathnameFromWindow(instance({ app: 'contact' }))).toBe('/contact');
  });

  it('карточка проекта отдаёт адрес со слагом', () => {
    expect(
      pathnameFromWindow(
        instance({ app: 'project', payload: { slug: 'agents-config' } }),
      ),
    ).toBe('/projects/agents-config');
  });

  it('окно без маршрута возвращает рабочий стол, а не корень', () => {
    expect(pathnameFromWindow(instance({ app: 'terminal' }))).toBe(DESKTOP_ROUTE);
  });
});

describe('маршруты настроек', () => {
  it('раздел приходит из адреса', () => {
    expect(targetFromPathname('/settings')).toEqual({ app: 'settings' });
    expect(targetFromPathname('/settings/accessibility')).toEqual({
      app: 'settings',
      section: 'accessibility',
    });
  });

  it('неизвестный раздел открывает настройки без него', () => {
    expect(targetFromPathname('/settings/квазар')).toEqual({ app: 'settings' });
    expect(targetFromPathname('/settings/nope')).toEqual({ app: 'settings' });
  });

  it('окно настроек знает свой раздел', () => {
    settingsSectionStore.set('about');
    expect(pathnameFromWindow(instance({ app: 'settings' }))).toBe('/settings/about');
    settingsSectionStore.set('appearance');
  });
});
