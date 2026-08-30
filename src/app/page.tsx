import type { Metadata } from 'next';

import { WorldEntry } from '@/components/world/world-entry';

/** Корень сайта — карта карьеры, а не рабочий стол. */
export const metadata: Metadata = {
  title: 'Карта карьеры',
  description:
    'Карьерный путь как маршрут по миру: места работы точками, проекты рядом с ними, непройденная вершина впереди.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Карта карьеры',
    description: 'Карьерный путь как маршрут по миру.',
    url: '/',
  },
};

export default function Page() {
  return <WorldEntry />;
}
