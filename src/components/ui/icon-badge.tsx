import type { IconComponent } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/**
 * Значок файла, папки или программы. Один на всю систему: и ярлык рабочего
 * стола, и плитка в окне папки рисуют его, поэтому «значки одного размера»
 * держится геометрией, а не договорённостью двух компонентов.
 */
export function IconBadge({
  icon: Icon,
  accent = false,
}: {
  icon: IconComponent;
  /** Папку красим акцентом всегда: её отличают от файла с одного взгляда. */
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        'border-line-subtle bg-surface-2/80 grid size-(--icon-badge) shrink-0 place-items-center rounded-lg border shadow-(--shadow-raised) backdrop-blur-sm',
        'transition-[color,border-color,box-shadow] duration-(--duration-fast)',
        accent ? 'text-accent' : 'text-ink-muted group-hover:text-accent',
        'group-hover:border-line',
        'group-data-[drop-target]/tile:border-accent group-data-[drop-target]/tile:bg-accent-wash',
      )}
    >
      <Icon
        aria-hidden
        className="size-[calc(var(--icon-size)*0.26)]"
        strokeWidth={1.5}
      />
    </span>
  );
}
