'use client';

import { useState, type FormEvent } from 'react';

import type { ArcadeFailure } from '@/lib/arcade/client';
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH, sanitizeName } from '@/lib/arcade/validate';
import { useTranslate } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/ru';

const NAME_STORAGE_KEY = 'portfolio:arcade-name';

const FAILURE_KEYS: Record<ArcadeFailure, TranslationKey> = {
  name: 'arcade.save.errorName',
  rejected: 'arcade.save.errorRejected',
  'rate-limit': 'arcade.save.errorRate',
  unavailable: 'arcade.save.errorUnavailable',
};

/** Недоступное хранилище (приватный режим) не должно ронять форму. */
function readSavedName(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {}
}

export function SaveScore({
  status,
  failure,
  onSave,
  onSkip,
}: {
  status: 'idle' | 'sending';
  failure: ArcadeFailure | null;
  onSave: (name: string) => void;
  onSkip: () => void;
}) {
  const t = useTranslate();
  const [name, setName] = useState(readSavedName);
  const [touched, setTouched] = useState(false);

  const valid = sanitizeName(name) !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const cleaned = sanitizeName(name);
    if (!cleaned || status === 'sending') return;
    rememberName(cleaned);
    onSave(cleaned);
  };

  const message = failure
    ? t(FAILURE_KEYS[failure])
    : touched && !valid
      ? t('arcade.save.errorName')
      : null;

  return (
    <form onSubmit={submit} className="w-full space-y-2.5">
      <label
        htmlFor="arcade-name"
        className="text-2xs text-ink-faint block font-mono uppercase"
      >
        {t('arcade.save.name')}
      </label>

      <div className="flex gap-2">
        <input
          id="arcade-name"
          name="player"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={NAME_MAX_LENGTH}
          minLength={NAME_MIN_LENGTH}
          autoComplete="nickname"
          placeholder={t('arcade.save.placeholder')}
          disabled={status === 'sending'}
          className="border-line bg-surface-1 text-ink placeholder:text-ink-faint focus:border-accent-dim min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-sm transition-colors duration-(--duration-fast) outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === 'sending' || !valid}
          className="border-accent-dim bg-accent-wash text-accent hover:border-accent shrink-0 rounded-md border px-3 py-1.5 text-sm transition-all duration-(--duration-fast) hover:shadow-(--glow-soft) disabled:opacity-40 disabled:shadow-none"
        >
          {status === 'sending' ? t('arcade.save.sending') : t('arcade.save.submit')}
        </button>
      </div>

      {message ? (
        <p role="alert" className="text-danger text-xs">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onSkip}
        className="text-ink-faint hover:text-ink-muted text-xs transition-colors duration-(--duration-fast)"
      >
        {t('arcade.save.skip')}
      </button>
    </form>
  );
}
