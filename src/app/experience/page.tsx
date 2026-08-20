import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Опыт',
  description: 'Карьерный путь: Cleverbots, Huntio, Giftbox, Flexy.',
  alternates: { canonical: '/experience' },
  openGraph: {
    title: 'Опыт',
    description: 'Карьерный путь: Cleverbots, Huntio, Giftbox, Flexy.',
    url: '/experience',
  },
};

export default function Page() {
  return <Shell initialApp="experience" />;
}
