import type { Position } from '@/types/resume';
import { deepFreeze } from '@/lib/freeze';

export const experience: Position[] = deepFreeze([
  {
    id: 'cleverbots',
    company: 'Cleverbots',
    role: 'React Frontend Developer',
    period: { from: '2025-04', to: null },
    summary: null,
    projectSlugs: [
      'ai-agents-marketplace',
      'pharma-twa',
      'tobacco-loyalty',
      'corporate-site',
      'ai-product-manager',
      'ecommerce-mini-app',
      'receipt-promo',
      'prize-randomizer',
    ],
  },
  {
    id: 'huntio',
    company: 'Huntio',
    role: 'Frontend Developer',
    period: { from: '2024-05', to: '2025-04' },
    summary:
      'Отвечал за развитие ATS-платформы для найма: от архитектуры SPA до интеграций с внешними job-сайтами.',
    projectSlugs: ['ats-platform'],
  },
  {
    id: 'giftbox',
    company: 'Giftbox',
    role: 'React Frontend Developer',
    period: { from: '2023-02', to: '2024-04' },
    summary:
      'Сервис подбора подарков в экосистеме VK: 14 000 уникальных пользователей в месяц. Команда: 2 frontend, 1 backend, 1 product, 1 QA, 1 design; KANBAN.',
    projectSlugs: ['vk-gifts'],
  },
  {
    id: 'flexy',
    company: 'Flexy',
    role: 'React Frontend Developer',
    period: { from: '2022-01', to: '2023-01' },
    summary:
      'Цифровой архив индустриального наследия города: запущен, собрано более 700 уникальных медиафайлов. Команда: 3 frontend, 1 backend, 1 ui/ux, 1 product, 1 QA; SCRUM.',
    projectSlugs: ['industrial-archive'],
  },
  {
    id: 'personal',
    company: 'Собственные проекты',
    role: 'AI-инструменты и агенты',
    period: { from: '2025-01', to: null },
    summary:
      'Инструменты для мультиагентной разработки: конфигурации, стандарты и обвязка вокруг Claude Code и Cursor.',
    projectSlugs: ['agents-config'],
  },
]);
