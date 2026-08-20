import type { Resume } from '@/types/resume';
import { deepFreeze } from '@/lib/freeze';

import { education, languages } from './education';
import { experience } from './experience';
import { profile } from './profile';
import { projects } from './projects';
import { skills } from './skills';

export const resume: Resume = deepFreeze({
  profile,
  skills,
  experience,
  projects,
  education,
  languages,
});

export function getProject(slug: string) {
  return resume.projects.find((project) => project.slug === slug) ?? null;
}

export { about } from './about';
export { education, experience, languages, profile, projects, skills };
