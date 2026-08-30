'use client';

import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  TILE_COUNT,
  createSequence,
  extend,
  gapDurationOf,
  litDurationOf,
} from '@/lib/arcade/memory';
import { scoreOf } from '@/lib/arcade/scoring';
import { cn } from '@/lib/cn';
import { useTranslate } from '@/lib/i18n';
import { useSetting } from '@/lib/settings';

import type { GameProps } from '../game-shell';
import { Metric } from '../hud';

const COLUMNS = 3;
/** Пауза перед показом: игрок должен успеть перевести взгляд на поле. */
const LEAD_IN_MS = 550;
/** Пауза между верным раундом и следующим показом. */
const ROUND_BREAK_MS = 700;
/** Сколько горит подтверждение нажатия. */
const TAP_FLASH_MS = 180;
/** Пауза после ошибки: игрок должен увидеть, где ошибся. */
const MISTAKE_PAUSE_MS = 700;

type Phase = 'watch' | 'input' | 'over';

export function MemoryGame({ onFinish }: GameProps) {
  const t = useTranslate();
  const animationLevel = useSetting((settings) => settings.motion.animations);
  const systemReduceMotion = useReducedMotion();
  const animated = animationLevel !== 'off' && !systemReduceMotion;

  const [phase, setPhase] = useState<Phase>('watch');
  const [rounds, setRounds] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const [mistake, setMistake] = useState<number | null>(null);

  const sequenceRef = useRef<number[]>([]);
  /**
   * Поколение показа. React вызывает эффект повторно (в разработке — дважды
   * подряд), и без метки два показа шли бы по одному полю одновременно.
   */
  const runRef = useRef(0);
  const stepRef = useRef(0);
  const roundsRef = useRef(0);
  const aliveRef = useRef(true);
  const overRef = useRef(false);
  const sleepersRef = useRef(new Set<() => void>());
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  /** Пауза, которую можно оборвать: при размонтировании ожидания снимаются. */
  const sleep = useCallback((ms: number) => {
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        sleepersRef.current.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      sleepersRef.current.add(wake);
    });
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const sleepers = sleepersRef.current;
    return () => {
      aliveRef.current = false;
      for (const wake of [...sleepers]) wake();
    };
  }, []);

  const show = useCallback(
    async (order: number[], round: number, run: number) => {
      const stale = () =>
        !aliveRef.current || overRef.current || run !== runRef.current;

      setPhase('watch');
      setMistake(null);
      await sleep(LEAD_IN_MS);

      for (const tile of order) {
        if (stale()) return;
        setLit(tile);
        await sleep(litDurationOf(round));
        if (stale()) return;
        setLit(null);
        await sleep(gapDurationOf(round));
      }

      if (stale()) return;
      stepRef.current = 0;
      setPhase('input');
    },
    [sleep],
  );

  useEffect(() => {
    runRef.current += 1;
    sequenceRef.current = createSequence(1, Math.random);
    void show(sequenceRef.current, 1, runRef.current);
    return () => {
      runRef.current += 1;
    };
  }, [show]);

  const press = async (tile: number) => {
    if (phase !== 'input' || overRef.current) return;

    const expected = sequenceRef.current[stepRef.current];

    if (tile !== expected) {
      overRef.current = true;
      setPhase('over');
      setMistake(tile);
      await sleep(animated ? MISTAKE_PAUSE_MS : 0);
      if (!aliveRef.current) return;
      onFinishRef.current({ game: 'memory', rounds: roundsRef.current });
      return;
    }

    stepRef.current += 1;
    const roundComplete = stepRef.current >= sequenceRef.current.length;

    if (roundComplete) setPhase('watch');

    setLit(tile);
    await sleep(TAP_FLASH_MS);
    if (!aliveRef.current || overRef.current) return;
    setLit(null);

    if (!roundComplete) return;

    roundsRef.current += 1;
    setRounds(roundsRef.current);

    const grown = extend(sequenceRef.current, Math.random);
    sequenceRef.current = grown;

    await sleep(ROUND_BREAK_MS);
    if (!aliveRef.current || overRef.current) return;
    void show(grown, roundsRef.current + 1, runRef.current);
  };

  const score = scoreOf({ game: 'memory', rounds });

  return (
    <div className="flex h-full w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-96 shrink-0 items-end justify-between gap-4">
        <Metric label={t('arcade.hud.score')} value={score} />
        <Metric label={t('arcade.hud.round')} value={rounds + 1} align="right" />
      </div>

      <p
        aria-live="polite"
        className={cn(
          'text-2xs shrink-0 font-mono tracking-[0.2em] uppercase transition-colors duration-(--duration-fast)',
          phase === 'input' ? 'text-accent' : 'text-ink-faint',
        )}
      >
        {phase === 'input' ? t('arcade.memory.repeat') : t('arcade.memory.watch')}
      </p>

      <div className="game-stage flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          role="group"
          aria-label={t('arcade.memory.board')}
          className="game-board grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${COLUMNS}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: TILE_COUNT }, (_, index) => (
            <button
              key={index}
              type="button"
              disabled={phase !== 'input'}
              onPointerDown={() => void press(index)}
              aria-label={`${t('arcade.memory.tile')} ${index + 1}`}
              className={cn(
                'rounded-md border transition-all ease-(--ease-out-quart)',
                animated ? 'duration-(--duration-fast)' : 'duration-0',
                mistake === index
                  ? 'border-danger bg-danger/20'
                  : lit === index
                    ? 'border-accent bg-accent-wash shadow-(--glow-strong)'
                    : 'border-line-subtle bg-surface-2',
                phase === 'input' &&
                  mistake !== index &&
                  lit !== index &&
                  'hover:border-accent-dim',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
