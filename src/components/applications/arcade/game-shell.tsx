'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';

import {
  loadLeaderboard,
  openRun,
  submitRun,
  ArcadeError,
  type ArcadeFailure,
} from '@/lib/arcade/client';
import { scoreOf } from '@/lib/arcade/scoring';
import type { GameId, RunReport } from '@/lib/arcade/types';
import { useTranslate } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/ru';

import { GameOver } from './game-over';
import { Leaderboard, type BoardState, type OwnResult } from './leaderboard';

/** Контракт игры: единственная связь с оболочкой — отчёт о законченном забеге. */
export type GameProps = { onFinish: (run: RunReport) => void };

export type GameDefinition = {
  id: GameId;
  nameKey: TranslationKey;
  hintKey: TranslationKey;
  Component: ComponentType<GameProps>;
};

type Phase = 'idle' | 'opening' | 'playing' | 'over';

export function GameShell({ game }: { game: GameDefinition }) {
  const t = useTranslate();

  const [phase, setPhase] = useState<Phase>('idle');
  const [runId, setRunId] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<{ run: RunReport; score: number } | null>(null);
  const [board, setBoard] = useState<BoardState>({ status: 'loading' });
  const [own, setOwn] = useState<OwnResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'sending'>('idle');
  const [failure, setFailure] = useState<ArcadeFailure | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fetchBoard = useCallback(() => {
    const controller = new AbortController();

    loadLeaderboard(game.id, controller.signal)
      .then((view) => {
        if (alive.current) setBoard({ status: 'ready', view });
      })
      .catch(() => {
        if (alive.current && !controller.signal.aborted) setBoard({ status: 'error' });
      });

    return () => controller.abort();
  }, [game.id]);

  useEffect(fetchBoard, [fetchBoard]);

  const refreshBoard = () => {
    setBoard({ status: 'loading' });
    fetchBoard();
  };

  const start = async () => {
    setPhase('opening');
    setResult(null);
    setOwn(null);
    setFailure(null);
    setSaveStatus('idle');

    // Отказ выдачи токена не отменяет партию: сыграть можно, сохранить нельзя.
    const issued = await openRun(game.id).catch(() => null);
    if (!alive.current) return;

    setToken(issued);
    setRunId((current) => current + 1);
    setPhase('playing');
  };

  const finish = (run: RunReport) => {
    setResult({ run, score: scoreOf(run) });
    setPhase('over');
    refreshBoard();
  };

  const save = async (name: string) => {
    if (!token || !result) return;
    setSaveStatus('sending');
    setFailure(null);

    try {
      const view = await submitRun({ token, name, run: result.run });
      if (!alive.current) return;
      setBoard({ status: 'ready', view });
      setOwn({ id: view.entryId, score: result.score, rank: view.rank });
    } catch (error) {
      if (!alive.current) return;
      setFailure(error instanceof ArcadeError ? error.reason : 'unavailable');
    } finally {
      if (alive.current) setSaveStatus('idle');
    }
  };

  const skip = () => {
    if (!result) return;
    setOwn({ id: null, score: result.score, rank: null });
  };

  const Game = game.Component;
  const saved = own !== null;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <header className="shrink-0">
          <h2 className="text-ink font-display text-lg leading-tight">
            {t(game.nameKey)}
          </h2>
          <p className="text-ink-muted mt-0.5 text-xs">{t(game.hintKey)}</p>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {phase === 'idle' || phase === 'opening' ? (
            <button
              type="button"
              onClick={start}
              disabled={phase === 'opening'}
              className="border-accent-dim bg-accent-wash text-accent hover:border-accent font-display rounded-lg border px-8 py-3 text-base tracking-[0.16em] uppercase transition-all duration-(--duration-base) hover:shadow-(--glow-strong) disabled:opacity-50"
            >
              {t('arcade.start')}
            </button>
          ) : (
            <Game key={runId} onFinish={finish} />
          )}

          {phase === 'over' && result ? (
            <GameOver
              score={result.score}
              rank={own?.rank ?? null}
              saved={saved}
              canSave={token !== null}
              saveStatus={saveStatus}
              failure={failure}
              onSave={save}
              onSkip={skip}
              onRestart={start}
            />
          ) : null}
        </div>
      </section>

      <aside className="border-line-subtle shrink-0 border-t lg:w-64 lg:border-t-0 lg:border-l">
        <Leaderboard state={board} own={own} onRetry={refreshBoard} />
      </aside>
    </div>
  );
}
