'use client';

import type { IconComponent } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

type Props = {
  icon: IconComponent;
  /** Подпись: и всплывающая, и для программ чтения с экрана. */
  label: string;
  disabled?: boolean;
  onSelect: () => void;
};

/** Квадратная кнопка панели: навигация, создание, буфер обмена. */
export function ToolbarButton({ icon: Icon, label, disabled, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'border-line-subtle grid size-7 place-items-center rounded-md border transition-colors duration-(--duration-fast)',
        disabled
          ? 'text-ink-faint opacity-40'
          : 'text-ink-muted hover:border-accent-dim hover:text-accent',
      )}
    >
      <Icon aria-hidden className="size-4" strokeWidth={1.5} />
    </button>
  );
}
