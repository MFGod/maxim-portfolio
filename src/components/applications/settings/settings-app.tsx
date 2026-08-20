'use client';

import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useRef, useState, useSyncExternalStore } from 'react';

import { useContainerWide } from '@/hooks/use-container-width';
import { cn } from '@/lib/cn';
import { useTranslate } from '@/lib/i18n';
import {
  SETTINGS_SECTIONS,
  searchSettings,
  type SettingsSectionId,
} from '@/lib/settings/registry';
import { settingsSectionStore } from '@/lib/settings/section-store';
import { settingsStore } from '@/lib/settings/store';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AboutSection } from './sections/about';
import { AccessibilitySection } from './sections/accessibility';
import { AppearanceSection } from './sections/appearance';
import { BehaviorSection } from './sections/behavior';
import { DesktopSection } from './sections/desktop';
import { FilesSection } from './sections/files';
import { LanguageSection } from './sections/language';
import { MotionSection } from './sections/motion';
import { WindowsSection } from './sections/windows';

/** Ниже этой ширины окна боковой список превращается в отдельный экран. */
const SIDEBAR_THRESHOLD = 560;

/**
 * Окно настроек. Поле поиска — `type="text"`: у `type="search"` браузер рисует
 * свою кнопку очистки поверх нашей, и крестиков в поле оказывается два.
 */
export function SettingsApp() {
  const t = useTranslate();
  const section = useSyncExternalStore(
    settingsSectionStore.subscribe,
    settingsSectionStore.getSnapshot,
    settingsSectionStore.getServerSnapshot,
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const isWide = useContainerWide(rootRef, SIDEBAR_THRESHOLD);

  const [query, setQuery] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showList, setShowList] = useState(true);
  const [askReset, setAskReset] = useState(false);

  const results = searchSettings(query, t);
  const isSearching = query.trim().length > 0;

  const goTo = (next: SettingsSectionId, entryId: string | null = null) => {
    settingsSectionStore.set(next);
    setHighlightId(entryId);
    setShowList(false);
    setQuery('');
  };

  const showSidebar = isWide;
  const showContent = isWide || !showList;

  return (
    <div ref={rootRef} className="bg-surface-1 relative flex h-full min-h-0 flex-col">
      <header className="border-line-subtle flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        {!isWide && !showList ? (
          <button
            type="button"
            onClick={() => setShowList(true)}
            className="border-line-subtle text-ink-muted hover:text-ink flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors duration-(--duration-fast)"
          >
            <ChevronLeft aria-hidden className="size-3.5" />
            {t('nav.back')}
          </button>
        ) : null}

        <div className="border-line-subtle bg-surface-2 flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5">
          <Search
            aria-hidden
            className="text-ink-faint size-3.5 shrink-0"
            strokeWidth={1.5}
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.label')}
            className="text-ink placeholder:text-ink-faint w-full min-w-0 bg-transparent text-xs outline-none"
          />
          {isSearching ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('search.clear')}
              className="text-ink-faint hover:text-ink shrink-0"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {showSidebar ? (
          <nav
            aria-label={t('nav.sections')}
            className="border-line-subtle w-48 shrink-0 scrollbar-thin overflow-y-auto border-r p-2"
          >
            <ul className="space-y-0.5">
              {SETTINGS_SECTIONS.map((meta) => {
                const Icon = meta.icon;
                const active = meta.id === section && !isSearching;
                return (
                  <li key={meta.id}>
                    <button
                      type="button"
                      onClick={() => goTo(meta.id)}
                      aria-current={active || undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors duration-(--duration-fast)',
                        active
                          ? 'bg-accent-wash text-ink'
                          : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      <Icon
                        aria-hidden
                        className={cn('size-4 shrink-0', active && 'text-accent')}
                        strokeWidth={1.5}
                      />
                      <span className="truncate">{t(meta.titleKey)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        <div className="@container min-w-0 flex-1 scrollbar-thin overflow-y-auto">
          {isSearching ? (
            <SearchResults results={results} onSelect={goTo} />
          ) : showContent ? (
            <SectionPanel
              section={section}
              highlightId={highlightId}
              onReset={() => setAskReset(true)}
            />
          ) : (
            <SectionList onSelect={goTo} />
          )}
        </div>
      </div>

      {askReset ? (
        <ConfirmDialog
          tone="danger"
          title={t('reset.confirm.title')}
          body={t('reset.confirm.body')}
          confirmLabel={t('reset.confirm.submit')}
          onCancel={() => setAskReset(false)}
          onConfirm={() => {
            settingsStore.reset();
            setAskReset(false);
          }}
        />
      ) : null}
    </div>
  );
}

function SectionPanel({
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

/** Экран выбора раздела для узкого окна и мобильной версии. */
function SectionList({ onSelect }: { onSelect: (section: SettingsSectionId) => void }) {
  const t = useTranslate();

  return (
    <ul className="divide-line-subtle divide-y">
      {SETTINGS_SECTIONS.map((meta) => {
        const Icon = meta.icon;
        return (
          <li key={meta.id}>
            <button
              type="button"
              onClick={() => onSelect(meta.id)}
              className="hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-(--duration-fast)"
            >
              <span className="border-line-subtle bg-surface-2 text-ink-muted grid size-9 shrink-0 place-items-center rounded-lg border">
                <Icon aria-hidden className="size-4.5" strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-sm font-medium">
                  {t(meta.titleKey)}
                </span>
                <span className="text-ink-faint block truncate text-xs">
                  {t(meta.summaryKey)}
                </span>
              </span>
              <ChevronRight aria-hidden className="text-ink-faint size-4 shrink-0" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SearchResults({
  results,
  onSelect,
}: {
  results: ReturnType<typeof searchSettings>;
  onSelect: (section: SettingsSectionId, entryId: string) => void;
}) {
  const t = useTranslate();

  if (results.length === 0) {
    return (
      <p className="text-ink-faint px-4 py-8 text-center text-sm">
        {t('search.empty')}
      </p>
    );
  }

  return (
    <ul className="divide-line-subtle divide-y">
      {results.map((entry) => (
        <li key={`${entry.section}:${entry.id}`}>
          <button
            type="button"
            onClick={() => onSelect(entry.section, entry.id)}
            className="hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-(--duration-fast)"
          >
            <span className="min-w-0 flex-1">
              <span className="text-ink block truncate text-sm">
                {t(entry.labelKey)}
              </span>
              <span className="text-ink-faint block truncate text-xs">
                {t(`section.${entry.section}`)}
              </span>
            </span>
            <ChevronRight aria-hidden className="text-ink-faint size-4 shrink-0" />
          </button>
        </li>
      ))}
    </ul>
  );
}
