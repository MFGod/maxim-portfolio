'use client';

import { motion } from 'motion/react';

import { profile } from '@/data/profile';

import { Ornament } from './ornament';
import { SystemMark } from './system-mark';

const steps = [
  'Инициализация…',
  'Загрузка резюме',
  'Загрузка проектов',
  'Загрузка опыта',
];

/**
 * Стартовая заставка: ~1.4 с, перекрывается любым действием, за сессию
 * показывается один раз. Интерфейс под ней уже смонтирован.
 */
export function BootScreen({ onSkip }: { onSkip: () => void }) {
  return (
    <motion.div
      role="status"
      aria-label="Загрузка портфолио"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      onPointerDown={onSkip}
      onWheel={onSkip}
      className="bg-void fixed inset-0 z-(--z-boot) grid place-items-center"
    >
      <div className="relative flex flex-col items-center px-6 text-center">
        <div
          aria-hidden
          data-ambient
          className="absolute top-0 left-1/2 size-52 -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl"
          style={{
            backgroundImage:
              'radial-gradient(closest-side, color-mix(in oklab, var(--color-accent) 28%, transparent), transparent)',
            animation: 'grace-breath 10s var(--ease-in-out-soft) infinite',
          }}
        />

        <SystemMark className="size-9 rounded-lg text-base" />

        <p className="text-gilded font-display mt-5 text-2xl leading-tight">
          {profile.name}
        </p>
        <p className="text-accent text-2xs mt-1 tracking-[0.3em] uppercase">
          {profile.role}
        </p>

        <Ornament className="text-accent-dim mt-5 w-40" />

        <ul className="text-2xs text-ink-faint mt-6 space-y-1 text-center font-mono">
          {steps.map((step, index) => (
            <motion.li
              key={step}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 + index * 0.16, duration: 0.2 }}
            >
              {step}
            </motion.li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="border-line-subtle text-2xs text-ink-faint hover:border-line hover:text-ink absolute right-5 bottom-5 rounded-md border px-3 py-1.5 transition-colors duration-(--duration-fast)"
      >
        Пропустить
      </button>
    </motion.div>
  );
}
