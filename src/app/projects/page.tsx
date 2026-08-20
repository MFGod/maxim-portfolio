import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Проекты',
  description: 'Коммерческие и собственные проекты: стек, задачи и вклад в каждый.',
  alternates: { canonical: '/projects' },
  openGraph: {
    title: 'Проекты',
    description: 'Коммерческие и собственные проекты: стек, задачи и вклад в каждый.',
    url: '/projects',
  },
};

export default function Page() {
  return <Shell initialApp="projects" />;
}
