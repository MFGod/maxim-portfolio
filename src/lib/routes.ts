import { applications, routeToApp, type AppId } from '@/data/applications';
import { isSettingsSection, type SettingsSectionId } from '@/lib/settings/registry';
import { settingsSectionStore } from '@/lib/settings/section-store';
import type { WindowInstance, WindowPayload } from '@/lib/window-manager/types';

type RouteTarget = {
  app: AppId;
  payload?: WindowPayload;
  /** Раздел Settings. Отдельно от payload: окно настроек одно на все разделы. */
  section?: SettingsSectionId;
};

/** Маршрут → окно: `/resume` открывает Резюме сразу. */
export function targetFromPathname(pathname: string): RouteTarget | null {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  const settingsMatch = /^\/settings\/([^/]+)$/.exec(normalized);
  if (settingsMatch?.[1]) {
    const section = settingsMatch[1];
    return isSettingsSection(section)
      ? { app: 'settings', section }
      : { app: 'settings' };
  }

  const projectMatch = /^\/projects\/([\w-]+)$/.exec(normalized);
  if (projectMatch?.[1]) {
    return { app: 'project', payload: { slug: projectMatch[1] } };
  }

  const app = routeToApp.get(normalized);
  return app ? { app } : null;
}

/** Окно → маршрут, для синхронизации адресной строки. */
export function pathnameFromWindow(instance: WindowInstance): string {
  if (instance.app === 'project' && instance.payload?.slug) {
    return `/projects/${instance.payload.slug}`;
  }
  if (instance.app === 'settings') {
    return `/settings/${settingsSectionStore.get()}`;
  }
  return applications[instance.app].route ?? '/';
}
