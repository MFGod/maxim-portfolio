'use client';

import { useState } from 'react';

export type History<T> = { entries: T[]; index: number };

export type Navigation<T> = {
  current: T;
  /** Переход в новое место. Всё, что было «вперёд», отбрасывается. */
  go: (next: T) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
};

/**
 * Где мы сейчас. Значение берётся строго по индексу: `??` здесь недопустим —
 * корень файлового дерева и есть `null`, и подстановка «запасного» места
 * незаметно возвращала бы окно туда, откуда его открыли.
 */
export function currentOf<T>(history: History<T>, fallback: T): T {
  const { entries, index } = history;
  if (index < 0 || index >= entries.length) return fallback;
  const entry = entries[index];
  return entry === undefined ? fallback : entry;
}

/**
 * Переход в новое место: всё, что было «вперёд», отбрасывается. Повторный
 * переход туда, где уже стоим, историю не растит — иначе «Назад» загорается,
 * но никуда не ведёт. Как сравнивать места, решает вызывающий: у «Моего
 * компьютера» место — объект, и сравнение по ссылке не сработало бы.
 */
export function pushEntry<T>(
  history: History<T>,
  next: T,
  isSame: (a: T, b: T) => boolean = Object.is,
): History<T> {
  const { entries, index } = history;
  const current = index >= 0 && index < entries.length ? entries[index] : undefined;
  if (current !== undefined && isSame(current, next)) return history;
  return { entries: [...entries.slice(0, index + 1), next], index: index + 1 };
}

/**
 * История переходов внутри окна: «Назад» и «Вперёд», как в проводнике.
 * Держится одним состоянием — список мест и позиция в нём: два отдельных
 * состояния разъезжались бы при быстрых переходах.
 */
export function useNavigationHistory<T>(
  initial: T,
  isSame: (a: T, b: T) => boolean = Object.is,
): Navigation<T> {
  const [history, setHistory] = useState<History<T>>({
    entries: [initial],
    index: 0,
  });

  const go = (next: T) => setHistory((state) => pushEntry(state, next, isSame));

  const back = () =>
    setHistory((state) =>
      state.index > 0 ? { ...state, index: state.index - 1 } : state,
    );

  const forward = () =>
    setHistory((state) =>
      state.index < state.entries.length - 1
        ? { ...state, index: state.index + 1 }
        : state,
    );

  return {
    current: currentOf(history, initial),
    go,
    back,
    forward,
    canBack: history.index > 0,
    canForward: history.index < history.entries.length - 1,
  };
}
