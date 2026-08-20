'use client';

import { Minus, Plus, X } from 'lucide-react';

import { cn } from '@/lib/cn';

type Props = {
  title: string;
  isMaximized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
};

const buttonClass =
  'group/control grid size-3.5 place-items-center rounded-full border border-line-strong bg-surface-3 text-transparent transition-colors duration-(--duration-fast) hover:text-ink kbd-focus:text-ink';

export function WindowControls({
  title,
  isMaximized,
  onClose,
  onMinimize,
  onToggleMaximize,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Закрыть окно «${title}»`}
        onClick={onClose}
        className={cn(buttonClass, 'hover:border-danger hover:bg-danger/25')}
      >
        <X className="size-2 stroke-[3]" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Свернуть окно «${title}»`}
        onClick={onMinimize}
        className={cn(buttonClass, 'hover:border-line-strong hover:bg-surface-4')}
      >
        <Minus className="size-2 stroke-[3]" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={
          isMaximized ? `Вернуть размер окна «${title}»` : `Развернуть окно «${title}»`
        }
        aria-pressed={isMaximized}
        onClick={onToggleMaximize}
        className={cn(buttonClass, 'hover:border-accent hover:bg-accent/25')}
      >
        <Plus className="size-2 stroke-[3]" aria-hidden />
      </button>
    </div>
  );
}
