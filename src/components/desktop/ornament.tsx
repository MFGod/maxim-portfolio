import type { CSSProperties } from 'react';

import { cn } from '@/lib/cn';

/**
 * Гравированный разделитель: две волосяные линии, гаснущие к краям, и ромб
 * посередине. Форма собственная, цвет — `currentColor` у вызывающего.
 */
export function Ornament({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn('flex items-center gap-2', className)}
      style={style}
    >
      <span
        className="h-px flex-1"
        style={{
          backgroundImage: 'linear-gradient(to right, transparent, currentColor)',
        }}
      />
      <svg viewBox="0 0 12 12" fill="none" className="size-2.5 shrink-0">
        <path
          d="M6 1 11 6 6 11 1 6Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="h-px flex-1"
        style={{
          backgroundImage: 'linear-gradient(to left, transparent, currentColor)',
        }}
      />
    </span>
  );
}
