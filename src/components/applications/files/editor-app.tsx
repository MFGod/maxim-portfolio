'use client';

import { useEffect, useRef, useState } from 'react';

import { AppBody } from '@/components/ui/primitives';
import { fileStore, useFiles } from '@/lib/files/store';
import { FILE_LIMITS } from '@/lib/files/types';

/** Пауза перед записью: набор текста не должен трогать хранилище на каждой букве. */
const SAVE_DELAY = 500;

export function EditorApp({ fileId }: { fileId: string }) {
  const { nodes } = useFiles();
  const node = nodes[fileId];
  const [draft, setDraft] = useState(node?.body ?? '');
  const [knownBody, setKnownBody] = useState(node?.body ?? '');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const ready = node?.kind === 'text';

  if (node && node.body !== knownBody) {
    setKnownBody(node.body);
    setDraft(node.body);
  }

  const saved = node ? draft === node.body : true;

  /**
   * Окно редактора открывают, чтобы печатать, — подпись поля прямо это
   * обещает. Без фокуса первые нажатия уходили в никуда. Курсор встаёт в
   * конец текста: дописывать хотят чаще, чем править начало.
   */
  useEffect(() => {
    if (!ready) return;
    const input = inputRef.current;
    if (!input) return;
    if (window.matchMedia && !window.matchMedia('(pointer: fine)').matches) return;

    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [fileId, ready]);

  useEffect(() => {
    if (saved) return;
    const timer = window.setTimeout(() => {
      fileStore.write(fileId, draft);
      setKnownBody(draft);
    }, SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [draft, fileId, saved]);

  if (!node || node.kind !== 'text') {
    return (
      <AppBody>
        <p className="text-ink-muted text-sm">
          Файл удалён или недоступен. Окно можно закрыть.
        </p>
      </AppBody>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        maxLength={FILE_LIMITS.bodyLength}
        aria-label={`Содержимое файла ${node.name}`}
        placeholder="Пустой файл. Начните печатать — текст сохранится сам."
        className="text-ink placeholder:text-ink-faint min-h-0 flex-1 resize-none scrollbar-thin bg-transparent px-(--app-pad-x) py-(--app-pad-y) font-mono text-sm outline-none"
      />

      <footer className="border-line-subtle text-2xs text-ink-faint flex shrink-0 items-center justify-between gap-3 border-t px-3 py-1.5 font-mono">
        <span className="truncate">{node.name}</span>
        <span className="flex items-center gap-3">
          <span>
            {draft.length} / {FILE_LIMITS.bodyLength}
          </span>
          <span className={saved ? 'text-ink-faint' : 'text-accent'}>
            {saved ? 'сохранено' : 'сохраняю…'}
          </span>
        </span>
      </footer>
    </div>
  );
}
