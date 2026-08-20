/**
 * Единственная дверь в `localStorage`. Хранилище может не существовать вовсе
 * (сервер), быть запрещённым (приватный режим, отключённые куки) или
 * переполненным — и каждое из этих состояний нормально: сайт обязан работать
 * без сохранений, а не падать. Поэтому наружу отдаются значения, а не
 * исключения, и весь `try/catch` живёт здесь, а не в пяти хранилищах.
 */

/**
 * Само хранилище. Обращение к `window.localStorage` бросает в браузерах, где
 * оно запрещено политикой, поэтому доступ к свойству тоже под защитой.
 */
function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Строка из хранилища. `null` — ключа нет или хранилище недоступно. */
export function readStorage(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Записывает значение. Возвращает, получилось ли: вызывающий обычно этим не
 * интересуется, но настройке «сохранять расположение окон» знать полезно.
 */
export function writeStorage(key: string, value: string): boolean {
  const store = storage();
  if (!store) return false;

  try {
    store.setItem(key, value);
    return true;
  } catch {
    // Чаще всего это переполненная квота. Данные в памяти уже верные,
    // потеряется только их восстановление после перезагрузки.
    return false;
  }
}

export function removeStorage(key: string): boolean {
  const store = storage();
  if (!store) return false;

  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Разобранное значение из хранилища. Разбор передаётся вызывающим: только он
 * знает, что считать допустимым, а содержимое хранилища — внешние данные и
 * доверять им нельзя. Сюда же сходятся обе беды — недоступное хранилище и
 * битый JSON: и в том, и в другом случае разбору достаётся `null`.
 */
export function readJson<T>(key: string, parse: (raw: unknown) => T): T {
  const raw = readStorage(key);
  if (raw === null) return parse(null);

  try {
    return parse(JSON.parse(raw));
  } catch {
    return parse(null);
  }
}

/** Сериализует и записывает. Незаписываемое значение (циклы) не бросает. */
export function writeJson(key: string, value: unknown): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  return writeStorage(key, serialized);
}
