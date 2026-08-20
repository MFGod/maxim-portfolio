/**
 * Группировка содержимого папки. Чистые функции над фактами об объектах:
 * компоненты передают сюда плоский список и получают порядок групп, а сами
 * ничего не знают ни о календаре, ни о правилах сортировки.
 */

import type { FileGroup } from '@/lib/settings/types';

/** Что нужно знать об объекте, чтобы разложить его по группам. */
export type GroupEntry = {
  key: string;
  name: string;
  /** Ярлык программы, папка или текстовый файл. */
  kind: 'app' | 'folder' | 'text';
  /** Когда объект меняли. У ярлыка программы времени нет. */
  modifiedAt: number | null;
};

export type KeyGroup = { id: string; title: string; keys: string[] };

const DAY = 24 * 60 * 60 * 1000;

/** Порядок групп по типу: сначала папки, потом документы, программы в конце. */
const KIND_ORDER = ['folder', 'text', 'app'] as const;

const KIND_TITLES: Record<GroupEntry['kind'], string> = {
  folder: 'Папки',
  text: 'Документы',
  app: 'Программы',
};

/** Порядок групп по дате: от свежего к старому, «без даты» — в конце. */
const AGE_ORDER = ['today', 'week', 'month', 'older', 'never'] as const;
type Age = (typeof AGE_ORDER)[number];

const AGE_TITLES: Record<Age, string> = {
  today: 'Сегодня',
  week: 'На этой неделе',
  month: 'В этом месяце',
  older: 'Раньше',
  never: 'Без даты',
};

/**
 * Возраст объекта. Отсчёт от начала сегодняшнего дня, а не от «минус сутки»:
 * файл, созданный вчера вечером, должен попасть во «вчера», даже если с тех
 * пор прошло меньше двадцати четырёх часов.
 */
function ageOf(modifiedAt: number | null, now: number): Age {
  if (modifiedAt === null) return 'never';

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const start = startOfToday.getTime();

  if (modifiedAt >= start) return 'today';
  if (modifiedAt >= start - 7 * DAY) return 'week';
  if (modifiedAt >= start - 30 * DAY) return 'month';
  return 'older';
}

/**
 * Первая буква имени. Цифры собираются в одну группу, всё остальное — в «#»:
 * иначе на каждый знак препинания заводилась бы своя.
 */
function initialOf(name: string): string {
  const first = name.trim().charAt(0);
  if (!first) return '#';
  if (/\d/.test(first)) return '0–9';
  const upper = first.toLocaleUpperCase('ru');
  return /\p{L}/u.test(first) ? upper : '#';
}

/** Собирает группы в заданном порядке, пустые пропускает. */
function collect<T extends string>(
  entries: GroupEntry[],
  order: readonly T[],
  bucketOf: (entry: GroupEntry) => T,
  titleOf: (bucket: T) => string,
): KeyGroup[] {
  const buckets = new Map<T, string[]>();
  for (const entry of entries) {
    const bucket = bucketOf(entry);
    const keys = buckets.get(bucket);
    if (keys) keys.push(entry.key);
    else buckets.set(bucket, [entry.key]);
  }

  return order
    .filter((bucket) => buckets.has(bucket))
    .map((bucket) => ({
      id: bucket,
      title: titleOf(bucket),
      keys: buckets.get(bucket) ?? [],
    }));
}

/**
 * Раскладывает объекты по группам. Порядок внутри группы сохраняется — его уже
 * задал вызывающий (папки перед файлами, дальше по имени). Режим `none` даёт
 * одну группу без заголовка: у вызывающего один код на все случаи.
 */
export function groupEntries(
  entries: GroupEntry[],
  mode: FileGroup,
  now: number = Date.now(),
): KeyGroup[] {
  if (mode === 'none') {
    return [{ id: 'all', title: '', keys: entries.map((entry) => entry.key) }];
  }

  if (mode === 'kind') {
    return collect(
      entries,
      KIND_ORDER,
      (entry) => entry.kind,
      (bucket) => KIND_TITLES[bucket],
    );
  }

  if (mode === 'modified') {
    return collect(
      entries,
      AGE_ORDER,
      (entry) => ageOf(entry.modifiedAt, now),
      (bucket) => AGE_TITLES[bucket],
    );
  }

  // По имени: набор букв заранее не известен, поэтому порядок групп считается
  // по факту — по-русски, с цифрами и прочими знаками в конце.
  const initials = [...new Set(entries.map((entry) => initialOf(entry.name)))].sort(
    (a, b) => {
      const rank = (value: string) => (value === '#' ? 2 : value === '0–9' ? 1 : 0);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return a.localeCompare(b, 'ru');
    },
  );

  return collect(
    entries,
    initials,
    (entry) => initialOf(entry.name),
    (bucket) => bucket,
  );
}
