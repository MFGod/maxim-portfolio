import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'motion'],
  },
  /** Ассеты мира кэшируются навсегда: их 20 МБ, и меняются они вместе с именем. */
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
