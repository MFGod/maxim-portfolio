'use client';

import { CircleQuestionMark, Minus, Plus, RotateCcw } from 'lucide-react';

import { cn } from '@/lib/cn';

type Props = {
  /** Строки подсказки под кнопкой «?». */
  hints: string[];
  hintsOpen: boolean;
  onToggleHints: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
};

/** Кнопки управления видом графа и панель подсказок. */
export function GraphHud({
  hints,
  hintsOpen,
  onToggleHints,
  onZoomIn,
  onZoomOut,
  onReset,
}: Props) {
  return (
    <div className="absolute right-3 bottom-3 flex flex-col items-end gap-1">
      <ViewButton label="Приблизить" onClick={onZoomIn}>
        <Plus aria-hidden className="size-3.5" />
      </ViewButton>
      <ViewButton label="Отдалить" onClick={onZoomOut}>
        <Minus aria-hidden className="size-3.5" />
      </ViewButton>
      <ViewButton label="Сбросить вид" onClick={onReset}>
        <RotateCcw aria-hidden className="size-3.5" />
      </ViewButton>
      <ViewButton label="Подсказки" expanded={hintsOpen} onClick={onToggleHints}>
        <CircleQuestionMark aria-hidden className="size-3.5" />
      </ViewButton>

      {hintsOpen ? (
        <ul
          className={cn(
            'border-line-subtle bg-glass-hud absolute right-9 bottom-0 w-56 space-y-1.5 rounded-lg border p-3',
            'text-2xs text-ink-muted backdrop-blur-(--glass-blur-soft)',
          )}
        >
          {hints.map((hint) => (
            <li key={hint} className="flex gap-2">
              <span
                aria-hidden
                className="border-accent/70 mt-1 size-1 shrink-0 rotate-45 border"
              />
              <span className="min-w-0">{hint}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ViewButton({
  label,
  onClick,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Задано для кнопки, раскрывающей панель. */
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
      className={cn(
        'group border-line-subtle bg-surface-1/70 relative grid size-7 place-items-center rounded-md border',
        'hover:border-accent-dim hover:text-ink backdrop-blur-(--glass-blur-soft)',
        'transition-colors duration-(--duration-fast)',
        expanded ? 'border-accent-dim text-ink' : 'text-ink-faint',
      )}
    >
      {children}
      {/* Подпись уезжает влево от колонки: снизу её обрезал бы край окна, а
          поверх кнопки она закрывала бы то, на что человек целится. */}
      <span
        aria-hidden
        className={cn(
          'border-line-subtle bg-glass-hud text-2xs text-ink-muted pointer-events-none absolute',
          'top-1/2 right-full mr-1.5 -translate-y-1/2 rounded-md border px-2 py-1 whitespace-nowrap',
          'opacity-0 backdrop-blur-(--glass-blur-soft) transition-opacity',
          'group-kbd-focus:opacity-100 duration-(--duration-fast) group-hover:opacity-100',
        )}
      >
        {label}
      </span>
    </button>
  );
}
