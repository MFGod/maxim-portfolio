'use client';

import { ChevronRight } from 'lucide-react';

import { useTranslate } from '@/lib/i18n';
import {
  SETTINGS_SECTIONS,
  searchSettings,
  type SettingsSectionId,
} from '@/lib/settings/registry';

/** Экран выбора раздела для узкого окна и мобильной версии. */
export function SectionList({
  onSelect,
}: {
  onSelect: (section: SettingsSectionId) => void;
}) {
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

export function SearchResults({
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
