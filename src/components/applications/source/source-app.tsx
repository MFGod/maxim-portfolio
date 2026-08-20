'use client';

import { ChevronLeft } from 'lucide-react';
import { useRef, useState } from 'react';

import { AppBody } from '@/components/ui/primitives';
import {
  SOURCE_GROUPS,
  sourceTour,
  type SourceEntry,
  type SourceGroupId,
} from '@/data/source-tour';
import { cn } from '@/lib/cn';
import { useContainerWide } from '@/hooks/use-container-width';

/** Ниже этой ширины список и просмотр не помещаются рядом. */
const SPLIT_WIDTH = 560;

export function SourceApp() {
  const [selectedId, setSelectedId] = useState(sourceTour[0]!.id);
  /** Узкое окно показывает что-то одно: список или файл. */
  const [showList, setShowList] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const split = useContainerWide(containerRef, SPLIT_WIDTH);
  const selected =
    sourceTour.find((entry) => entry.id === selectedId) ?? sourceTour[0]!;

  const select = (id: string) => {
    setSelectedId(id);
    setShowList(false);
  };

  return (
    <div ref={containerRef} className="h-full">
      {split ? (
        <div className="flex h-full min-h-0">
          <div className="border-line-subtle w-56 shrink-0 scrollbar-thin overflow-y-auto border-r py-3">
            <Explorer selectedId={selected.id} onSelect={setSelectedId} />
          </div>
          <div className="min-w-0 flex-1 scrollbar-thin overflow-y-auto">
            <Viewer entry={selected} />
          </div>
        </div>
      ) : showList ? (
        <div className="h-full scrollbar-thin overflow-y-auto py-3">
          <Explorer selectedId={selected.id} onSelect={select} />
        </div>
      ) : (
        <div className="h-full scrollbar-thin overflow-y-auto">
          <div className="border-line-subtle border-b px-3 py-2">
            <button
              type="button"
              onClick={() => setShowList(true)}
              className="text-ink-muted hover:text-ink flex items-center gap-1.5 text-sm transition-colors duration-(--duration-fast)"
            >
              <ChevronLeft aria-hidden className="size-4" />К списку файлов
            </button>
          </div>
          <Viewer entry={selected} />
        </div>
      )}
    </div>
  );
}

function Explorer({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Файлы проекта" className="px-2">
      {SOURCE_GROUPS.map((group) => {
        const entries = sourceTour.filter((entry) => entry.group === group.id);
        if (entries.length === 0) return null;
        return (
          <GroupBlock
            key={group.id}
            id={group.id}
            label={group.label}
            entries={entries}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        );
      })}
    </nav>
  );
}

function GroupBlock({
  id,
  label,
  entries,
  selectedId,
  onSelect,
}: {
  id: SourceGroupId;
  label: string;
  entries: SourceEntry[];
  selectedId: string;
  onSelect: (entryId: string) => void;
}) {
  return (
    <div key={id} className="mb-3 last:mb-0">
      <p className="text-2xs text-ink-faint px-2 py-1 font-mono tracking-[0.18em] uppercase">
        {label}
      </p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              aria-current={entry.id === selectedId}
              className={cn(
                'w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-(--duration-fast)',
                entry.id === selectedId
                  ? 'bg-surface-2 text-accent'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              <span className="block truncate">{entry.title}</span>
              <span className="text-ink-faint block truncate font-mono text-[10px]">
                {fileName(entry.path)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Viewer({ entry }: { entry: SourceEntry }) {
  return (
    <AppBody>
      <h2 className="text-ink text-lg font-semibold tracking-tight">{entry.title}</h2>
      <p className="text-ink-faint mt-1 font-mono text-xs break-all">{entry.path}</p>

      <p className="text-ink-muted mt-4 text-sm">{entry.purpose}</p>

      <h3 className="text-2xs text-ink-faint mt-6 font-mono tracking-[0.18em] uppercase">
        Отвечает за
      </h3>
      <ul className="mt-2 space-y-1.5">
        {entry.responsibilities.map((item) => (
          <li key={item} className="text-ink-muted flex gap-2.5 text-sm">
            <span
              aria-hidden
              className="bg-accent-dim mt-2 size-1 shrink-0 rounded-full"
            />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>

      <h3 className="text-2xs text-ink-faint mt-6 font-mono tracking-[0.18em] uppercase">
        Как это работает
      </h3>
      <p className="text-ink-muted mt-2 text-sm">{entry.note}</p>

      <pre className="border-line-subtle bg-surface-1/70 text-ink-muted mt-5 scrollbar-thin overflow-x-auto rounded-lg border p-3.5 font-mono text-xs leading-relaxed">
        <code>{entry.code}</code>
      </pre>

      <p className="text-ink-faint mt-4 text-xs">
        Фрагмент взят из файла целиком. Тест сверяет его с исходником, так что
        показанный код совпадает с рабочим.
      </p>
    </AppBody>
  );
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
