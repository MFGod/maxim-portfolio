import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Иконки импортируются поимённо — вытягиваем только используемые модули.
    optimizePackageImports: ['lucide-react', 'motion'],
  },
  /**
   * Ассеты мира кэшируются навсегда.
   *
   * Их двадцать мегабайт, и без этого заголовка браузер перепроверяет каждый
   * файл на каждом заходе: две сотни запросов ради ответов «не менялось».
   * `immutable` уместен именно здесь — содержимое `public/world` меняется
   * только вместе с именем файла, когда карту перепекают.
   *
   * Заголовок работает, пока файлы отдаёт само приложение. Если мир уехал на
   * внешний хостинг через `NEXT_PUBLIC_WORLD_ASSETS_URL`, кэшированием
   * распоряжается тот хостинг, и правило просто ни на что не попадает.
   */
  async headers() {
    return [
      {
        source: '/world/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
