import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Стек',
  description:
    'Технологии по категориям: языки, frontend, интеграции, UI, платформы, тестирование, инфраструктура, AI.',
  alternates: { canonical: '/skills' },
  openGraph: {
    title: 'Стек',
    description: 'Технологии, с которыми работал на коммерческих проектах.',
    url: '/skills',
  },
};

export default function Page() {
  return <Shell initialApp="skills" />;
}
