import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

const description =
  'Три небольшие игры внутри портфолио: «Три в ряд», «Башня» и «Память», с общей таблицей результатов.';

export const metadata: Metadata = {
  title: 'Аркада',
  description,
  alternates: { canonical: '/arcade' },
  openGraph: { title: 'Аркада', description, url: '/arcade' },
};

export default function Page() {
  return <Shell initialApp="arcade" />;
}
