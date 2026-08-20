import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Резюме',
  description:
    'Полное резюме Максима Жихарева: опыт, проекты, технологии, образование.',
  alternates: { canonical: '/resume' },
  openGraph: {
    title: 'Резюме',
    description:
      'Полное резюме Максима Жихарева: опыт, проекты, технологии, образование.',
    url: '/resume',
  },
};

export default function Page() {
  return <Shell initialApp="resume" />;
}
