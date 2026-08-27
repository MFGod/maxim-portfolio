'use client';

import { Check, Copy, Download } from 'lucide-react';
import { useEffect, useState } from 'react';

import { contactIcon, contactLinkTarget } from '@/components/ui/contact-links';
import { AppBody } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { resumePdfPath } from '@/lib/site';
import { profile } from '@/data/profile';

export function ContactApp() {
  return (
    <AppBody>
      <h2 className="text-ink font-display text-2xl tracking-tight">Связаться</h2>
      <p className="text-ink-muted mt-1 text-sm">
        Быстрее всего — в Telegram. Открыт к обсуждению ролей на стыке frontend и AI.
      </p>

      <ul className="mt-6 space-y-3">
        {profile.contacts.map((contact) => {
          const Icon = contactIcon[contact.kind];
          return (
            <li
              key={contact.kind}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-3.5 transition-colors duration-(--duration-fast)',
                contact.primary
                  ? 'border-accent-dim/60 bg-accent-wash'
                  : 'border-line-subtle bg-surface-2',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-md border',
                  contact.primary
                    ? 'border-accent-dim/60 text-accent'
                    : 'border-line-subtle text-ink-muted',
                )}
              >
                <Icon className="size-4" />
              </span>

              <span className="min-w-0 flex-1">
                <a
                  href={contact.href}
                  {...contactLinkTarget(contact.kind)}
                  className="text-ink hover:text-accent font-mono text-sm"
                >
                  {contact.label}
                </a>
                <span className="text-ink-faint mt-0.5 block text-xs">
                  {contact.hint}
                </span>
              </span>

              <CopyButton
                value={contact.label}
                label={`Скопировать ${contact.label}`}
              />
            </li>
          );
        })}
      </ul>

      <a
        href={resumePdfPath}
        download
        className="border-line-subtle bg-surface-2 hover:border-line hover:bg-surface-3 mt-3 flex items-center gap-3 rounded-lg border p-3.5 transition-colors duration-(--duration-fast)"
      >
        <span
          aria-hidden
          className="border-line-subtle text-ink-muted grid size-9 shrink-0 place-items-center rounded-md border"
        >
          <Download className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-sm">Резюме в PDF</span>
          <span className="text-ink-faint mt-0.5 block text-xs">
            Для пересылки и загрузки в ATS.
          </span>
        </span>
      </a>

      <p className="border-line-subtle text-ink-faint mt-6 border-t pt-4 text-xs">
        {profile.name} · {profile.role} · {profile.location}
      </p>
    </AppBody>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="border-line-subtle text-ink-faint hover:border-line hover:text-ink grid size-8 shrink-0 place-items-center rounded-md border transition-colors duration-(--duration-fast)"
    >
      {copied ? (
        <Check className="text-accent size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
  );
}
