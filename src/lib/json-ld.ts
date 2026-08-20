import { education, experience, profile, skills } from '@/data/resume';

import { siteUrl } from './site';

/** Группы навыков для `knowsAbout`. Принципы и трекеры в выдаче — шум. */
const KNOWS_ABOUT_GROUPS = ['languages', 'frontend', 'data', 'platforms', 'ai'];

/** Убирает пометку в скобках: «Node.js (изучаю)» → «Node.js». */
const stripNote = (item: string) => item.replace(/\s*\(.*\)$/, '');

/** Текущее место работы: незакрытый период, кроме собственных проектов. */
function currentEmployer() {
  return (
    experience.find(
      (position) => position.period.to === null && position.id !== 'personal',
    ) ?? null
  );
}

/** JSON-LD разметка `Person` для поисковиков. */
export function personJsonLd() {
  const employer = currentEmployer();
  const email = profile.contacts.find((contact) => contact.kind === 'email');
  const [school] = education;

  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.fullName,
    alternateName: profile.name,
    jobTitle: profile.role,
    description: profile.summary[0],
    url: siteUrl,
    address: { '@type': 'PostalAddress', addressLocality: profile.location },
    sameAs: profile.contacts
      .filter((contact) => contact.href.startsWith('https://'))
      .map((contact) => contact.href),
    ...(email ? { email: email.href } : {}),
    ...(employer
      ? { worksFor: { '@type': 'Organization', name: employer.company } }
      : {}),
    ...(school
      ? {
          alumniOf: {
            '@type': 'EducationalOrganization',
            name: school.institution,
          },
        }
      : {}),
    knowsAbout: skills
      .filter((group) => KNOWS_ABOUT_GROUPS.includes(group.id))
      .flatMap((group) => group.items.map(stripNote)),
  };
}
