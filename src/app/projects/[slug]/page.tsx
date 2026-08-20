import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Shell } from '@/components/shell';
import { getProject, projects } from '@/data/resume';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return { title: 'Проект не найден' };

  const description = `${project.tagline} Стек: ${project.stack.join(', ')}.`;

  return {
    title: project.name,
    description,
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: {
      title: project.name,
      description,
      url: `/projects/${project.slug}`,
    },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  if (!getProject(slug)) notFound();

  return <Shell initialApp="project" initialPayload={{ slug }} />;
}
