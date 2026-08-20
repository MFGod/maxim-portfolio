import type { Period } from '@/types/resume';

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function formatPoint(value: string): string {
  const [year, month] = value.split('-');
  const monthIndex = Number(month) - 1;
  const monthName = MONTHS[monthIndex];
  return monthName ? `${monthName} ${year}` : String(year);
}

/** Период целиком: «январь 2024 — настоящее время». */
export function formatPeriod(period: Period): string {
  return `${formatPoint(period.from)} — ${period.to ? formatPoint(period.to) : 'настоящее время'}`;
}

/** Короткая форма для таймлайна: `2025 — сейчас`. */
export function formatYears(period: Period): string {
  const from = period.from.slice(0, 4);
  const to = period.to ? period.to.slice(0, 4) : 'сейчас';
  return from === to ? from : `${from} — ${to}`;
}

/** Длительность в месяцах. Для незакрытого периода считается от `now`. */
export function durationInMonths(period: Period, now = new Date()): number {
  const [fromYear, fromMonth] = period.from.split('-').map(Number);
  const end = period.to
    ? period.to.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const [toYear, toMonth] = end;
  if (!fromYear || !fromMonth || !toYear || !toMonth) return 0;
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/** Месяцы → «2 года 3 месяца». */
export function formatDuration(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${plural(years, ['год', 'года', 'лет'])}`);
  if (rest > 0) parts.push(`${rest} ${plural(rest, ['месяц', 'месяца', 'месяцев'])}`);
  return parts.join(' ') || 'меньше месяца';
}

/** Русское склонение по числу: 1 год, 2 года, 5 лет. */
function plural(count: number, forms: [string, string, string]): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/** Возраст со склонением: «26 лет». */
export function formatAge(age: number): string {
  return `${age} ${plural(age, ['год', 'года', 'лет'])}`;
}

/** Счётчик со склонением: «12 программ», «1 программа». */
export function formatCount(count: number, forms: [string, string, string]): string {
  return `${count} ${plural(count, forms)}`;
}

/** Две цифры с ведущим нулём: часы, минуты, день, месяц. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Отметка времени файла: «20.08.2026 21:12». Локальное время браузера и
 * фиксированный порядок частей — колонка списка должна быть одинаковой ширины
 * и сравнимой на глаз, а не зависеть от настроек системы.
 */
export function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '—';
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  return `${day}.${month}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
