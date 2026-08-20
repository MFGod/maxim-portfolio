'use client';

import { Folder, NotepadText, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { appHint, appTitle } from '@/components/applications/app-registry';
import type { IconComponent } from '@/components/ui/icons';
import { applications, type AppId } from '@/data/applications';
import { projects } from '@/data/resume';
import { useFiles } from '@/lib/files/store';
import type { FileTree } from '@/lib/files/types';
import { useSetting } from '@/lib/settings';
import type { Locale } from '@/lib/settings/types';
import { useWindowManager } from '@/lib/window-manager';

type SearchItem =
  | {
      kind: 'app';
      key: string;
      id: AppId;
      title: string;
      hint: string;
      icon: IconComponent;
    }
  | {
      kind: 'project';
      key: string;
      slug: string;
      title: string;
      hint: string;
      icon: IconComponent;
    }
  | {
      kind: 'file';
      key: string;
      fileId: string;
      app: 'folder' | 'editor';
      title: string;
      hint: string;
      icon: IconComponent;
    };

/**
 * Индекс поиска. Программы и проекты фиксированы, файлы приходят из хранилища:
 * созданный только что документ должен находиться сразу, как в Spotlight.
 */
function buildIndex(locale: Locale, nodes: FileTree): SearchItem[] {
  return [
    ...Object.values(applications)
      .filter((app) => !['project', 'folder', 'editor'].includes(app.id))
      .map((app): SearchItem => ({
        kind: 'app',
        key: `app:${app.id}`,
        id: app.id,
        title: appTitle(app.id, locale),
        hint: appHint(app.id, locale),
        icon: app.icon,
      })),
    ...projects.map((project): SearchItem => ({
      kind: 'project',
      key: `project:${project.slug}`,
      slug: project.slug,
      title: project.name,
      hint: project.tagline,
      icon: applications.projects.icon,
    })),
    ...Object.values(nodes).map((node): SearchItem => ({
      kind: 'file',
      key: `file:${node.id}`,
      fileId: node.id,
      app: node.kind === 'folder' ? 'folder' : 'editor',
      title: node.name,
      hint: node.kind === 'folder' ? 'Папка' : 'Текстовый документ',
      icon: node.kind === 'folder' ? Folder : NotepadText,
    })),
  ];
}

function matches(item: SearchItem, query: string): boolean {
  const haystack =
    item.kind === 'project'
      ? `${item.title} ${item.hint}`
      : `${item.title} ${item.hint}`;
  return haystack.toLocaleLowerCase('ru').includes(query);
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { open } = useWindowManager();
  const locale = useSetting((settings) => settings.language);
  const { nodes } = useFiles();
  const index = useMemo(() => buildIndex(locale, nodes), [locale, nodes]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const trimmed = query.trim().toLocaleLowerCase('ru');
    if (!trimmed) return index;
    return index.filter((item) => matches(item, trimmed));
  }, [index, query]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setActiveIndex(0);
  };

  const select = (item: SearchItem | undefined) => {
    if (!item) return;
    if (item.kind === 'app') open(item.id);
    else if (item.kind === 'project') open('project', { slug: item.slug });
    else open(item.app, { fileId: item.fileId });
    onClose();
  };

  useEffect(() => {
    inputRef.current?.focus();

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, results.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        select(results[activeIndex]);
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- select пересоздаётся на каждый рендер и переподписывал бы слушатель
  }, [results, activeIndex, onClose]);

  return (
    <div className="fixed inset-0 z-(--z-boot) grid place-items-start justify-center p-4 pt-[15vh]">
      <button
        type="button"
        aria-label="Закрыть поиск"
        tabIndex={-1}
        onClick={onClose}
        className="bg-glass-scrim absolute inset-0 cursor-default backdrop-blur-(--glass-blur-soft)"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Поиск"
        initial={{ opacity: 0, scale: 0.97, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-window border-line bg-surface-1 relative w-full max-w-md border shadow-(--shadow-window-focused)"
      >
        <div className="border-line-subtle flex items-center gap-2.5 border-b px-4 py-3">
          <Search
            aria-hidden
            className="text-ink-faint size-4 shrink-0"
            strokeWidth={1.5}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            type="text"
            placeholder="Программы, проекты, файлы…"
            aria-label="Поиск по программам, проектам и файлам"
            className="text-ink placeholder:text-ink-faint w-full bg-transparent text-sm outline-none"
          />
        </div>

        <ul className="max-h-80 scrollbar-thin overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="text-ink-faint px-3 py-6 text-center text-sm">
              Ничего не найдено
            </li>
          ) : (
            results.map((item, resultIndex) => {
              const Icon = item.icon;
              const active = resultIndex === activeIndex;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(resultIndex)}
                    onClick={() => select(item)}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-(--duration-fast) ${
                      active ? 'bg-surface-3' : 'hover:bg-surface-2'
                    }`}
                  >
                    <span
                      className={`border-line-subtle bg-surface-2 grid size-8 shrink-0 place-items-center rounded-md border ${
                        active ? 'text-accent border-line' : 'text-ink-muted'
                      }`}
                    >
                      <Icon aria-hidden className="size-4" strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0">
                      <span className="text-ink block truncate text-sm">
                        {item.title}
                      </span>
                      <span className="text-ink-faint block truncate text-xs">
                        {item.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </motion.div>
    </div>
  );
}
