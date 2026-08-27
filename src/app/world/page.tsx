import type { Metadata } from 'next';

import { WorldScreen } from '@/components/world/world-screen';

export const metadata: Metadata = {
  title: 'Карта карьеры',
  description:
    'Карьерный путь как маршрут по миру: места работы точками, проекты рядом с ними, непройденная вершина впереди.',
  alternates: { canonical: '/world' },
  openGraph: {
    title: 'Карта карьеры',
    description: 'Карьерный путь как маршрут по миру.',
    url: '/world',
  },
};

export default function Page() {
  return <WorldScreen />;
}
