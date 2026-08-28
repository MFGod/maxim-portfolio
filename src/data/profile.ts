import type { Profile } from '@/types/resume';
import { deepFreeze } from '@/lib/freeze';

export const profile: Profile = deepFreeze({
  name: 'Максим Жихарев',
  fullName: 'Жихарев Максим Сергеевич',
  role: 'React Frontend Developer (Middle+)',
  tagline:
    'React и TypeScript, 4+ года коммерческой разработки. SPA, админ-панели, Telegram и VK Mini Apps, MAX, PWA.',
  location: 'Щелково',
  age: 26,
  summary: [
    'Frontend-разработчик с 4+ годами коммерческого опыта на React и TypeScript. SPA, административные панели, Telegram Web Apps, VK Mini Apps, PWA, MAX: проектирую архитектуру, интегрирую внешние API, оптимизирую производительность.',
    'Внедряю AI в разработку: пишу собственные Claude Code Skills, MCP-серверы и мультиагентные конфигурации. Изучаю backend, двигаюсь в сторону fullstack.',
  ],
  contacts: [
    {
      kind: 'telegram',
      label: '@sog3d',
      href: 'https://t.me/sog3d',
      hint: 'Основной канал. Отвечаю в течение дня.',
      primary: true,
    },
    {
      kind: 'email',
      label: 'maxim.zicharev666@gmail.com',
      href: 'mailto:maxim.zicharev666@gmail.com',
      hint: 'Для писем, офферов и тестовых заданий.',
      primary: false,
    },
    {
      kind: 'github',
      label: 'MFGod',
      href: 'https://github.com/MFGod',
      hint: 'Открытый код и AI-инструменты.',
      primary: false,
    },
  ],
});
