import { describe, expect, it } from 'vitest';

import { groupEntries, type GroupEntry } from '@/lib/files/grouping';

/** Полдень 20 августа 2026: от него считается «сегодня» и остальные пороги. */
const now = new Date(2026, 7, 20, 12, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

const entry = (extra: Partial<GroupEntry> & Pick<GroupEntry, 'key'>): GroupEntry => ({
  name: extra.key,
  kind: 'text',
  modifiedAt: now,
  ...extra,
});

const titles = (groups: ReturnType<typeof groupEntries>) =>
  groups.map((group) => group.title);
const keys = (groups: ReturnType<typeof groupEntries>) =>
  groups.map((group) => group.keys);

describe('без группировки', () => {
  it('отдаёт одну группу без заголовка и в исходном порядке', () => {
    const groups = groupEntries(
      [entry({ key: 'b' }), entry({ key: 'a' })],
      'none',
      now,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe('');
    expect(groups[0]?.keys).toEqual(['b', 'a']);
  });

  it('пустой список остаётся пустой группой, а не исчезает', () => {
    expect(groupEntries([], 'none', now)).toEqual([{ id: 'all', title: '', keys: [] }]);
  });
});

describe('по типу', () => {
  it('ставит папки первыми, программы последними', () => {
    const groups = groupEntries(
      [
        entry({ key: 'app', kind: 'app', modifiedAt: null }),
        entry({ key: 'doc', kind: 'text' }),
        entry({ key: 'dir', kind: 'folder' }),
      ],
      'kind',
      now,
    );

    expect(titles(groups)).toEqual(['Папки', 'Документы', 'Программы']);
    expect(keys(groups)).toEqual([['dir'], ['doc'], ['app']]);
  });

  it('пустые группы не показываются', () => {
    const groups = groupEntries([entry({ key: 'doc' })], 'kind', now);
    expect(titles(groups)).toEqual(['Документы']);
  });
});

describe('по имени', () => {
  it('собирает по первой букве, цифры и знаки — в конце', () => {
    const groups = groupEntries(
      [
        entry({ key: '1', name: 'Яблоко' }),
        entry({ key: '2', name: '_черновик' }),
        entry({ key: '3', name: 'аврора' }),
        entry({ key: '4', name: '2024 отчёт' }),
        entry({ key: '5', name: 'Автобус' }),
      ],
      'name',
      now,
    );

    expect(titles(groups)).toEqual(['А', 'Я', '0–9', '#']);
    expect(groups[0]?.keys).toEqual(['3', '5']);
  });

  it('пустое имя не создаёт группу без заголовка', () => {
    const groups = groupEntries([entry({ key: 'x', name: '   ' })], 'name', now);
    expect(titles(groups)).toEqual(['#']);
  });
});

describe('по дате', () => {
  it('раскладывает по возрасту от свежего к старому', () => {
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const groups = groupEntries(
      [
        entry({ key: 'today', modifiedAt: now }),
        entry({ key: 'week', modifiedAt: startOfToday - 3 * DAY }),
        entry({ key: 'month', modifiedAt: startOfToday - 20 * DAY }),
        entry({ key: 'older', modifiedAt: startOfToday - 200 * DAY }),
        entry({ key: 'app', kind: 'app', modifiedAt: null }),
      ],
      'modified',
      now,
    );

    expect(titles(groups)).toEqual([
      'Сегодня',
      'На этой неделе',
      'В этом месяце',
      'Раньше',
      'Без даты',
    ]);
    expect(keys(groups)).toEqual([['today'], ['week'], ['month'], ['older'], ['app']]);
  });

  it('вчерашний вечер попадает в «на этой неделе», а не в «сегодня»', () => {
    const yesterdayEvening = new Date(2026, 7, 19, 23, 30).getTime();
    const groups = groupEntries(
      [entry({ key: 'x', modifiedAt: yesterdayEvening })],
      'modified',
      now,
    );

    expect(titles(groups)).toEqual(['На этой неделе']);
  });
});
