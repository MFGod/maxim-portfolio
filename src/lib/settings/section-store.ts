/**
 * Активный раздел Settings живёт вне React: его читает `pathnameFromWindow`
 * (обычная функция, не компонент), а смена раздела не перерисовывает оболочку.
 */

import { isSettingsSection, type SettingsSectionId } from './registry';

const DEFAULT_SECTION: SettingsSectionId = 'appearance';
const SETTINGS_PATH = '/settings';

let section: SettingsSectionId = DEFAULT_SECTION;
const listeners = new Set<() => void>();

export const settingsSectionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot: () => section,

  getServerSnapshot: () => DEFAULT_SECTION,

  get: () => section,

  /** Правит адрес сама: `useUrlSync` следит только за фокусом и о разделах не знает. */
  set(next: SettingsSectionId) {
    if (section === next) return;
    section = next;
    for (const listener of listeners) listener();

    if (typeof window === 'undefined') return;
    if (!window.location.pathname.startsWith(SETTINGS_PATH)) return;
    window.history.replaceState(null, '', `${SETTINGS_PATH}/${next}`);
  },

  /** Раздел из адреса. Неизвестное имя оставляет раздел по умолчанию. */
  fromPathname(value: string | undefined) {
    if (value && isSettingsSection(value)) this.set(value);
  },
};

export { DEFAULT_SECTION };
