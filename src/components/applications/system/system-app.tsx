'use client';

import { usePathname } from 'next/navigation';

import { SystemMark } from '@/components/desktop/system-mark';
import { AppBody, DataRow, Section } from '@/components/ui/primitives';
import { programIds } from '@/data/applications';
import { systemInfo } from '@/data/system';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRuntimeEnvironment } from '@/hooks/use-runtime-environment';
import { resolveTheme, useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';

/** Что показать вместо значения, которое браузер не отдаёт. */
const UNAVAILABLE = 'Недоступно';

const DEVICE_LABELS = {
  phone: 'Смартфон',
  tablet: 'Планшет',
  desktop: 'Десктоп',
} as const;

/**
 * Из чего собран рабочий стол. Текст описывает реальные модули проекта: при
 * переносе логики править вместе с кодом.
 */
const architecture = [
  {
    title: 'Window Manager',
    body: 'Открытие, фокус, z-порядок, свёртывание и геометрия всех окон живут в одном редьюсере. Перетаскивание пишет результат туда же, одним коммитом в конце жеста.',
  },
  {
    title: 'Application Registry',
    body: 'Иконка, маршрут, размеры окна и место в доке описаны для каждого приложения один раз. Док, поиск и рабочий стол читают этот список.',
  },
  {
    title: 'Контентный слой',
    body: 'Резюме, проекты, опыт и стек лежат в src/data и типизированы в src/types/resume.ts. Текста резюме в разметке нет, всё приходит из данных.',
  },
  {
    title: 'Настройки',
    body: 'Хранятся в localStorage со своей версией схемы, а применяются атрибутами на html. Внешний вид описан в CSS, поэтому смена темы обходится без перерисовки React-дерева.',
  },
];

export function SystemApp() {
  const { state } = useWindowManager();
  const environment = useRuntimeEnvironment();
  const pathname = usePathname();
  const themePreference = useSetting((settings) => settings.appearance.theme);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = resolveTheme(themePreference, prefersDark);

  const openWindows = state.order.length;
  const appCount = programIds.length;

  return (
    <AppBody>
      <div className="flex items-center gap-3.5">
        <SystemMark className="size-11 rounded-xl text-base" />
        <div className="min-w-0">
          <h2 className="text-ink font-display text-xl tracking-tight">
            {systemInfo.name}
          </h2>
          <p className="text-ink-muted text-sm">
            {systemInfo.tagline} · версия {systemInfo.version}
          </p>
        </div>
      </div>

      <Section title="Стек" className="mt-7">
        <dl className="space-y-2.5">
          {systemInfo.stack.map((item) => (
            <DataRow key={item.name} label={item.name}>
              <span className="font-mono">{item.version}</span>
            </DataRow>
          ))}
        </dl>
      </Section>

      <Section title="Архитектура">
        <dl className="space-y-4">
          {architecture.map((item) => (
            <div key={item.title}>
              <dt className="text-ink text-sm font-medium">{item.title}</dt>
              <dd className="text-ink-muted mt-1 text-sm">{item.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Среда выполнения">
        <dl className="space-y-2.5">
          <DataRow label="Браузер">
            <span className="font-mono">{environment.browser ?? UNAVAILABLE}</span>
          </DataRow>
          <DataRow label="Устройство">
            {environment.device ? DEVICE_LABELS[environment.device] : UNAVAILABLE}
          </DataRow>
          <DataRow label="Вьюпорт">
            <span className="font-mono tabular-nums">
              {environment.viewport
                ? `${environment.viewport.width} × ${environment.viewport.height}`
                : UNAVAILABLE}
            </span>
          </DataRow>
          <DataRow label="Тема">{theme === 'dark' ? 'Тёмная' : 'Светлая'}</DataRow>
          <DataRow label="Программы">
            <span className="tabular-nums">
              {appCount}, открыто окон: {openWindows}
            </span>
          </DataRow>
          <DataRow label="Маршрут">
            <span className="font-mono">{pathname}</span>
          </DataRow>
        </dl>
      </Section>
    </AppBody>
  );
}
