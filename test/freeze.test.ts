import { describe, expect, it } from 'vitest';

import { applications, dockGroups } from '@/data/applications';
import { techEdges, techNodes } from '@/data/tech-graph';
import { ru } from '@/lib/i18n/ru';
import { deepFreeze } from '@/lib/freeze';
import { DEFAULT_SETTINGS } from '@/lib/settings/defaults';
import { emptyState } from '@/lib/window-manager/reducer';

describe('deepFreeze', () => {
  it('замораживает вложенные объекты и массивы', () => {
    const value = deepFreeze({ nested: { flag: true }, list: [{ id: 'a' }] });

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(Object.isFrozen(value.list)).toBe(true);
    expect(Object.isFrozen(value.list[0])).toBe(true);
  });

  it('не трогает функции: рядом с данными лежат компоненты и иконки', () => {
    const icon = () => null;
    deepFreeze({ icon });

    expect(Object.isFrozen(icon)).toBe(false);
  });

  it('переживает ссылку на самого себя', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    expect(() => deepFreeze(cyclic)).not.toThrow();
    expect(Object.isFrozen(cyclic)).toBe(true);
  });
});

describe('разделяемые константы заморожены', () => {
  it('настройки по умолчанию — их держит у себя хранилище на всю сессию', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.appearance)).toBe(true);
  });

  it('пустое состояние окон — его список утекает в новые состояния через spread', () => {
    expect(Object.isFrozen(emptyState)).toBe(true);
    expect(Object.isFrozen(emptyState.order)).toBe(true);
    expect(Object.isFrozen(emptyState.windows)).toBe(true);
  });

  it('конфигурация графа — её читает симуляция, но копирует себе позиции', () => {
    expect(Object.isFrozen(techNodes)).toBe(true);
    expect(Object.isFrozen(techNodes[0])).toBe(true);
    expect(Object.isFrozen(techEdges)).toBe(true);
  });

  it('реестр приложений и группы дока — их читают док, стол, поиск и маршруты', () => {
    expect(Object.isFrozen(applications)).toBe(true);
    expect(Object.isFrozen(applications.resume)).toBe(true);
    expect(Object.isFrozen(dockGroups)).toBe(true);
  });

  it('словарь переводов', () => {
    expect(Object.isFrozen(ru)).toBe(true);
  });

  it('иконка приложения осталась незамороженной функцией', () => {
    expect(Object.isFrozen(applications.resume.icon)).toBe(false);
  });
});
