'use client';

import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  areNeighbours,
  BOARD_SIZE,
  clearCells,
  collapse,
  columnOf,
  createBoard,
  findRuns,
  hasMove,
  indexOf,
  rowOf,
  swapped,
  type Board,
  type Cell,
} from '@/lib/arcade/match3';
import { MATCH3_DURATION_MS, matchPoints } from '@/lib/arcade/scoring';
import { cn } from '@/lib/cn';
import { useTranslate } from '@/lib/i18n';
import { useSetting } from '@/lib/settings';

import type { GameProps } from '../game-shell';
import { Metric } from '../hud';
import { Sigil, sigilNameKey } from '../sigils';

const CENTRE_CELL = indexOf(BOARD_SIZE / 2, BOARD_SIZE / 2);
const CELL_PERCENT = 100 / BOARD_SIZE;

export function ThreeInRow({ onFinish }: GameProps) {
  const t = useTranslate();
  const animationLevel = useSetting((settings) => settings.motion.animations);
  const systemReduceMotion = useReducedMotion();
  const animated = animationLevel !== 'off' && !systemReduceMotion;

  const swapMs = animated ? 150 : 0;
  const popMs = animated ? 170 : 0;
  const fallMs = animated ? 210 : 0;

  // Счётчик живёт в состоянии, а не в ref: его читает инициализация поля,
  // которая исполняется во время рендера.
  const [nextId] = useState(() => {
    let value = 0;
    return () => {
      value += 1;
      return value;
    };
  });

  const [board, setBoard] = useState<Board>(() => createBoard(Math.random, nextId));
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(MATCH3_DURATION_MS / 1000);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState(CENTRE_CELL);
  const [clearing, setClearing] = useState<number[]>([]);
  const [rejected, setRejected] = useState<number | null>(null);

  const boardRef = useRef(board);
  const matchesRef = useRef<{ size: number; cascade: number }[]>([]);
  const busyRef = useRef(false);
  const overRef = useRef(false);
  const aliveRef = useRef(true);
  const sleepersRef = useRef(new Set<() => void>());
  const onFinishRef = useRef(onFinish);
  const boardElementRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef<(HTMLButtonElement | null)[]>([]);

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

  useEffect(() => {
    const deadline = Date.now() + MATCH3_DURATION_MS;

    const timer = setInterval(() => {
      const left = deadline - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(left / 1000)));
      if (left > 0) return;

      clearInterval(timer);
      if (overRef.current) return;
      overRef.current = true;
      // Копия: каскад может дописать в журнал уже после конца партии.
      onFinishRef.current({
        game: 'three-in-row',
        matches: matchesRef.current.slice(),
      });
    }, 200);

    return () => clearInterval(timer);
  }, []);

  const resolveCascades = useCallback(
    async (start: Board) => {
      let current = start;
      let cascade = 0;

      while (aliveRef.current && !overRef.current) {
        const runs = findRuns(current);
        if (runs.length === 0) break;

        let gained = 0;
        for (const run of runs) {
          matchesRef.current.push({ size: run.length, cascade });
          gained += matchPoints(run.length, cascade);
        }
        setScore((value) => value + gained);

        const doomed = runs.flat();
        setClearing(doomed);
        await sleep(popMs);
        if (!aliveRef.current) return;

        current = collapse(clearCells(current, doomed), Math.random, nextId);
        boardRef.current = current;
        setClearing([]);
        setBoard(current);

        await sleep(fallMs);
        if (!aliveRef.current) return;
        cascade += 1;
      }

      // Ходов не осталось — поле пересобирается, иначе партия встанет.
      if (aliveRef.current && !hasMove(current)) {
        const fresh = createBoard(Math.random, nextId);
        boardRef.current = fresh;
        setBoard(fresh);
      }

      busyRef.current = false;
    },
    [fallMs, nextId, popMs, sleep],
  );

  const trySwap = useCallback(
    async (from: number, to: number) => {
      if (busyRef.current || overRef.current) return;

      const next = swapped(boardRef.current, from, to);

      if (findRuns(next).length === 0) {
        setSelected(null);
        setRejected(to);
        await sleep(240);
        if (!aliveRef.current) return;
        setRejected(null);
        return;
      }

      busyRef.current = true;
      setSelected(null);
      boardRef.current = next;
      setBoard(next);

      await sleep(swapMs);
      if (!aliveRef.current) return;
      await resolveCascades(next);
    },
    [resolveCascades, sleep, swapMs],
  );

  const tap = (index: number) => {
    if (busyRef.current || overRef.current) return;
    setCursor(index);

    if (selected === null || selected === index) {
      setSelected(selected === index ? null : index);
      return;
    }

    if (!areNeighbours(selected, index)) {
      setSelected(index);
      return;
    }

    void trySwap(selected, index);
  };

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

  const pressRef = useRef<number | null>(null);

  const moveCursor = (rowStep: number, columnStep: number) => {
    const row = rowOf(cursor) + rowStep;
    const column = columnOf(cursor) + columnStep;
    if (row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) return;
    setCursor(indexOf(row, column));
  };

  useEffect(() => {
    const node = cellsRef.current[cursor];
    const active = document.activeElement;
    if (!node || node === active) return;
    if (active instanceof HTMLElement && active.dataset.cell) node.focus();
  }, [cursor]);

  const tiles = useMemo(() => {
    const list: { cell: Cell; index: number }[] = [];
    board.forEach((cell, index) => {
      if (cell) list.push({ cell, index });
    });
    // Порядок в DOM — по идентификатору фишки: так узел переживает падение и
    // браузер анимирует перемещение, а не подменяет элемент.
    list.sort((left, right) => left.cell.id - right.cell.id);
    return list;
  }, [board]);

  const clearingSet = useMemo(() => new Set(clearing), [clearing]);
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
