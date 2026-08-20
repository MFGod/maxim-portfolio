import { cn } from '@/lib/cn';

export function SystemMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-[6px]',
        'border-accent-dim/70 bg-accent-wash border shadow-(--glow-soft)',
        'text-accent font-display text-xs leading-none font-semibold tracking-[0.05em]',
        className,
      )}
    >
      MZ
    </span>
  );
}
