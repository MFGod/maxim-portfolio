import { Analytics } from '@vercel/analytics/next';
import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter, JetBrains_Mono } from 'next/font/google';

import { profile } from '@/data/profile';
import { personJsonLd } from '@/lib/json-ld';
import { settingsBootScript } from '@/lib/settings';
import { siteDescription, siteName, siteUrl } from '@/lib/site';

import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

const displaySerif = Cormorant_Garamond({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-display-serif',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono-stack',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s — ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  authors: [{ name: profile.fullName }],
  creator: profile.fullName,
  keywords: [
    'Максим Жихарев',
    'Frontend Developer',
    'React',
    'TypeScript',
    'Next.js',
    'Telegram Mini Apps',
    'VK Mini Apps',
    'резюме',
    'портфолио',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'profile',
    locale: 'ru_RU',
    url: siteUrl,
    siteName,
    title: siteName,
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: siteDescription,
  },
  robots: { index: true, follow: true },
};

/** `themeColor` стартовый: скрипт настроек подменяет его под выбранную тему. */
export const viewport: Viewport = {
  themeColor: '#0a0806',
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Оба `dangerouslySetInnerHTML` получают строки из локальных модулей, внешнего
 * ввода в них нет. Скрипт настроек выполняется до первой отрисовки, иначе
 * выбранная тема моргает; атрибуты темы на `<html>` он же и выставляет, поэтому
 * в серверной разметке их нет.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${displaySerif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: settingsBootScript() }} />
      </head>
      <body className="antialiased">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd()) }}
        />
        <Analytics />
      </body>
    </html>
  );
}
