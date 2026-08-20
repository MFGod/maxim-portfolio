/**
 * Реестр разделов и настроек. Отсюда берётся навигация, порядок разделов,
 * адреса вида `/settings/appearance` и поисковый индекс — список настроек не
 * приходится поддерживать в трёх местах.
 */

import {
  Contrast,
  FolderCog,
  Info,
  Languages,
  MonitorCog,
  Palette,
  SlidersHorizontal,
  Sparkles,
  SquareStack,
} from 'lucide-react';

import type { IconComponent } from '@/components/ui/icons';
import type { TranslationKey } from '@/lib/i18n/ru';
import { deepFreeze } from '@/lib/freeze';

export const SETTINGS_SECTION_IDS = deepFreeze([
  'appearance',
  'motion',
  'desktop',
  'files',
  'windows',
  'behavior',
  'accessibility',
  'language',
  'about',
] as const);

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

type SettingsSectionMeta = {
  id: SettingsSectionId;
  icon: IconComponent;
  titleKey: TranslationKey;
  summaryKey: TranslationKey;
};

export const SETTINGS_SECTIONS: SettingsSectionMeta[] = deepFreeze([
  {
    id: 'appearance',
    icon: Palette,
    titleKey: 'section.appearance',
    summaryKey: 'section.appearance.summary',
  },
  {
    id: 'motion',
    icon: Sparkles,
    titleKey: 'section.motion',
    summaryKey: 'section.motion.summary',
  },
  {
    id: 'desktop',
    icon: MonitorCog,
    titleKey: 'section.desktop',
    summaryKey: 'section.desktop.summary',
  },
  {
    id: 'files',
    icon: FolderCog,
    titleKey: 'section.files',
    summaryKey: 'section.files.summary',
  },
  {
    id: 'windows',
    icon: SquareStack,
    titleKey: 'section.windows',
    summaryKey: 'section.windows.summary',
  },
  {
    id: 'behavior',
    icon: SlidersHorizontal,
    titleKey: 'section.behavior',
    summaryKey: 'section.behavior.summary',
  },
  {
    id: 'accessibility',
    icon: Contrast,
    titleKey: 'section.accessibility',
    summaryKey: 'section.accessibility.summary',
  },
  {
    id: 'language',
    icon: Languages,
    titleKey: 'section.language',
    summaryKey: 'section.language.summary',
  },
  {
    id: 'about',
    icon: Info,
    titleKey: 'section.about',
    summaryKey: 'section.about.summary',
  },
]);

/** Одна настройка в поисковом индексе. `id` совпадает с идентификатором строки. */
type SettingsEntry = {
  id: string;
  section: SettingsSectionId;
  labelKey: TranslationKey;
  descriptionKey?: TranslationKey;
  keywordsKey: TranslationKey;
};

export const SETTINGS_ENTRIES: SettingsEntry[] = deepFreeze([
  {
    id: 'theme',
    section: 'appearance',
    labelKey: 'appearance.theme.label',
    descriptionKey: 'appearance.theme.description',
    keywordsKey: 'appearance.theme.keywords',
  },
  {
    id: 'accent',
    section: 'appearance',
    labelKey: 'appearance.accent.label',
    descriptionKey: 'appearance.accent.description',
    keywordsKey: 'appearance.accent.keywords',
  },
  {
    id: 'wallpaper',
    section: 'appearance',
    labelKey: 'appearance.wallpaper.label',
    keywordsKey: 'appearance.wallpaper.keywords',
  },
  {
    id: 'transparency',
    section: 'appearance',
    labelKey: 'appearance.transparency.label',
    descriptionKey: 'appearance.transparency.description',
    keywordsKey: 'appearance.transparency.keywords',
  },
  {
    id: 'density',
    section: 'appearance',
    labelKey: 'appearance.density.label',
    descriptionKey: 'appearance.density.description',
    keywordsKey: 'appearance.density.keywords',
  },
  {
    id: 'animations',
    section: 'motion',
    labelKey: 'motion.animations.label',
    descriptionKey: 'motion.animations.description',
    keywordsKey: 'motion.animations.keywords',
  },
  {
    id: 'windowAnimations',
    section: 'motion',
    labelKey: 'motion.windowAnimations.label',
    descriptionKey: 'motion.windowAnimations.description',
    keywordsKey: 'motion.windowAnimations.keywords',
  },
  {
    id: 'dockAnimations',
    section: 'motion',
    labelKey: 'motion.dockAnimations.label',
    descriptionKey: 'motion.dockAnimations.description',
    keywordsKey: 'motion.dockAnimations.keywords',
  },
  {
    id: 'hoverEffects',
    section: 'motion',
    labelKey: 'motion.hoverEffects.label',
    descriptionKey: 'motion.hoverEffects.description',
    keywordsKey: 'motion.hoverEffects.keywords',
  },
  {
    id: 'files',
    section: 'desktop',
    labelKey: 'desktop.files.label',
    descriptionKey: 'desktop.files.description',
    keywordsKey: 'desktop.files.keywords',
  },
  {
    id: 'showIcons',
    section: 'desktop',
    labelKey: 'desktop.showIcons.label',
    keywordsKey: 'desktop.showIcons.keywords',
  },
  {
    id: 'showDock',
    section: 'desktop',
    labelKey: 'desktop.showDock.label',
    keywordsKey: 'desktop.showDock.keywords',
  },
  {
    id: 'autoHideDock',
    section: 'desktop',
    labelKey: 'desktop.autoHideDock.label',
    descriptionKey: 'desktop.autoHideDock.description',
    keywordsKey: 'desktop.autoHideDock.keywords',
  },
  {
    id: 'dockSize',
    section: 'desktop',
    labelKey: 'desktop.dockSize.label',
    keywordsKey: 'desktop.dockSize.keywords',
  },
  {
    id: 'dockMagnification',
    section: 'desktop',
    labelKey: 'desktop.dockMagnification.label',
    descriptionKey: 'desktop.dockMagnification.description',
    keywordsKey: 'desktop.dockMagnification.keywords',
  },
  {
    id: 'showMenuBar',
    section: 'desktop',
    labelKey: 'desktop.showMenuBar.label',
    keywordsKey: 'desktop.showMenuBar.keywords',
  },
  {
    id: 'windowShadows',
    section: 'desktop',
    labelKey: 'desktop.windowShadows.label',
    keywordsKey: 'desktop.windowShadows.keywords',
  },
  {
    id: 'iconSize',
    section: 'files',
    labelKey: 'files.iconSize.label',
    descriptionKey: 'files.iconSize.description',
    keywordsKey: 'files.iconSize.keywords',
  },
  {
    id: 'view',
    section: 'files',
    labelKey: 'files.view.label',
    descriptionKey: 'files.view.description',
    keywordsKey: 'files.view.keywords',
  },
  {
    id: 'group',
    section: 'files',
    labelKey: 'files.group.label',
    descriptionKey: 'files.group.description',
    keywordsKey: 'files.group.keywords',
  },
  {
    id: 'rememberPositions',
    section: 'windows',
    labelKey: 'windows.rememberPositions.label',
    descriptionKey: 'windows.rememberPositions.description',
    keywordsKey: 'windows.rememberPositions.keywords',
  },
  {
    id: 'openCentered',
    section: 'windows',
    labelKey: 'windows.openCentered.label',
    descriptionKey: 'windows.openCentered.description',
    keywordsKey: 'windows.openCentered.keywords',
  },
  {
    id: 'openMaximized',
    section: 'windows',
    labelKey: 'windows.openMaximized.label',
    keywordsKey: 'windows.openMaximized.keywords',
  },
  {
    id: 'confirmClose',
    section: 'windows',
    labelKey: 'windows.confirmClose.label',
    descriptionKey: 'windows.confirmClose.description',
    keywordsKey: 'windows.confirmClose.keywords',
  },
  {
    id: 'startup',
    section: 'behavior',
    labelKey: 'behavior.startup.label',
    descriptionKey: 'behavior.startup.description',
    keywordsKey: 'behavior.startup.keywords',
  },
  {
    id: 'startupAnimation',
    section: 'behavior',
    labelKey: 'behavior.startupAnimation.label',
    descriptionKey: 'behavior.startupAnimation.description',
    keywordsKey: 'behavior.startupAnimation.keywords',
  },
  {
    id: 'welcomeMessage',
    section: 'behavior',
    labelKey: 'behavior.welcomeMessage.label',
    keywordsKey: 'behavior.welcomeMessage.keywords',
  },
  {
    id: 'highContrast',
    section: 'accessibility',
    labelKey: 'accessibility.highContrast.label',
    descriptionKey: 'accessibility.highContrast.description',
    keywordsKey: 'accessibility.highContrast.keywords',
  },
  {
    id: 'textScale',
    section: 'accessibility',
    labelKey: 'accessibility.textScale.label',
    keywordsKey: 'accessibility.textScale.keywords',
  },
  {
    id: 'focusRing',
    section: 'accessibility',
    labelKey: 'accessibility.focusRing.label',
    descriptionKey: 'accessibility.focusRing.description',
    keywordsKey: 'accessibility.focusRing.keywords',
  },
  {
    id: 'singleKeyShortcuts',
    section: 'accessibility',
    labelKey: 'accessibility.singleKeyShortcuts.label',
    descriptionKey: 'accessibility.singleKeyShortcuts.description',
    keywordsKey: 'accessibility.singleKeyShortcuts.keywords',
  },
  {
    id: 'language',
    section: 'language',
    labelKey: 'language.label',
    descriptionKey: 'language.description',
    keywordsKey: 'language.keywords',
  },
  {
    id: 'reset',
    section: 'about',
    labelKey: 'reset.label',
    descriptionKey: 'reset.description',
    keywordsKey: 'reset.keywords',
  },
]);

export function isSettingsSection(value: string): value is SettingsSectionId {
  return (SETTINGS_SECTION_IDS as readonly string[]).includes(value);
}

/**
 * Поиск по переведённым подписям, описаниям и ключевым словам — по тому, что
 * видно на экране, плюс синонимы. Перевод передаётся снаружи: функция чистая.
 */
export function searchSettings(
  query: string,
  translate: (key: TranslationKey) => string,
): SettingsEntry[] {
  const needle = query.trim().toLocaleLowerCase('ru');
  if (!needle) return [];

  return SETTINGS_ENTRIES.filter((entry) => {
    const haystack = [
      translate(entry.labelKey),
      entry.descriptionKey ? translate(entry.descriptionKey) : '',
      translate(entry.keywordsKey),
      translate(`section.${entry.section}` as TranslationKey),
    ]
      .join(' ')
      .toLocaleLowerCase('ru');

    return haystack.includes(needle);
  });
}
