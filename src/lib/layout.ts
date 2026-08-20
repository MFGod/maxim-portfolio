import { deepFreeze } from '@/lib/freeze';

/**
 * Геометрия оболочки. Источник правды здесь; в `globals.css` те же значения
 * лежат запасными, оболочка выставляет их инлайном на корне.
 */
export const MENUBAR_HEIGHT = 30;
export const DOCK_RESERVE = 98;
/** Отступ рабочей области от краёв экрана. */
export const WORKSPACE_INSET = 12;

/** Ниже этой ширины оконный менеджер не монтируется. */
export const DESKTOP_BREAKPOINT = 768;

/** Рабочая область для сервера, где вьюпорта нет. */
export const SSR_VIEWPORT = deepFreeze({ width: 1440, height: 900 });

/**
 * Док, ярлыки и панель отключаются независимо, а сокращение `/` — в доступности.
 * Если выключено всё, открыть окно нечем: оболочка показывает кнопку запуска.
 */
export function needsFallbackLauncher(desktop: {
  showDock: boolean;
  showIcons: boolean;
  showMenuBar: boolean;
}): boolean {
  return !desktop.showDock && !desktop.showIcons && !desktop.showMenuBar;
}
