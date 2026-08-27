'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';

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
} from '@/lib/arcade/match3';
import { MATCH3_DURATION_MS, matchPoints } from '@/lib/arcade/scoring';
import { useSetting } from '@/lib/settings';

import type { GameProps } from '@/components/applications/arcade/game-shell';

const CENTRE_CELL = indexOf(BOARD_SIZE / 2, BOARD_SIZE / 2);

type Options = {
  onFinish: GameProps['onFinish'];
  /** Клетки поля: по ним ходит фокус вслед за курсором. */
  cellsRef: RefObject<(HTMLButtonElement | null)[]>;
};

/**
 * Партия «три в ряд»: поле, счёт, таймер и каскады. Ходы разыгрываются с
 * паузами под анимацию, поэтому партия живёт здесь целиком — компоненту
 * остаётся только разметка.
 */
export function useMatch3Game({ onFinish, cellsRef }: Options) {
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

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  /** Пауза, которую можно оборвать: при размонтировании ожидания снимаются. */
  const sleep = (ms: number) => {
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
  };

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

  const resolveCascades = async (start: Board) => {
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
  };

  const trySwap = async (from: number, to: number) => {
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
  };

  /** Нажатие на клетку: выбор фишки, смена выбора или обмен с соседом. */
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

  const moveCursor = (rowStep: number, columnStep: number) => {
    const row = rowOf(cursor) + rowStep;
    const column = columnOf(cursor) + columnStep;
    if (row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) return;
    setCursor(indexOf(row, column));
  };

  // Фокус идёт за курсором, но только внутри поля: иначе он прыгал бы обратно
  // на клетку, когда человек ушёл на кнопки вокруг.
  useEffect(() => {
    const node = cellsRef.current[cursor];
    const active = document.activeElement;
    if (!node || node === active) return;
    if (active instanceof HTMLElement && active.dataset.cell) node.focus();
  }, [cellsRef, cursor]);

  // Порядок в DOM — по идентификатору фишки: так узел переживает падение и
  // браузер анимирует перемещение, а не подменяет элемент.
  const tiles = board
    .flatMap((cell, index) => (cell ? [{ cell, index }] : []))
    .sort((left, right) => left.cell.id - right.cell.id);

  const clearingSet = new Set(clearing);

  return {
    board,
    tiles,
    clearingSet,
    score,
    secondsLeft,
    selected,
    cursor,
    rejected,
    animated,
    durations: { swapMs, popMs, fallMs },
    tap,
    trySwap,
    moveCursor,
  };
}
