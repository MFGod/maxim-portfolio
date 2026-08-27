'use client';

import { useTranslate } from '@/lib/i18n';
import { skillsUpTo } from '@/lib/world/skill-trail';

/**
 * Что накоплено к пройденной главе.
 *
 * Панель слева, а не в книге: книгу открывают, чтобы читать, — а это счёт
 * пути, и он должен быть виден, пока идёшь. Пока не пройдена ни одна глава,
 * панели нет вовсе: пустая рамка с заголовком обещает содержимое, которого
 * ещё не заслужили.
 *
 * Список растёт вниз в порядке первой встречи — хронологией карьеры. Пришедшее
 * с последней главой выделено: без этого прибавка шага теряется среди прежних
 * двух десятков строк.
 */
export function WorldSkills({ passed }: { passed: string | null }) {
  const t = useTranslate();
  const gains = skillsUpTo(passed);

  if (gains.length === 0) return null;

  return (
    <aside
      aria-label={t('world.skills.label')}
      className="border-book-rule bg-glass-book absolute top-5 left-5 max-h-[60vh] w-44 overflow-y-auto rounded-sm border p-2 shadow-sm backdrop-blur-sm"
    >
      <p className="text-2xs text-book-ink-muted px-1 pb-1 font-mono">
        {t('world.skills.label')}
      </p>

      <ul className="flex flex-wrap gap-1">
        {gains.map((gain) => (
          <li
            key={gain.name}
            className={
              gain.fresh
                ? 'border-book-accent text-book-ink text-2xs rounded-xs border px-1.5 py-0.5'
                : 'border-book-rule text-book-ink-muted text-2xs rounded-xs border px-1.5 py-0.5'
            }
          >
            {gain.name}
          </li>
        ))}
      </ul>
    </aside>
  );
}
