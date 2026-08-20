export const TILE_COUNT = 9;

const START_LENGTH = 3;

/** Длина последовательности раунда: первый — три плитки, дальше по одной. */
export function lengthOfRound(round: number): number {
  return START_LENGTH + Math.max(0, round - 1);
}

type Random = () => number;

/**
 * Следующая плитка последовательности. Повтор предыдущей исключён: две вспышки
 * подряд на одной плитке неотличимы от одной длинной, и игрок ошибается не по
 * памяти, а потому что не увидел границу.
 */
export function nextTile(previous: number | null, random: Random): number {
  if (previous === null) return Math.floor(random() * TILE_COUNT);
  const shift = 1 + Math.floor(random() * (TILE_COUNT - 1));
  return (previous + shift) % TILE_COUNT;
}

export function createSequence(round: number, random: Random): number[] {
  const sequence: number[] = [];
  const length = lengthOfRound(round);
  for (let index = 0; index < length; index += 1) {
    sequence.push(nextTile(index === 0 ? null : (sequence[index - 1] ?? null), random));
  }
  return sequence;
}

/**
 * Следующий раунд достраивает предыдущую последовательность, а не заменяет её.
 * Так игрок опирается на то, что уже запомнил, и учит по одной плитке за раунд.
 */
export function extend(sequence: number[], random: Random): number[] {
  return [...sequence, nextTile(sequence[sequence.length - 1] ?? null, random)];
}

/** Показ ускоряется с раундом, но упирается в порог различимости. */
export function litDurationOf(round: number): number {
  return Math.max(260, 420 - (round - 1) * 20);
}

export function gapDurationOf(round: number): number {
  return Math.max(120, 180 - (round - 1) * 8);
}
