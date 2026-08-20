'use client';

import { Keyboard, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

export function MenuBar({
  onOpenShortcuts,
  onOpenSearch,
}: {
  onOpenShortcuts: () => void;
  onOpenSearch: () => void;
}) {
  return (
    <header
      data-shell="menubar"
      className="border-line-subtle bg-glass-menubar fixed inset-x-0 top-0 z-(--z-menubar) flex h-(--menubar-height) items-center gap-3 border-b px-3 backdrop-blur-(--glass-blur)"
      aria-label="Системная панель"
    >
      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="text-2xs text-ink-faint hover:text-accent flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 transition-colors duration-(--duration-fast)"
        >
          <Search aria-hidden className="size-3.5" />
          <span className="hidden sm:inline">Поиск</span>
        </button>
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="text-2xs text-ink-faint hover:text-accent flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 transition-colors duration-(--duration-fast)"
        >
          <Keyboard aria-hidden className="size-3.5" />
          <span className="hidden sm:inline">Горячие клавиши</span>
        </button>
        <Clock />
      </div>
    </header>
  );
}

/** Часы монтируются после гидратации: на сервере времени клиента не существует. */
function Clock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="text-2xs text-ink-muted w-10 text-right font-mono tabular-nums">
      {time ?? ''}
    </span>
  );
}
