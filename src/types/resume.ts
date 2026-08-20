/** Типы контентного слоя. UI читает только их: текста резюме в JSX нет. */

export type Period = {
  /** ISO-подобный `YYYY-MM`. */
  from: string;
  /** `null` — по настоящее время. */
  to: string | null;
};

export type ContactKind = 'telegram' | 'github' | 'email';

type Contact = {
  kind: ContactKind;
  /** `mailto:` у почты, `https://` у остальных. */
  /** Как показываем: `@sog3d`. */
  label: string;
  href: string;
  /** Одна строка: зачем сюда писать. */
  hint: string;
  /** Основной канал связи выделяется в UI. */
  primary: boolean;
};

export type Profile = {
  name: string;
  /** Короткая подпись под именем на рабочем столе. Одна строка из резюме. */
  tagline: string;
  /** Фамилия Имя Отчество: для резюме и JSON-LD. */
  fullName: string;
  role: string;
  location: string;
  age: number;
  /** 2–4 предложения. Без маркетинга. */
  summary: string[];
  contacts: Contact[];
};

export type SkillGroup = {
  id: string;
  label: string;
  items: string[];
};

export type Position = {
  id: string;
  company: string;
  role: string;
  period: Period;
  /** Зона ответственности одним абзацем. Пусто, если всё сказано проектами. */
  summary: string | null;
  /** Ссылки на `Project.slug`: связь Experience ↔ Projects. */
  projectSlugs: string[];
};

export type ProjectLink = {
  label: string;
  href: string;
};

export type ProjectVisual = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type ProjectKind = 'commercial' | 'personal';

export type Project = {
  slug: string;
  name: string;
  /** `Position.id`, к которому относится проект. */
  positionId: string;
  kind: ProjectKind;
  /** Одна строка: что это за продукт. */
  tagline: string;
  stack: string[];
  /** Задача, которую решал продукт или конкретно я. `null` — в резюме не зафиксировано. */
  problem: string | null;
  /** Как решали. `null` — в резюме не зафиксировано. */
  solution: string | null;
  /** Что делал лично. Формулировки из резюме. */
  contribution: string[];
  /** Инженерные решения, которые стоит показать отдельно. */
  engineering: string[];
  links: ProjectLink[];
  /** Пусто, пока нет утверждённых визуалов: UI не рисует галерею. */
  visuals: ProjectVisual[];
  /** Коммерческий проект под NDA: без публичных ссылок и реальных скриншотов. */
  confidential: boolean;
};

export type Education = {
  institution: string;
  program: string;
  level: string;
  year: number;
};

export type Language = {
  name: string;
  level: string;
};

export type Resume = {
  profile: Profile;
  skills: SkillGroup[];
  experience: Position[];
  projects: Project[];
  education: Education[];
  languages: Language[];
};
