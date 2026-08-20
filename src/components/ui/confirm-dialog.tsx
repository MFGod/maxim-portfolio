'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { useTranslate } from '@/lib/i18n';

/**
 * Подтверждение действия. В системе их два — сброс настроек и закрытие окна —
 * и ведут они себя одинаково: фокус на отмене, Esc отменяет.
 */
export function ConfirmDialog({
  title,
  body,
  detail,
  confirmLabel,
  tone = 'neutral',
  scope = 'panel',
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  /** Уточнение под текстом: например, имя закрываемого окна. */
  detail?: ReactNode;
  confirmLabel: string;
  tone?: 'neutral' | 'danger';
  /** `panel` — внутри окна приложения, `screen` — поверх всего рабочего стола. */
  scope?: 'panel' | 'screen';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslate();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onCancel();
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onCancel]);

  return (
    <div
      className={cn(
        'grid place-items-center p-6',
        scope === 'screen' ? 'fixed inset-0 z-(--z-boot)' : 'absolute inset-0 z-10',
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('common.cancel')}
        onClick={onCancel}
        className="bg-glass-scrim absolute inset-0 cursor-default backdrop-blur-(--glass-blur-soft)"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="border-line bg-surface-2 relative w-full max-w-sm rounded-lg border p-5 shadow-(--shadow-window-focused)"
      >
        <h3 id="confirm-title" className="text-ink text-sm font-medium">
          {title}
        </h3>
        <p id="confirm-body" className="text-ink-muted mt-2 text-xs">
          {body}
        </p>
        {detail ? (
          <p className="text-ink-faint mt-1 font-mono text-xs">{detail}</p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="border-line-subtle text-ink-muted hover:border-line hover:text-ink rounded-md border px-3 py-1.5 text-xs transition-colors duration-(--duration-fast)"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs transition-colors duration-(--duration-fast)',
              tone === 'danger'
                ? 'border-danger bg-danger/20 text-ink hover:bg-danger/30'
                : 'border-accent bg-accent/20 text-ink hover:bg-accent/30',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
