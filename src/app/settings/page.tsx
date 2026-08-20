import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Настройки',
  description:
    'Внешний вид и поведение рабочего стола: тема, акцент, движение, доступность.',
  alternates: { canonical: '/settings' },
  robots: { index: false, follow: true },
};

export default function Page() {
  return <Shell initialApp="settings" />;
}
