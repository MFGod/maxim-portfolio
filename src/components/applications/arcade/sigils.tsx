import type { TranslationKey } from '@/lib/i18n/ru';

/**
 * Пять граней поля. Различаются формой и тоном одновременно: на мелкой плитке
 * одного тона не хватает, а при дальтонизме не хватает только тона.
 */
const SHAPES = [
  <path key="rhombus" d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />,
  <path key="triangle" d="M12 3.5 21 19.5H3Z" />,
  <g key="circle">
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.8" fill="currentColor" stroke="none" />
  </g>,
  <path key="hexagon" d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4Z" />,
  <path key="cross" d="M12 3v18M4.5 9.5h15" />,
];

export const SIGIL_COUNT = SHAPES.length;

const SIGIL_NAME_KEYS: TranslationKey[] = [
  'arcade.sigil.1',
  'arcade.sigil.2',
  'arcade.sigil.3',
  'arcade.sigil.4',
  'arcade.sigil.5',
];

export function sigilNameKey(kind: number): TranslationKey {
  return SIGIL_NAME_KEYS[kind] ?? 'arcade.sigil.1';
}

export function Sigil({ kind, className }: { kind: number; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
    >
      {SHAPES[kind] ?? SHAPES[0]}
    </svg>
  );
}
