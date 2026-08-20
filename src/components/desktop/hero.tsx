'use client';

import { profile } from '@/data/profile';
import { cn } from '@/lib/cn';
import { useWindowManager } from '@/lib/window-manager';

import { Ornament } from './ornament';

export function Hero() {
  const { state } = useWindowManager();
  const hasWindows = state.order.length > 0;

  return (
    <div
      data-shell="welcome"
      className={cn(
        'pointer-events-none absolute inset-x-0 top-1/2 z-(--z-desktop-icons) flex -translate-y-1/2 flex-col items-center px-6 text-center',
        'transition-opacity duration-(--duration-slow)',
        hasWindows ? 'opacity-25' : 'opacity-100',
      )}
    >
      <div
        aria-hidden
        data-ambient
        className="absolute top-1/2 left-1/2 -z-10 h-64 w-[min(34rem,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          backgroundImage:
            'radial-gradient(closest-side, color-mix(in oklab, var(--color-accent) 26%, transparent), transparent)',
          animation: 'grace-breath 10s var(--ease-in-out-soft) infinite',
        }}
      />

      <Ornament
        className="text-accent-dim mb-5 w-40 opacity-0 sm:w-52"
        style={{
          animation:
            'fade-in var(--duration-cinematic) var(--ease-out-quart) 120ms both',
        }}
      />

      <h1
        className="text-gilded font-display text-3xl leading-tight font-semibold tracking-tight opacity-0 sm:text-4xl"
        style={{
          animation:
            'rise-in var(--duration-cinematic) var(--ease-out-quart) 200ms both',
        }}
      >
        {profile.name}
      </h1>

      <p
        className="text-accent mt-3 text-xs tracking-[0.2em] uppercase opacity-0 sm:text-sm sm:tracking-[0.3em]"
        style={{
          animation:
            'rise-in var(--duration-cinematic) var(--ease-out-quart) 320ms both',
        }}
      >
        {profile.role}
      </p>

      <p
        className="text-ink-muted mt-4 max-w-md text-sm opacity-0"
        style={{
          animation:
            'rise-in var(--duration-cinematic) var(--ease-out-quart) 440ms both',
        }}
      >
        {profile.tagline}
      </p>
    </div>
  );
}
