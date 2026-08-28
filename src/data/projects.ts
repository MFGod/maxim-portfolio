import type { Project } from '@/types/resume';
import { deepFreeze } from '@/lib/freeze';

/**
 * Поля `problem` и `solution` заполнены там, где формулировка есть в резюме.
 * `null` означает «не зафиксировано»: UI такие блоки не рисует. `visuals`
 * пустой до появления утверждённых изображений.
 */
export const projects: Project[] = deepFreeze([
  {
    slug: 'ai-agents-marketplace',
    name: 'Маркетплейс ИИ-агентов',
    positionId: 'cleverbots',
    kind: 'commercial',
    tagline: 'Витрина и каталог ИИ-агентов с собственной CMS-админкой.',
    stack: ['Next.js', 'TypeScript', 'Tailwind', 'Radix UI'],
    problem:
      'Каталог агентов нужно наполнять и менять без участия разработчика, а витрина при этом должна индексироваться поисковиками.',
    solution:
      'Next.js на App Router с собственной CMS-админкой: контент правит редактор, страницы отдаются готовыми, с sitemap и JSON-LD.',
    contribution: [
      'Спроектировал архитектуру приложения.',
      'Разработал маршрутизацию на App Router.',
      'Разработал CMS-админку.',
      'Сделал адаптивную вёрстку.',
    ],
    engineering: ['SEO-слой: sitemap и разметка JSON-LD.', 'GDPR cookie consent.'],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'pharma-twa',
    name: 'TWA фармацевтической компании',
    positionId: 'cleverbots',
    kind: 'commercial',
    tagline:
      'Telegram Web App и PWA для врачей: медкалькуляторы и клинические рекомендации.',
    stack: ['React', 'JavaScript', 'SCSS', 'Ant Design', 'Django REST API'],
    problem:
      'Один продукт нужно было доставлять врачам сразу в трёх средах (Telegram, PWA и обычный браузер) при нескольких независимых модулях внутри.',
    solution:
      'Архитектура одного репозитория под несколько модулей и платформ, с общим ядром и платформенными различиями на границе.',
    contribution: [
      'Спроектировал архитектуру репозитория под несколько модулей и платформ.',
      'Разработал личный кабинет и экспорт в PDF.',
      'Разработал PWA-слой: manifest и service worker.',
      'Реализовал JWT-аутентификацию.',
      'Интегрировал Django REST API.',
      'Провёл рефакторинг кодовой базы.',
    ],
    engineering: [],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'tobacco-loyalty',
    name: 'Программа лояльности табачного бренда (IQOS)',
    positionId: 'cleverbots',
    kind: 'commercial',
    tagline:
      'Кроссплатформенное приложение с бонусной программой и геймификацией: VK Mini Apps и Telegram.',
    stack: ['React 18', 'TypeScript', 'Webpack 5', 'MobX', 'VKUI'],
    problem:
      'Программа лояльности живёт сразу в VK Mini Apps и Telegram, а геймификацию нужно развивать отдельно от основного приложения.',
    solution:
      'Игровой модуль вынесен в отдельный репозиторий и встраивается в оба хоста как самостоятельная единица; общая часть приложения остаётся одна.',
    contribution: [
      'Развивал приложение на двух платформах: VK Mini Apps и TWA.',
      'Участвовал в разработке игры «три в ряд»: отдельный репозиторий, который встроили в приложение.',
      'Обновил конфигурацию Sentry.',
      'С нуля внедрил систему аналитики на Яндекс.Метрике.',
    ],
    engineering: [
      'Игровой модуль вынесен в отдельный репозиторий и встроен в хост через iframe с обменом событиями по postMessage.',
    ],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'corporate-site',
    name: 'Корпоративный сайт компании',
    positionId: 'cleverbots',
    kind: 'commercial',
    tagline: 'Публичный сайт с многоязычностью и админкой на Payload CMS.',
    stack: ['Next.js', 'TypeScript', 'Payload CMS', 'PostgreSQL', 'S3'],
    problem:
      'Публичный сайт на двух языках, контент которого редактирует не разработчик.',
    solution:
      'Payload CMS с PostgreSQL и S3 в роли админки, next-intl для локализации: frontend читает контент, а не хранит его.',
    contribution: [
      'Разработал админку на Payload CMS с PostgreSQL и S3.',
      'Внедрил i18n на next-intl.',
      'Сделал тёмную и светлую тему.',
      'Добавил анимации на Framer Motion и валидацию на Zod.',
    ],
    engineering: [
      'Выстроил AI-assisted пайплайн разработки backend.',
      'Предложил 5 дизайн-концепций с использованием AI-инструментов и Figma.',
    ],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'ai-product-manager',
    name: 'AI Product Manager',
    positionId: 'cleverbots',
    kind: 'commercial',
    tagline: 'Сервис декомпозиции требований в user stories на базе LLM-пайплайна.',
    stack: ['FastAPI', 'React', 'Vite', 'Celery', 'Redis', 'PostgreSQL', 'S3'],
    problem:
      'Требования приходят документами, а команде нужны разобранные user stories в трекере.',
    solution:
      'LLM-пайплайн decomposition → story_gen → refine → quality_gate поверх парсинга документов, с синхронизацией результата в трекеры.',
    contribution: [
      'Собрал LLM-пайплайн: decomposition → story_gen → refine → quality_gate.',
      'Реализовал парсинг документов.',
      'Сделал синхронизацию с GitLab, Linear и Яндекс.Трекером.',
      'Вынес долгие задачи в Celery с Redis в роли брокера и хранилища результатов.',
    ],
    engineering: [
      'Долгие LLM-операции выведены из запроса в очередь, поэтому интерфейс не держит соединение на время генерации.',
    ],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'ecommerce-mini-app',
    name: 'E-commerce mini-app',
    positionId: 'cleverbots',
    kind: 'commercial',
    tagline: 'Мини-приложение заказа товаров для Telegram, MAX и браузера.',
    stack: ['Vue 3', 'TypeScript', 'Vite', 'Pinia', 'Yandex Maps JS API', 'Sentry'],
    problem:
      'Одно приложение должно работать в Telegram, MAX и обычном браузере, где API окружения различаются.',
    solution:
      'Платформенный слой с адаптерами: продуктовый код не знает, в какой среде он запущен.',
    contribution: [
      'Разработал мини-приложение заказа товаров.',
      'Адаптировал его под Telegram, MAX и браузер через платформенный слой с адаптерами.',
      'Реализовал состояние на Pinia.',
      'Интегрировал Yandex Maps JS API для адресов доставки.',
      'С нуля внедрил систему мониторинга ошибок на Sentry.',
    ],
    engineering: [],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'receipt-promo',
    name: 'Чековое промо бренда',
    positionId: 'cleverbots',
    kind: 'commercial',
    tagline: 'Веб-приложение промо-акции с загрузкой чеков и админкой модерации.',
    stack: ['JavaScript', 'jQuery', 'SCSS', 'jsQR', 'Web Crypto'],
    problem:
      'Участник акции загружает фотографию чека, и одно и то же изображение не должно попадать в модерацию дважды.',
    solution:
      'QR распознаётся прямо в браузере, фото хешируется на клиенте, дальше материал уходит в админку модерации.',
    contribution: [
      'Разработал веб-приложение промо-акции с загрузкой чеков.',
      'Разработал админку модерации.',
    ],
    engineering: [
      'Распознавание QR с фотографии чека на клиенте: jsQR поверх canvas.',
      'Хеширование загруженного фото через Web Crypto.',
    ],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'prize-randomizer',
    name: 'Рандомайзер призов',
    positionId: 'cleverbots',
    kind: 'commercial',
    tagline: 'SPA розыгрыша призов для промо-акции.',
    stack: ['Vue 3', 'TypeScript', 'Vite', 'Pinia'],
    problem: null,
    solution: null,
    contribution: ['Разработал SPA розыгрыша призов для промо-акции.'],
    engineering: [],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'ats-platform',
    name: 'ATS-платформа для найма',
    positionId: 'huntio',
    kind: 'commercial',
    tagline:
      'SPA для работы рекрутеров: вакансии, кандидаты, аналитика и публикация на job-сайтах.',
    stack: [
      'React',
      'TypeScript',
      'Vite',
      'RTK Query',
      'Formik/Yup',
      'MUI',
      'Jest',
      'Cypress',
    ],
    problem:
      'Рекрутеры с разными ролями работают в одном интерфейсе, а вакансии нужно публиковать сразу на несколько внешних job-сайтов.',
    solution:
      'Единый API-контур на RTK Query с централизованной обработкой ошибок и сессий; доступ к разделам решается на уровне маршрутизации, а не внутри экранов.',
    contribution: [
      'Спроектировал и разработал SPA на React, TypeScript и Vite.',
      'Построил единый API-контур на RTK Query с централизованной обработкой ошибок и сессий.',
      'Реализовал permission-based маршрутизацию.',
      'Разработал сложные формы на Formik и Yup.',
      'Сделал infinite loading для списочных сценариев, аналитические и табличные модули с экспортом.',
      'Собрал механизм контроля версий клиента с уведомлением об обновлении.',
      'Стандартизировал UI на MUI.',
      'Покрыл критичные модули тестами: Jest, React Testing Library, Cypress.',
      'Настроил ESLint и Prettier в CI.',
      'В связке с backend-разработчиком реализовал интеграции с 4+ job-сайтами: HeadHunter, Avito, LinkedIn, HabrCareer и другие. Подключение аккаунтов и публикация вакансий.',
    ],
    engineering: [
      'Доступ к разделам определяется правами пользователя на уровне маршрутизации, а не условиями внутри экранов.',
      'Обработка ошибок и истёкших сессий живёт в API-контуре, а не в каждом экране.',
    ],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'vk-gifts',
    name: 'Сервис подбора подарков',
    positionId: 'giftbox',
    kind: 'commercial',
    tagline: 'Вишлисты и бронирование подарков в экосистеме VK.',
    stack: ['React', 'TypeScript', 'Next.js', 'React Query', 'VK API'],
    problem:
      'Подарок выбирают вслепую: дарители не знают, что человеку нужно, и дарят одно и то же.',
    solution:
      'Вишлист с бронированием: позиция добавляется ссылкой с маркетплейса, бронь закрывает её от остальных дарителей.',
    contribution: [
      'Реализовал вишлист и бронирование подарков.',
      'Сделал парсинг ссылок с маркетплейсов.',
      'Подключил push-уведомления.',
      'Провёл рефакторинг легаси-кода на React Hooks.',
      'Настроил мониторинг на Яндекс.Метрике.',
    ],
    engineering: [],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'industrial-archive',
    name: 'Цифровой архив индустриального наследия',
    positionId: 'flexy',
    kind: 'commercial',
    tagline: 'Публичный сайт архива города и админка с CRUD для материалов и фото.',
    stack: ['Next.js', 'React', 'TypeScript', 'Nx', 'Storybook', 'Styled Components'],
    problem:
      'Два интерфейса одного продукта, публичный сайт архива и админка редакции, не должны разъезжаться визуально.',
    solution:
      'NX-монорепозиторий с общим UI Kit и документацией в Storybook: обе части собираются из одних компонентов.',
    contribution: [
      'Разработал публичный сайт и админку с CRUD для материалов и фото.',
      'Собрал собственный UI Kit с документацией в Storybook.',
      'Сделал адаптивные формы.',
    ],
    engineering: ['Сайт и админка живут в NX-монорепозитории и делят общий UI Kit.'],
    links: [],
    visuals: [],
    confidential: true,
  },
  {
    slug: 'agents-config',
    name: 'agents-config',
    positionId: 'personal',
    kind: 'personal',
    tagline:
      'Открытая конфигурация мультиагентного workflow под Claude Code и Cursor, MIT.',
    stack: ['Claude Code', 'Cursor', 'MCP', 'JavaScript', 'Shell'],
    problem:
      'Конфигурации агентов у Claude Code и Cursor устроены по-разному, и один рабочий процесс приходится поддерживать дважды.',
    solution:
      'Одна конфигурация под обе платформы: общие стандарты с auto-attach по стеку, методология gstack, hooks жизненного цикла и преднастроенные MCP-серверы.',
    contribution: [
      'Спроектировал и развиваю открытую конфигурацию мультиагентного workflow под Claude Code и Cursor, одинаковую на обеих платформах.',
      'Собрал стандарты кодирования с auto-attach по стеку: React, Vue, FastAPI, Django.',
      'Описал методологию разработки gstack: Think → Plan → Build → Review → Test.',
      'Реализовал hooks жизненного цикла: safety-guard на PreToolUse и UX-ревью на PostToolUse.',
      'Подключил субагентов на дешёвых моделях для поиска кода, ревью, тестов и точечных правок.',
      'Преднастроил MCP-серверы: context7, playwright, headroom.',
      'Сделал интерактивный install.sh с выбором платформы, стека и внешних инструментов.',
      'Веду документацию и CHANGELOG проекта.',
    ],
    engineering: [
      'safety-guard на PreToolUse блокирует DROP TABLE/DATABASE и force-push в защищённые ветки; PostToolUse запускает UX-ревью при правках .tsx/.vue/.css.',
      'Сжатие вывода модели, входного контекста и результатов Bash-команд.',
      'Защита цепочки поставок: sha256-pinning каждого файла сторонних skills, fail-closed CI, статический аудит на prompt injection по таксономии garak.',
      'Правило «внешний контент считается данными, а не инструкциями» для всего, что приходит из сети и от MCP-серверов.',
      'Установщик не перезаписывает существующие файлы.',
    ],
    links: [{ label: 'GitHub', href: 'https://github.com/MFGod/agents-config' }],
    visuals: [],
    confidential: false,
  },
]);
