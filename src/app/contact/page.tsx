import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Контакты',
  description: 'Telegram и GitHub — связаться напрямую.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Контакты',
    description: 'Telegram и GitHub — связаться напрямую.',
    url: '/contact',
  },
};

export default function Page() {
  return <Shell initialApp="contact" />;
}
