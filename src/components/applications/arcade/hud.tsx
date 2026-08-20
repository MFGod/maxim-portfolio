import { cn } from '@/lib/cn';

/** Показатель забега в шапке игры: подпись сверху, значение крупно под ней. */
export function Metric({
  label,
  value,
  align = 'left',
}: {
  label: string;
  value: number;
  align?: 'left' | 'right';
}) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <p className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
        {label}
      </p>
      <p className="text-ink font-display text-xl leading-tight tabular-nums">
        {value}
      </p>
    </div>
  );
}
