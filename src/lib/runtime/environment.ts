/**
 * Разбор окружения браузера. Чистые функции: их читают окна «О системе» и
 * «Мониторинг», а тесты проверяют без DOM. Значение, которое не определяется
 * однозначно, возвращается как `null` — интерфейс покажет «Недоступно».
 */

export type DeviceType = 'phone' | 'tablet' | 'desktop';

/** Порядок важен: Edge и Opera представляются Chrome, Chrome — Safari. */
const BROWSERS: { name: string; marker: RegExp }[] = [
  { name: 'Edge', marker: /\bEdg[A-Z]?\/(\d+)/ },
  { name: 'Opera', marker: /\bOPR\/(\d+)/ },
  { name: 'Yandex', marker: /\bYaBrowser\/(\d+)/ },
  { name: 'Firefox', marker: /\bFirefox\/(\d+)/ },
  { name: 'Chrome', marker: /\bChrome\/(\d+)/ },
  { name: 'Safari', marker: /\bVersion\/(\d+).+\bSafari\// },
];

/** Название и мажорная версия браузера. `null` — движок незнакомый. */
export function parseBrowser(userAgent: string): string | null {
  for (const { name, marker } of BROWSERS) {
    const match = marker.exec(userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  return null;
}

/**
 * Тип устройства по ширине и характеру указателя: сенсорный ввод на узком
 * экране — телефон, на широком — планшет.
 */
export function deviceType(width: number, coarsePointer: boolean): DeviceType {
  if (!coarsePointer) return 'desktop';
  return width < 768 ? 'phone' : 'tablet';
}

/**
 * Время загрузки страницы по Navigation Timing. `null`, если запись ещё не
 * закрыта (`loadEventEnd === 0`) или API недоступен.
 */
export function loadDuration(
  entry: PerformanceNavigationTiming | undefined,
): number | null {
  if (!entry || entry.loadEventEnd <= 0) return null;
  return Math.round(entry.loadEventEnd - entry.startTime);
}

/** Байты → мегабайты, с одним знаком после запятой. */
export function toMegabytes(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}
