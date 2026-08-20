'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

import type { GameId } from '@/lib/arcade/types';
import { cn } from '@/lib/cn';
import { useTranslate } from '@/lib/i18n';

import { GameShell, type GameDefinition } from './game-shell';

function GameLoading() {
  const t = useTranslate();
  return <p className="text-ink-faint text-xs">{t('arcade.loading')}</p>;
}

/**
 * Игры подключаются лениво и по одной: в окно портфолио не должен приезжать
 * код трёх игр сразу, а неактивная игра не должна оставаться смонтированной.
 */
const ThreeInRow = dynamic(
  () => import('./games/three-in-row').then((module) => module.ThreeInRow),
  { ssr: false, loading: GameLoading },
);

const TowerBuilder = dynamic(
  () => import('./games/tower-builder').then((module) => module.TowerBuilder),
  { ssr: false, loading: GameLoading },
);

const MemoryGame = dynamic(
  () => import('./games/memory-game').then((module) => module.MemoryGame),
  { ssr: false, loading: GameLoading },
);

const games: GameDefinition[] = [
  {
    id: 'three-in-row',
    nameKey: 'arcade.threeInRow.name',
    hintKey: 'arcade.threeInRow.hint',
    Component: ThreeInRow,
  },
  {
    id: 'tower-builder',
    nameKey: 'arcade.towerBuilder.name',
    hintKey: 'arcade.towerBuilder.hint',
    Component: TowerBuilder,
  },
  {
    id: 'memory',
    nameKey: 'arcade.memory.name',
    hintKey: 'arcade.memory.hint',
    Component: MemoryGame,
  },
];

export function ArcadeApp() {
  const t = useTranslate();
  const [activeId, setActiveId] = useState<GameId>(games[0]!.id);
  const active = games.find((game) => game.id === activeId) ?? games[0]!;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        role="tablist"
        aria-label={t('arcade.games')}
        className="border-line-subtle flex shrink-0 gap-1 border-b px-3 py-2"
      >
        {games.map((game) => (
          <button
            key={game.id}
            type="button"
            role="tab"
            aria-selected={game.id === activeId}
            onClick={() => setActiveId(game.id)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs transition-colors duration-(--duration-fast)',
              game.id === activeId
                ? 'border-accent-dim/50 bg-accent-wash text-accent'
                : 'text-ink-muted hover:bg-surface-2 border-transparent',
            )}
          >
            {t(game.nameKey)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        <GameShell key={active.id} game={active} />
      </div>
    </div>
  );
}
