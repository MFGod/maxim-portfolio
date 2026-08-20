import type { SkillGroup } from '@/types/resume';
import { deepFreeze } from '@/lib/freeze';

export const skills: SkillGroup[] = deepFreeze([
  {
    id: 'languages',
    label: 'Языки',
    items: ['TypeScript', 'JavaScript'],
  },
  {
    id: 'frontend',
    label: 'Frontend',
    items: ['React 18', 'Next.js', 'Vue 3', 'Vite', 'Webpack 5'],
  },
  {
    id: 'concepts',
    label: 'Концепции и методологии',
    items: ['ООП', 'Функциональное программирование', 'SOLID', 'DRY', 'KISS'],
  },
  {
    id: 'data',
    label: 'Интеграции и данные',
    items: [
      'REST API',
      'WebSocket',
      'RTK Query',
      'React Query',
      'MobX',
      'Pinia',
      'Zod',
    ],
  },
  {
    id: 'ui',
    label: 'Вёрстка и UI',
    items: [
      'HTML',
      'CSS',
      'Tailwind',
      'SCSS',
      'Radix UI',
      'MUI',
      'Ant Design',
      'VKUI',
      'Formik/Yup',
      'Framer Motion',
      'next-intl',
    ],
  },
  {
    id: 'platforms',
    label: 'Платформы',
    items: ['Telegram Mini Apps', 'VK Mini Apps', 'MAX', 'PWA'],
  },
  {
    id: 'backend',
    label: 'Backend и данные',
    items: ['Node.js (изучаю)', 'Payload CMS', 'PostgreSQL', 'SQL'],
  },
  {
    id: 'testing',
    label: 'Тестирование',
    items: ['Jest', 'React Testing Library', 'Playwright/Cypress', 'Storybook'],
  },
  {
    id: 'infra',
    label: 'Инфраструктура и качество',
    items: ['Docker', 'CI/CD', 'Nx', 'ESLint/Prettier', 'Sentry'],
  },
  {
    id: 'tools',
    label: 'Инструменты',
    items: [
      'Figma',
      'Swagger/OpenAPI',
      'Яндекс.Метрика',
      'Yandex Object Storage',
      'Jira',
      'Яндекс.Трекер',
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    items: ['Claude Code', 'Cursor', 'Codex', 'MCP'],
  },
]);
