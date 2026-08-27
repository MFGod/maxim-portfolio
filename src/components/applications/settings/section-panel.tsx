'use client';

import { useTranslate } from '@/lib/i18n';
import { SETTINGS_SECTIONS, type SettingsSectionId } from '@/lib/settings/registry';

import { AboutSection } from './sections/about';
import { AccessibilitySection } from './sections/accessibility';
import { AppearanceSection } from './sections/appearance';
import { BehaviorSection } from './sections/behavior';
import { DesktopSection } from './sections/desktop';
import { FilesSection } from './sections/files';
import { LanguageSection } from './sections/language';
import { MotionSection } from './sections/motion';
import { WindowsSection } from './sections/windows';

export function SectionPanel({
  section,
  highlightId,
  onReset,
}: {
  section: SettingsSectionId;
  highlightId: string | null;
  onReset: () => void;
}) {
  const t = useTranslate();
  const meta = SETTINGS_SECTIONS.find((entry) => entry.id === section);

  return (
    <div className="px-4 py-4">
      {meta ? (
        <div className="mb-4">
          <h2 className="text-ink font-display text-lg tracking-tight">
            {t(meta.titleKey)}
          </h2>
          <p className="text-ink-faint mt-0.5 text-xs">{t(meta.summaryKey)}</p>
        </div>
      ) : null}

      {sectionContent(section, highlightId, onReset)}
    </div>
  );
}

/**
 * Раздел → его содержимое. Ветвление собрано в один `switch`: новый раздел в
 * `SETTINGS_SECTION_IDS` без ветки здесь становится ошибкой компиляции.
 */
function sectionContent(
  section: SettingsSectionId,
  highlightId: string | null,
  onReset: () => void,
) {
  switch (section) {
    case 'appearance':
      return <AppearanceSection highlightId={highlightId} />;
    case 'motion':
      return <MotionSection highlightId={highlightId} />;
    case 'desktop':
      return <DesktopSection highlightId={highlightId} />;
    case 'files':
      return <FilesSection highlightId={highlightId} />;
    case 'windows':
      return <WindowsSection highlightId={highlightId} />;
    case 'behavior':
      return <BehaviorSection highlightId={highlightId} />;
    case 'accessibility':
      return <AccessibilitySection highlightId={highlightId} />;
    case 'language':
      return <LanguageSection highlightId={highlightId} />;
    case 'about':
      return <AboutSection highlightId={highlightId} onReset={onReset} />;
    default: {
      const exhaustive: never = section;
      void exhaustive;
      return null;
    }
  }
}
