import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readJson,
  readStorage,
  removeStorage,
  writeJson,
  writeStorage,
} from '@/lib/storage';

/** Хранилище браузера с настраиваемой поломкой: тесты гоняют оба исхода. */
function fakeStorage(options: { failWrite?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options.failWrite) throw new DOMException('quota', 'QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    has: (key: string) => map.has(key),
  };
}

function withStorage(storage: unknown) {
  vi.stubGlobal('window', { localStorage: storage });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('без окружения браузера', () => {
  it('чтение отдаёт null, запись сообщает о неудаче', () => {
    expect(readStorage('portfolio:any')).toBeNull();
    expect(writeStorage('portfolio:any', 'x')).toBe(false);
    expect(removeStorage('portfolio:any')).toBe(false);
  });

  it('readJson отдаёт разбору null и возвращает его ответ', () => {
    expect(readJson('portfolio:any', (raw) => raw ?? 'по умолчанию')).toBe(
      'по умолчанию',
    );
  });
});

describe('запрещённое хранилище', () => {
  it('доступ к свойству бросает — наружу это не выходит', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new DOMException('denied', 'SecurityError');
      },
    });

    expect(readStorage('portfolio:any')).toBeNull();
    expect(writeStorage('portfolio:any', 'x')).toBe(false);
  });
});

describe('обычное хранилище', () => {
  it('строка переживает запись и чтение', () => {
    withStorage(fakeStorage());

    expect(writeStorage('portfolio:key', 'значение')).toBe(true);
    expect(readStorage('portfolio:key')).toBe('значение');
    expect(removeStorage('portfolio:key')).toBe(true);
    expect(readStorage('portfolio:key')).toBeNull();
  });

  it('переполненная квота — неудача, а не исключение', () => {
    withStorage(fakeStorage({ failWrite: true }));

    expect(writeStorage('portfolio:key', 'значение')).toBe(false);
    expect(writeJson('portfolio:key', { a: 1 })).toBe(false);
  });
});

describe('readJson и writeJson', () => {
  it('возвращают записанное значение', () => {
    withStorage(fakeStorage());
    writeJson('portfolio:key', { count: 2 });

    const parse = (raw: unknown) =>
      typeof raw === 'object' && raw !== null ? (raw as { count?: number }) : {};
    expect(readJson('portfolio:key', parse).count).toBe(2);
  });

  it('битый JSON доходит до разбора как null', () => {
    withStorage(fakeStorage());
    writeStorage('portfolio:key', '{сломано');

    expect(readJson('portfolio:key', (raw) => raw)).toBeNull();
  });

  it('незаписываемое значение не бросает', () => {
    withStorage(fakeStorage());
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    expect(writeJson('portfolio:key', cyclic)).toBe(false);
  });
});
