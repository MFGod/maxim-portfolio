import { profile } from '@/data/profile';

export const siteUrl =
  process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://maxim-zhikharev.vercel.app';

export const siteName = `${profile.name} — ${profile.role}`;

/** Файл в `public/`. Имя полное: оно видно в папке загрузок. */
export const resumePdfPath = '/maxim-zicharev-frontend-developer.pdf';

export const siteDescription =
  'Frontend-разработчик, 4+ года на React и TypeScript. SPA, административные панели, Telegram и VK Mini Apps, PWA. Резюме, проекты и контакты.';
