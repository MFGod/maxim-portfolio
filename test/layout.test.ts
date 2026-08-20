import { describe, expect, it } from 'vitest';

import { needsFallbackLauncher } from '@/lib/layout';

describe('needsFallbackLauncher', () => {
  it('пустой рабочий стол получает кнопку запуска', () => {
    expect(
      needsFallbackLauncher({ showDock: false, showIcons: false, showMenuBar: false }),
    ).toBe(true);
  });

  it('любой оставшийся вход делает кнопку лишней', () => {
    expect(
      needsFallbackLauncher({ showDock: true, showIcons: false, showMenuBar: false }),
    ).toBe(false);
    expect(
      needsFallbackLauncher({ showDock: false, showIcons: true, showMenuBar: false }),
    ).toBe(false);
    expect(
      needsFallbackLauncher({ showDock: false, showIcons: false, showMenuBar: true }),
    ).toBe(false);
  });
});
