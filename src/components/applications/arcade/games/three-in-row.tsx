'use client';

import { useRef } from 'react';

import { useMatch3Game } from '@/hooks/use-match3-game';
import {
  areNeighbours,
  BOARD_SIZE,
  columnOf,
  indexOf,
  rowOf,
} from '@/lib/arcade/match3';
import { MATCH3_DURATION_MS } from '@/lib/arcade/scoring';
import { cn } from '@/lib/cn';
import { useTranslate } from '@/lib/i18n';

import type { GameProps } from '../game-shell';
import { Metric } from '../hud';
import { Sigil, sigilNameKey } from '../sigils';

const CELL_PERCENT = 100 / BOARD_SIZE;

export function ThreeInRow({ onFinish }: GameProps) {
  const t = useTranslate();
  const boardElementRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const pressRef = useRef<number | null>(null);

  const {
    board,
    tiles,
    clearingSet,
    score,
    secondsLeft,
    selected,
    cursor,
    rejected,
    animated,
    durations: { popMs, fallMs },
    tap,
    trySwap,
    moveCursor,
  } = useMatch3Game({ onFinish, cellsRef });

  /**
   * Клетка под точкой считается по геометрии поля, а не по цели события: на
   * тач-экране `pointerup` приходит элементу, начавшему жест, и свайп на соседа
   * иначе не отличить от касания.
   */
  const cellAt = (clientX: number, clientY: number): number | null => {
    const rect = boardElementRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;

    const column = Math.floor(((clientX - rect.left) / rect.width) * BOARD_SIZE);
    const row = Math.floor(((clientY - rect.top) / rect.height) * BOARD_SIZE);
    if (row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) return null;
    return indexOf(row, column);
  };

  const timeRatio = secondsLeft / (MATCH3_DURATION_MS / 1000);

  return (
    <div className="flex h-full w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-96 shrink-0 items-end justify-between gap-4">
        <Metric label={t('arcade.hud.score')} value={score} />
        <Metric label={t('arcade.hud.time')} value={secondsLeft} align="right" />
      </div>

      <div
        aria-hidden
        className="bg-surface-3 h-0.5 w-full max-w-96 shrink-0 overflow-hidden rounded-full"
      >
        <div
          className="bg-accent h-full origin-left shadow-(--glow-soft) transition-transform duration-(--duration-base) ease-linear"
          style={{ transform: `scaleX(${timeRatio})` }}
        />
      </div>

      <div className="game-stage flex min-h-0 w-full flex-1 items-center justify-center">
        <div
          ref={boardElementRef}
          className="game-board border-line-subtle bg-surface-0/60 relative touch-none overflow-hidden rounded-lg border"
          onPointerDown={(event) => {
            pressRef.current = cellAt(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            const from = pressRef.current;
            pressRef.current = null;
            const to = cellAt(event.clientX, event.clientY);
            if (from === null || to === null || from === to) return;
            if (!areNeighbours(from, to)) return;
            void trySwap(from, to);
          }}
          onPointerCancel={() => {
            pressRef.current = null;
          }}
        >
          {tiles.map(({ cell, index }) => (
            <div
              key={cell.id}
              aria-hidden
              className="absolute top-0 left-0 p-[3%] transition-transform ease-(--ease-out-quart)"
              style={{
                width: `${CELL_PERCENT}%`,
                height: `${CELL_PERCENT}%`,
                transform: `translate(${columnOf(index) * 100}%, ${rowOf(index) * 100}%)`,
                transitionDuration: `${fallMs}ms`,
                color: `var(--color-sigil-${cell.kind + 1})`,
              }}
            >
              <span
                className={cn(
                  'border-line-subtle bg-surface-2 grid size-full place-items-center rounded-md border p-[18%] transition-all ease-(--ease-out-quart)',
                  selected === index &&
                    'border-accent bg-accent-wash shadow-(--glow-soft)',
                  clearingSet.has(index) && 'scale-50 opacity-0',
                  rejected === index && animated && 'arcade-nudge',
                )}
                style={{ transitionDuration: `${popMs}ms` }}
              >
                <Sigil kind={cell.kind} className="size-full" />
              </span>
            </div>
          ))}

          <div
            role="grid"
            aria-label={t('arcade.threeInRow.board')}
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
            onKeyDown={(event) => {
              const steps: Record<string, [number, number]> = {
                ArrowUp: [-1, 0],
                ArrowDown: [1, 0],
                ArrowLeft: [0, -1],
                ArrowRight: [0, 1],
              };
              const step = steps[event.key];
              if (!step) return;
              event.preventDefault();
              moveCursor(step[0], step[1]);
            }}
          >
            {board.map((cell, index) => (
              <button
                key={index}
                ref={(node) => {
                  cellsRef.current[index] = node;
                }}
                type="button"
                data-cell={index}
                tabIndex={index === cursor ? 0 : -1}
                aria-pressed={selected === index}
                aria-label={`${t('arcade.threeInRow.tile')} ${cell ? t(sigilNameKey(cell.kind)) : ''}, ${rowOf(index) + 1}×${columnOf(index) + 1}`}
                onClick={() => tap(index)}
                className="kbd-focus:bg-accent-wash rounded-md outline-none"
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-2xs text-ink-faint hidden shrink-0 text-center sm:block">
        {t('arcade.hint.keyboard')}
      </p>
    </div>
  );
}
