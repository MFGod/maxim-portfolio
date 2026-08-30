import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

/**
 * Рабочий стол. Второй экран портфолио: вход — карта на корне, отсюда
 * открываются все окна, и сюда же возвращает выход из мира.
 */
export const metadata: Metadata = {
  title: 'Рабочий стол',
  description:
    'Резюме, проекты, опыт и стек — окнами рабочего стола. Выход из карты карьеры ведёт сюда.',
  alternates: { canonical: '/desktop' },
  openGraph: {
    title: 'Рабочий стол',
    description: 'Резюме, проекты, опыт и стек — окнами рабочего стола.',
    url: '/desktop',
  },
};

export default function Page() {
  return <Shell />;
}
