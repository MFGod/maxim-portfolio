import { deepFreeze } from '@/lib/freeze';

/**
 * Конфигурация графа стека: узлы, связи и категории. Визуализация читает эти
 * данные и ничего о них не знает — технологию добавляют здесь, а не в графе.
 */

export const TECH_CATEGORIES = deepFreeze([
  'language',
  'framework',
  'ui',
  'data',
  'platform',
  'testing',
  'infra',
  'tooling',
] as const);

export type TechCategory = (typeof TECH_CATEGORIES)[number];

export type TechNode = {
  id: string;
  label: string;
  category?: TechCategory;
};

export type TechEdge = {
  source: string;
  target: string;
};

export const techCategoryLabels: Record<TechCategory, string> = deepFreeze({
  language: 'Языки',
  framework: 'Фреймворки',
  ui: 'Интерфейс',
  data: 'Данные',
  platform: 'Платформы',
  testing: 'Тестирование',
  infra: 'Инфраструктура',
  tooling: 'Инструменты',
});

export const techNodes: TechNode[] = deepFreeze([
  { id: 'javascript', label: 'JavaScript', category: 'language' },
  { id: 'typescript', label: 'TypeScript', category: 'language' },
  { id: 'html', label: 'HTML', category: 'language' },
  { id: 'css', label: 'CSS', category: 'language' },
  { id: 'sql', label: 'SQL', category: 'language' },

  { id: 'react', label: 'React', category: 'framework' },
  { id: 'nextjs', label: 'Next.js', category: 'framework' },
  { id: 'vue', label: 'Vue 3', category: 'framework' },
  { id: 'nodejs', label: 'Node.js', category: 'framework' },

  { id: 'tailwind', label: 'Tailwind CSS', category: 'ui' },
  { id: 'scss', label: 'SCSS', category: 'ui' },
  { id: 'radix', label: 'Radix UI', category: 'ui' },
  { id: 'mui', label: 'MUI', category: 'ui' },
  { id: 'antd', label: 'Ant Design', category: 'ui' },
  { id: 'vkui', label: 'VKUI', category: 'ui' },
  { id: 'framer-motion', label: 'Framer Motion', category: 'ui' },

  { id: 'rest', label: 'REST API', category: 'data' },
  { id: 'websocket', label: 'WebSocket', category: 'data' },
  { id: 'rtk-query', label: 'RTK Query', category: 'data' },
  { id: 'react-query', label: 'React Query', category: 'data' },
  { id: 'mobx', label: 'MobX', category: 'data' },
  { id: 'pinia', label: 'Pinia', category: 'data' },
  { id: 'zod', label: 'Zod', category: 'data' },
  { id: 'postgresql', label: 'PostgreSQL', category: 'data' },
  { id: 'payload', label: 'Payload CMS', category: 'data' },

  { id: 'telegram-mini-apps', label: 'Telegram Mini Apps', category: 'platform' },
  { id: 'vk-mini-apps', label: 'VK Mini Apps', category: 'platform' },
  { id: 'pwa', label: 'PWA', category: 'platform' },

  { id: 'jest', label: 'Jest', category: 'testing' },
  { id: 'rtl', label: 'Testing Library', category: 'testing' },
  { id: 'playwright', label: 'Playwright', category: 'testing' },
  { id: 'storybook', label: 'Storybook', category: 'testing' },

  { id: 'docker', label: 'Docker', category: 'infra' },
  { id: 'ci-cd', label: 'CI/CD', category: 'infra' },
  { id: 'git', label: 'Git', category: 'infra' },
  { id: 'vite', label: 'Vite', category: 'infra' },
  { id: 'webpack', label: 'Webpack', category: 'infra' },
  { id: 'nx', label: 'Nx', category: 'infra' },

  { id: 'figma', label: 'Figma', category: 'tooling' },
  { id: 'swagger', label: 'Swagger/OpenAPI', category: 'tooling' },
  { id: 'sentry', label: 'Sentry', category: 'tooling' },
  { id: 'eslint', label: 'ESLint/Prettier', category: 'tooling' },
  { id: 'claude-code', label: 'Claude Code', category: 'tooling' },
  { id: 'mcp', label: 'MCP', category: 'tooling' },
]);

export const techEdges: TechEdge[] = deepFreeze([
  { source: 'html', target: 'css' },
  { source: 'html', target: 'javascript' },
  { source: 'css', target: 'scss' },
  { source: 'css', target: 'tailwind' },
  { source: 'javascript', target: 'typescript' },
  { source: 'javascript', target: 'nodejs' },
  { source: 'javascript', target: 'webpack' },

  { source: 'typescript', target: 'react' },
  { source: 'typescript', target: 'vue' },
  { source: 'typescript', target: 'nodejs' },
  { source: 'typescript', target: 'zod' },
  { source: 'typescript', target: 'eslint' },

  { source: 'react', target: 'nextjs' },
  { source: 'react', target: 'radix' },
  { source: 'react', target: 'mui' },
  { source: 'react', target: 'antd' },
  { source: 'react', target: 'vkui' },
  { source: 'react', target: 'framer-motion' },
  { source: 'react', target: 'react-query' },
  { source: 'react', target: 'rtk-query' },
  { source: 'react', target: 'mobx' },
  { source: 'react', target: 'jest' },
  { source: 'react', target: 'rtl' },
  { source: 'react', target: 'storybook' },
  { source: 'react', target: 'vite' },
  { source: 'react', target: 'websocket' },
  { source: 'react', target: 'sentry' },

  { source: 'nextjs', target: 'nodejs' },
  { source: 'nextjs', target: 'tailwind' },
  { source: 'nextjs', target: 'pwa' },
  { source: 'nextjs', target: 'rest' },

  { source: 'vue', target: 'pinia' },
  { source: 'vue', target: 'vite' },
  { source: 'vue', target: 'scss' },

  { source: 'nodejs', target: 'rest' },
  { source: 'nodejs', target: 'postgresql' },
  { source: 'nodejs', target: 'payload' },
  { source: 'nodejs', target: 'docker' },
  { source: 'nodejs', target: 'websocket' },
  { source: 'nodejs', target: 'mcp' },

  { source: 'payload', target: 'postgresql' },
  { source: 'postgresql', target: 'sql' },

  { source: 'rest', target: 'swagger' },
  { source: 'rest', target: 'react-query' },
  { source: 'rest', target: 'rtk-query' },
  { source: 'rest', target: 'zod' },

  { source: 'telegram-mini-apps', target: 'react' },
  { source: 'telegram-mini-apps', target: 'pwa' },
  { source: 'vk-mini-apps', target: 'vkui' },
  { source: 'vk-mini-apps', target: 'react' },

  { source: 'jest', target: 'rtl' },
  { source: 'jest', target: 'ci-cd' },
  { source: 'playwright', target: 'ci-cd' },
  { source: 'storybook', target: 'figma' },

  { source: 'docker', target: 'ci-cd' },
  { source: 'git', target: 'ci-cd' },
  { source: 'eslint', target: 'ci-cd' },
  { source: 'nx', target: 'webpack' },
  { source: 'nx', target: 'react' },
  { source: 'sentry', target: 'nextjs' },
  { source: 'figma', target: 'react' },

  { source: 'claude-code', target: 'mcp' },
  { source: 'claude-code', target: 'git' },
]);

export const techNodeById = new Map(techNodes.map((node) => [node.id, node]));
