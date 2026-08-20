import type { Metadata } from 'next';

import { Shell } from '@/components/shell';
import { SETTINGS_SECTION_IDS } from '@/lib/settings/registry';

export const metadata: Metadata = {
  title: 'Настройки',
  description:
    'Внешний вид и поведение рабочего стола: тема, акцент, движение, доступность.',
  robots: { index: false, follow: true },
};

/** Разделы известны заранее, страницы пререндерятся статически. */
export function generateStaticParams() {
  return SETTINGS_SECTION_IDS.map((section) => ({ section }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return <Shell initialApp="settings" initialSection={section} />;
}
