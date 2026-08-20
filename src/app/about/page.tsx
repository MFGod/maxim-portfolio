import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Обо мне',
  description: 'Специализация, инженерный подход и интересующие задачи.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'Обо мне',
    description: 'Специализация, инженерный подход и интересующие задачи.',
    url: '/about',
  },
};

export default function Page() {
  return <Shell initialApp="about" />;
}
