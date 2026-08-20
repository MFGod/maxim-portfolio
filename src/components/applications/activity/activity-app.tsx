'use client';

import { labelOf } from '@/components/applications/app-registry';
import { AppBody, Section } from '@/components/ui/primitives';
import { programIds } from '@/data/applications';
import { useLiveMetrics } from '@/hooks/use-live-metrics';
import { useRuntimeEnvironment } from '@/hooks/use-runtime-environment';
import { useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';

const UNAVAILABLE = 'Недоступно';

const DEVICE_LABELS = {
  phone: 'Смартфон',
  tablet: 'Планшет',
  desktop: 'Десктоп',
} as const;

const STATUS_LABELS = {
  normal: 'открыто',
  minimized: 'свёрнуто',
  maximized: 'развёрнуто',
} as const;

export function ActivityApp() {
  const { state, focus } = useWindowManager();
  const locale = useSetting((settings) => settings.language);
  const environment = useRuntimeEnvironment();
  const metrics = useLiveMetrics();

  const windows = state.order.map((id) => state.windows[id]!).reverse();
  const appCount = programIds.length;

  return (
    <AppBody>
      <h2 className="text-ink font-display text-2xl tracking-tight">Мониторинг</h2>
      <p className="text-ink-muted mt-1 text-sm">
        Состояние среды и открытых окон. Показатели, которых браузер не отдаёт, помечены
        «Недоступно».
      </p>

      <Section title="Показатели" className="mt-7">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Metric label="Программы" value={String(appCount)} />
          <Metric label="Открыто окон" value={String(windows.length)} />
          <Metric
            label="FPS"
            value={metrics.fps === null ? UNAVAILABLE : String(metrics.fps)}
          />
          <Metric
            label="Вьюпорт"
            value={
              environment.viewport
                ? `${environment.viewport.width} × ${environment.viewport.height}`
                : UNAVAILABLE
            }
          />
          <Metric
            label="Устройство"
            value={environment.device ? DEVICE_LABELS[environment.device] : UNAVAILABLE}
          />
          <Metric
            label="Сеть"
            value={
              environment.online === null
                ? UNAVAILABLE
                : environment.online
                  ? 'В сети'
                  : 'Офлайн'
            }
          />
          <Metric
            label="Загрузка"
            value={metrics.loadMs === null ? UNAVAILABLE : `${metrics.loadMs} мс`}
          />
          <Metric
            label="Память JS"
            value={
              metrics.memory
                ? `${metrics.memory.used} / ${metrics.memory.limit} МБ`
                : UNAVAILABLE
            }
          />
          <Metric label="Браузер" value={environment.browser ?? UNAVAILABLE} />
        </dl>
      </Section>

      <Section title="Процессы">
        {windows.length === 0 ? (
          <p className="text-ink-faint text-sm">
            Ни одного окна не открыто. Запусти программу из дока или с рабочего стола.
          </p>
        ) : (
          <ul className="divide-line-subtle border-line-subtle divide-y rounded-lg border">
            {windows.map((instance) => (
              <li key={instance.id}>
                <button
                  type="button"
                  onClick={() => focus(instance.id)}
                  className="group hover:bg-surface-2 kbd-focus:bg-surface-2 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-(--duration-fast)"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-ink group-hover:text-accent block truncate text-sm font-medium">
                      {labelOf(instance, locale).title}
                    </span>
                    <span className="text-ink-faint mt-0.5 block truncate font-mono text-xs">
                      {instance.payload?.slug ?? instance.app}
                    </span>
                  </span>
                  <span className="text-2xs text-ink-faint shrink-0 font-mono tabular-nums">
                    {Math.round(instance.rect.width)} ×{' '}
                    {Math.round(instance.rect.height)}
                  </span>
                  <span className="text-2xs text-ink-muted w-20 shrink-0 text-right">
                    {STATUS_LABELS[instance.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AppBody>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line-subtle bg-surface-1/60 rounded-lg border px-3 py-2.5">
      <dt className="text-2xs text-ink-faint font-mono tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-ink mt-1 truncate text-sm tabular-nums">{value}</dd>
    </div>
  );
}
