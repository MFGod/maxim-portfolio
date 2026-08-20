'use client';

import { SettingRow } from '@/components/applications/settings/controls';
import { LinkOut } from '@/components/ui/primitives';
import { externalLinks } from '@/data/applications';
import { systemInfo } from '@/data/system';

import { useSection, type SectionProps } from './shared';

export function AboutSection({
  highlightId,
  onReset,
}: SectionProps & { onReset: () => void }) {
  const { t } = useSection();

  return (
    <div className="space-y-5">
      <div className="border-line-subtle bg-surface-1/50 rounded-lg border px-4 py-5 text-center">
        <p className="text-ink text-lg font-semibold tracking-tight">
          {systemInfo.name}
        </p>
        <p className="text-accent mt-0.5 text-sm">{systemInfo.tagline}</p>
        <p className="text-ink-faint mt-2 font-mono text-xs">
          {t('about.version')} {systemInfo.version}
        </p>
      </div>

      <div>
        <h3 className="text-2xs text-ink-faint mb-2 font-mono tracking-[0.18em] uppercase">
          {t('about.builtWith')}
        </h3>
        <ul className="border-line-subtle divide-line-subtle divide-y rounded-lg border">
          {systemInfo.stack.map((item) => (
            <li
              key={item.name}
              className="flex items-baseline justify-between gap-4 px-3.5 py-2"
            >
              <span className="text-ink text-sm">{item.name}</span>
              <span className="text-ink-faint font-mono text-xs tabular-nums">
                {item.version}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-2xs text-ink-faint mb-2 font-mono tracking-[0.18em] uppercase">
          {t('about.links')}
        </h3>
        <ul className="flex flex-wrap gap-4">
          {externalLinks.map((link) => (
            <li key={link.id}>
              <LinkOut href={link.href}>{link.title}</LinkOut>
            </li>
          ))}
        </ul>
        <p className="text-ink-faint mt-2 text-xs">{t('about.sourceNote')}</p>
      </div>

      <SettingRow
        id="reset"
        highlighted={highlightId === 'reset'}
        label={t('reset.label')}
        description={t('reset.description')}
        control={
          <button
            type="button"
            onClick={onReset}
            className="border-line text-ink-muted hover:border-danger hover:text-ink rounded-md border px-3 py-1.5 text-xs transition-colors duration-(--duration-fast)"
          >
            {t('reset.action')}
          </button>
        }
      />
    </div>
  );
}
