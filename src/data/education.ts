import type { Education, Language } from '@/types/resume';
import { deepFreeze } from '@/lib/freeze';

export const education: Education[] = deepFreeze([
  {
    institution: 'Петрозаводский кооперативный техникум',
    program: 'Информационные системы и программирование',
    level: 'Среднее специальное',
    year: 2022,
  },
]);

export const languages: Language[] = deepFreeze([
  { name: 'Русский', level: 'Родной' },
  { name: 'Английский', level: 'B2' },
]);
