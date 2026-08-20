'use client';

import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { shortcuts } from '@/hooks/use-keyboard-shortcuts';

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-(--z-boot) grid place-items-center p-4">
      <button
        type="button"
        aria-label="Закрыть подсказки"
        tabIndex={-1}
        onClick={onClose}
        className="bg-glass-scrim absolute inset-0 cursor-default backdrop-blur-(--glass-blur-soft)"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Горячие клавиши"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-window border-line bg-surface-1 relative w-full max-w-sm border p-5 shadow-(--shadow-window-focused)"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-ink text-sm font-medium">Горячие клавиши</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="border-line-subtle text-ink-faint hover:text-ink grid size-7 place-items-center rounded-md border transition-colors duration-(--duration-fast)"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>

        <dl className="mt-4 space-y-2">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-baseline justify-between gap-4"
            >
              <dt className="text-ink-muted text-xs">{shortcut.description}</dt>
              <dd className="border-line-subtle bg-surface-2 text-2xs text-ink shrink-0 rounded-sm border px-1.5 py-0.5 font-mono">
                {shortcut.keys}
              </dd>
            </div>
          ))}
        </dl>
      </motion.div>
    </div>
  );
}
