'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { useWindowManager } from '@/lib/window-manager';

import { commandNames, runCommand } from './commands';

type Line = { id: number; text: string; kind: 'input' | 'output' };

const PROMPT = 'maxim@portfolio ~ %';

const greeting: string[] = [
  'Терминал портфолио. Данные те же, что в окнах — просто другой интерфейс.',
  'Начни с `help`.',
];

export function TerminalApp() {
  const { open } = useWindowManager();
  const [lines, setLines] = useState<Line[]>(() =>
    greeting.map((text, index) => ({ id: index, text, kind: 'output' as const })),
  );
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const nextId = useRef(greeting.length);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);

  const push = (text: string, kind: Line['kind']) => {
    setLines((current) => [...current, { id: nextId.current++, text, kind }]);
  };

  const submit = () => {
    const input = value;
    setValue('');
    setHistoryIndex(-1);
    push(`${PROMPT} ${input}`, 'input');

    if (input.trim()) setHistory((current) => [input, ...current].slice(0, 50));

    const result = runCommand(input);

    if (result.effect?.type === 'clear') {
      setLines([]);
      return;
    }

    for (const line of result.lines) push(line, 'output');

    if (result.effect?.type === 'open') {
      const { app, slug } = result.effect;
      open(app, slug ? { slug } : undefined);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (history.length === 0) return;
      event.preventDefault();
      const delta = event.key === 'ArrowUp' ? 1 : -1;
      const index = Math.min(Math.max(historyIndex + delta, -1), history.length - 1);
      setHistoryIndex(index);
      setValue(index === -1 ? '' : (history[index] ?? ''));
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const match = commandNames.find((name) => name.startsWith(value.trim()));
      if (match) setValue(match);
    }
  };

  return (
    <div
      ref={scrollRef}
      onClick={() => inputRef.current?.focus()}
      className="bg-glass-terminal h-full scrollbar-thin overflow-y-auto px-4 py-3.5 font-mono text-xs leading-relaxed"
    >
      <div role="log" aria-live="polite" aria-label="Вывод терминала">
        {lines.map((line) => (
          <p
            key={line.id}
            className={
              line.kind === 'input'
                ? 'text-ink whitespace-pre-wrap'
                : 'text-ink-muted whitespace-pre-wrap'
            }
          >
            {line.text || ' '}
          </p>
        ))}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <label htmlFor="terminal-input" className="text-accent shrink-0">
          {PROMPT}
        </label>
        <input
          id="terminal-input"
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Команда терминала"
          className="text-ink caret-accent min-w-0 flex-1 bg-transparent outline-none"
        />
      </div>
    </div>
  );
}
