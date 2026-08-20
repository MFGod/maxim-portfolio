import type { MetadataRoute } from 'next';

import { applications } from '@/data/applications';
import { projects } from '@/data/resume';
import { siteUrl } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const appRoutes = Object.values(applications)
    .filter((app) => app.id !== 'settings')
    .map((app) => app.route)
    .filter((route): route is string => route !== null);

  return [
    { url: siteUrl, lastModified, priority: 1 },
    ...appRoutes.map((route) => ({
      url: `${siteUrl}${route}`,
      lastModified,
      priority: route === '/resume' ? 0.9 : 0.7,
    })),
    ...projects.map((project) => ({
      url: `${siteUrl}/projects/${project.slug}`,
      lastModified,
      priority: 0.5,
    })),
  ];
}
