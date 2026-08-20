'use client';

import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { scoreOf } from '@/lib/arcade/scoring';
import {
  BLOCK_HEIGHT,
  advance,
  cameraShift,
  directionOf,
  place,
  spawnX,
  speedOf,
  startingBlock,
  type Overhang,
} from '@/lib/arcade/tower';
import { cn } from '@/lib/cn';
import { useTranslate } from '@/lib/i18n';
import { useSetting } from '@/lib/settings';

import type { GameProps } from '../game-shell';
import { Metric } from '../hud';

/** Провал кадра дольше этого считаем паузой: вкладку скрыли или заблокировали. */
const MAX_FRAME_MS = 100;
/** Пауза между промахом и итогом: игрок должен увидеть, чем всё кончилось. */
const MISS_PAUSE_MS = 620;
/** Обломков на экране одновременно. Дальше они всё равно уже вне сцены. */
const DEBRIS_LIMIT = 3;

type Row = { x: number; width: number; perfect: boolean };
type Debris = Overhang & { id: number; row: number };

const BASE = startingBlock();

export function TowerBuilder({ onFinish }: GameProps) {
  const t = useTranslate();
  const animationLevel = useSetting((settings) => settings.motion.animations);
  const systemReduceMotion = useReducedMotion();
  const animated = animationLevel !== 'off' && !systemReduceMotion;

  const [rows, setRows] = useState<Row[]>(() => [
    { ...startingBlock(), perfect: false },
  ]);
  const [debris, setDebris] = useState<Debris[]>([]);
  const [perfect, setPerfect] = useState(0);
  const [over, setOver] = useState(false);

  const rowsRef = useRef(rows);
  const perfectRef = useRef(0);
  const debrisIdRef = useRef(0);
  const overRef = useRef(false);
  const movingNodeRef = useRef<HTMLDivElement>(null);
  const onFinishRef = useRef(onFinish);

  /**
   * Положение блока меняется каждый кадр, поэтому живёт в ref и в рендере не
   * читается: React о нём не знает, а узел красится напрямую.
   */
  const motionRef = useRef({
    x: spawnX(0, BASE.width),
    width: BASE.width,
    direction: directionOf(0),
  });

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  /**
   * Единственное, что меняется каждый кадр, — сдвиг блока. Он пишется прямо в
   * узел, без состояния: перерисовывать React шестьдесят раз в секунду ради
   * одного числа незачем.
   */
  const paint = useCallback(() => {
    const node = movingNodeRef.current;
    if (!node) return;
    const { x, width } = motionRef.current;
    node.style.width = `${width}%`;
    node.style.transform = `translateX(${(x / width) * 100}%)`;
  }, []);

  useLayoutEffect(paint, [paint]);

  useEffect(() => {
    let previous = performance.now();
    let frame = 0;

    const step = (now: number) => {
      // Партия кончилась — цикл не перезапускается: считать больше нечего.
      if (overRef.current) return;

      const elapsed = Math.min(now - previous, MAX_FRAME_MS);
      previous = now;

      const current = motionRef.current;
      const speed = speedOf(rowsRef.current.length - 1);
      const next = advance(
        current.x,
        current.width,
        current.direction,
        (speed * elapsed) / 1000,
      );
      current.x = next.x;
      current.direction = next.direction;
      paint();

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [paint]);

  const drop = useCallback(() => {
    if (overRef.current) return;

    const stack = rowsRef.current;
    const top = stack[stack.length - 1];
    if (!top) return;

    const moving = motionRef.current;
    const result = place(top, { x: moving.x, width: moving.width });

    const shed = (overhang: Overhang, row: number) => {
      if (!animated) return;
      debrisIdRef.current += 1;
      const piece: Debris = { ...overhang, id: debrisIdRef.current, row };
      setDebris((current) => [...current, piece].slice(-DEBRIS_LIMIT));
    };

    if (result.status === 'miss') {
      overRef.current = true;
      setOver(true);
      shed(result.overhang, stack.length);
      return;
    }

    const next: Row[] = [...stack, { ...result.block, perfect: result.perfect }];
    rowsRef.current = next;
    setRows(next);

    if (result.perfect) {
      perfectRef.current += 1;
      setPerfect(perfectRef.current);
    }
    if (result.overhang) shed(result.overhang, stack.length);

    const placed = next.length - 1;
    moving.x = spawnX(placed, result.block.width);
    moving.width = result.block.width;
    moving.direction = directionOf(placed);
    paint();
  }, [animated, paint]);

  // Итог уходит с задержкой: сначала обломок долетает, потом появляется оверлей.
  useEffect(() => {
    if (!over) return;
    const timer = setTimeout(
      () =>
        onFinishRef.current({
          game: 'tower-builder',
          blocks: rowsRef.current.length - 1,
          perfect: perfectRef.current,
        }),
      animated ? MISS_PAUSE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [animated, over]);

  const placed = rows.length - 1;
  const score = scoreOf({ game: 'tower-builder', blocks: placed, perfect });

  return (
    <div className="flex h-full w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-96 shrink-0 items-end justify-between gap-4">
        <Metric label={t('arcade.hud.score')} value={score} />
        <Metric label={t('arcade.hud.blocks')} value={placed} align="right" />
      </div>

      <div className="game-stage flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="game-board border-line-subtle bg-surface-0/60 relative overflow-hidden rounded-lg border">
          <div
            className="absolute inset-0 transition-transform duration-(--duration-slow) ease-(--ease-out-quart)"
            style={{ transform: `translateY(${cameraShift(rows.length)}%)` }}
          >
            {rows.map((row, index) => (
              <span
                key={index}
                className={cn(
                  'absolute rounded-xs border',
                  row.perfect
                    ? 'border-accent/70 shadow-(--glow-soft)'
                    : 'border-line-subtle',
                )}
                style={{
                  left: `${row.x}%`,
                  width: `${row.width}%`,
                  bottom: `${index * BLOCK_HEIGHT}%`,
                  height: `${BLOCK_HEIGHT}%`,
                  backgroundColor: `color-mix(in oklab, var(--color-accent) ${6 + (index % 3) * 5}%, var(--color-surface-2))`,
                }}
              />
            ))}

            {debris.map((piece) => (
              <span
                key={piece.id}
                aria-hidden
                className="bg-surface-3 border-line-subtle tower-debris absolute rounded-xs border"
                style={{
                  left: `${piece.x}%`,
                  width: `${piece.width}%`,
                  bottom: `${piece.row * BLOCK_HEIGHT}%`,
                  height: `${BLOCK_HEIGHT}%`,
                }}
              />
            ))}

            {over ? null : (
              <div
                ref={movingNodeRef}
                aria-hidden
                className="border-accent bg-accent-wash absolute left-0 rounded-xs border shadow-(--glow-soft)"
                style={{
                  bottom: `${rows.length * BLOCK_HEIGHT}%`,
                  height: `${BLOCK_HEIGHT}%`,
                }}
              />
            )}
          </div>

          <button
            type="button"
            onPointerDown={drop}
            onKeyDown={(event) => {
              if (event.key !== ' ' && event.key !== 'Enter') return;
              event.preventDefault();
              drop();
            }}
            disabled={over}
            aria-label={t('arcade.towerBuilder.drop')}
            className="absolute inset-0 touch-manipulation outline-none"
          />
        </div>
      </div>

      <p className="text-2xs text-ink-faint hidden shrink-0 text-center sm:block">
        {t('arcade.towerBuilder.controls')}
      </p>
    </div>
  );
}
