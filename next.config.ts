import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Иконки импортируются поимённо — вытягиваем только используемые модули.
    optimizePackageImports: ['lucide-react', 'motion'],
  },
};

export default nextConfig;
