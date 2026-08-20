import { describe, expect, it } from 'vitest';

import { experience, profile } from '@/data/resume';
import { personJsonLd } from '@/lib/json-ld';

describe('Person JSON-LD', () => {
  const payload = personJsonLd();

  it('sameAs содержит только профили — почта туда не попадает', () => {
    for (const href of payload.sameAs) {
      expect(href).toMatch(/^https:\/\//);
    }
    expect(payload.sameAs).not.toContain(
      profile.contacts.find((contact) => contact.kind === 'email')?.href,
    );
  });

  it('работодатель — текущее место, а не собственные проекты', () => {
    const open = experience.filter(
      (position) => position.period.to === null && position.id !== 'personal',
    );
    expect(payload.worksFor?.name).toBe(open[0]?.company);
    expect(payload.worksFor?.name).not.toBe('Собственные проекты');
  });

  it('в области знаний нет пометок в скобках', () => {
    for (const topic of payload.knowsAbout) {
      expect(topic, topic).not.toMatch(/[()]/);
    }
    expect(payload.knowsAbout.length).toBeGreaterThan(0);
  });
});
