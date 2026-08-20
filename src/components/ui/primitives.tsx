import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Отступы содержимого приложения. Одно место на все окна. */
export function AppBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'px-(--app-pad-x) py-(--app-pad-y) sm:px-(--app-pad-x-wide) sm:py-(--app-pad-y-wide)',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mt-9 first:mt-0', className)}>
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h2 className="text-ink font-display text-base leading-none tracking-[0.16em] uppercase">
          {title}
        </h2>
        {aside}
      </div>
      <div
        aria-hidden
        className="mb-4 h-px"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--color-accent-dim), var(--color-line-subtle) 45%, transparent)',
        }}
      />
      {children}
    </section>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <li className="border-accent-dim/35 bg-accent-wash text-2xs text-ink-muted rounded-sm border px-2 py-0.5 font-mono">
      {children}
    </li>
  );
}

export function TagList({ items, label }: { items: string[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Tag key={item}>{item}</Tag>
      ))}
    </ul>
  );
}

export function LinkOut({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'group text-accent inline-flex items-center gap-1 transition-colors',
        'hover:text-accent-bright duration-(--duration-fast)',
        className,
      )}
    >
      {children}
      <ArrowUpRight
        aria-hidden
        className="size-3.5 transition-transform duration-(--duration-fast) group-hover:translate-x-px group-hover:-translate-y-px"
      />
    </a>
  );
}

/** Пары «подпись → значение» для метаданных проекта и профиля. */
export function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-2xs text-ink-faint w-36 shrink-0 font-mono tracking-wide uppercase sm:pt-0.5">
        {label}
      </dt>
      <dd className="text-ink-muted min-w-0 flex-1 text-sm">{children}</dd>
    </div>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="text-ink-muted flex gap-2.5 text-sm">
          <span
            aria-hidden
            className="border-accent/70 mt-2 size-1.5 shrink-0 rotate-45 border"
          />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
