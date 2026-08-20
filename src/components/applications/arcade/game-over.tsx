'use client';

import { motion, useReducedMotion } from 'motion/react';

import type { ArcadeFailure } from '@/lib/arcade/client';
import { useTranslate } from '@/lib/i18n';
import { useSetting } from '@/lib/settings';

import { SaveScore } from './save-score';

export function GameOver({
  score,
  rank,
  saved,
  canSave,
  saveStatus,
  failure,
  onSave,
  onSkip,
  onRestart,
}: {
  score: number;
  rank: number | null;
  saved: boolean;
  canSave: boolean;
  saveStatus: 'idle' | 'sending';
  failure: ArcadeFailure | null;
  onSave: (name: string) => void;
  onSkip: () => void;
  onRestart: () => void;
}) {
  const t = useTranslate();
  const animationLevel = useSetting((settings) => settings.motion.animations);
  const systemReduceMotion = useReducedMotion();
  const animated = animationLevel !== 'off' && !systemReduceMotion;

  return (
    <motion.div
      role="status"
      initial={animated ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: animated ? 0.22 : 0 }}
      className="bg-glass-scrim absolute inset-0 grid place-items-center p-4 backdrop-blur-(--glass-blur-soft)"
    >
      <motion.div
        initial={animated ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: animated ? 0.28 : 0, delay: animated ? 0.05 : 0 }}
        className="border-line bg-surface-1 w-full max-w-72 rounded-lg border p-4 text-center shadow-(--shadow-window)"
      >
        <p className="text-2xs text-ink-faint font-mono tracking-[0.2em] uppercase">
          {t('arcade.result.title')}
        </p>

        <div
          aria-hidden
          className="my-2.5 h-px"
          style={{ backgroundImage: 'var(--ornament-rule)' }}
        />

        <p className="text-2xs text-ink-faint font-mono uppercase">
          {t('arcade.result.score')}
        </p>
        <p className="text-accent font-display text-3xl tabular-nums drop-shadow-(--glow-soft)">
          {score}
        </p>

        {saved ? (
          <p className="text-ink-muted mt-2 text-xs">
            {rank === null
              ? t('arcade.result.outsideTop')
              : `${t('arcade.result.place')} — #${rank}`}
          </p>
        ) : null}

        <div className="mt-4">
          {saved ? (
            <p className="text-ink-faint text-xs">{t('arcade.result.saved')}</p>
          ) : canSave ? (
            <>
              <p className="text-ink-muted mb-2.5 text-xs">{t('arcade.save.prompt')}</p>
              <SaveScore
                status={saveStatus}
                failure={failure}
                onSave={onSave}
                onSkip={onSkip}
              />
            </>
          ) : (
            <p className="text-ink-faint text-xs">
              {t('arcade.save.errorUnavailable')}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onRestart}
          className="border-line text-ink-muted hover:border-accent-dim hover:text-accent mt-4 w-full rounded-md border px-3 py-1.5 text-sm transition-colors duration-(--duration-fast)"
        >
          {t('arcade.restart')}
        </button>
      </motion.div>
    </motion.div>
  );
}
