'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';

import { useTranslate } from '@/lib/i18n';
import { settingsStore } from '@/lib/settings/store';
import { useWorldSupport } from '@/lib/world/use-world-support';

import { BookContents } from './book-contents';
import { ChapterList, WorldPlan } from './world-plan';

/**
 * Сцена только на клиенте: three и геометрия не должны попадать в бандл тому,
 * кто эту страницу не открыл.
 */
const WorldCanvas = dynamic(
  () => import('./world-canvas').then((module) => module.WorldCanvas),
  { ssr: false },
);

/**
 * Мир на весь экран — отдельная страница, а не окно рабочего стола.
 *
 * В окне 654×480 мир читался как виджет. На всю страницу он читается как место,
 * и это единственная постановка, в которой имеют смысл планы камер, облёт и всё
 * остальное, что запланировано дальше.
 *
 * Машина не тянет сцену — страница остаётся, но показывает плоский план из тех
 * же координат. Уйти отсюда можно всегда: ссылка назад ведёт на рабочий стол.
 */
export function WorldScreen() {
  /*
   * Настройки поднимаются здесь же.
   *
   * Мир — отдельная страница, а не окно рабочего стола: сюда приходят по прямой
   * ссылке, минуя загрузку системы, а хранилище до этой правки поднимали только
   * `use-boot-sequence` и оконный менеджер. Без этого вызова страница жила на
   * значениях по умолчанию — язык всегда русский, «покой» всегда выключен, — и
   * выбор посетителя до мира не доходил.
   *
   * В эффекте, а не в теле: первый клиентский рендер обязан совпасть с
   * серверным, иначе гидратация разойдётся.
   */
  useEffect(() => {
    settingsStore.hydrate();
  }, []);

  const t = useTranslate();
  const support = useWorldSupport();
  const ready = support === 'ready';

  return (
    <main className="bg-surface-1 relative min-h-dvh w-full p-2">
      {ready ? (
        /*
          Мир в рамке с отступом, а не встык к краям экрана: скругление у
          самого угла вьюпорта читается браком вёрстки, а не решением.
        */
        <div className="rounded-window border-line-subtle absolute inset-2 overflow-hidden border">
          {/* Выход живёт в меню мира: отдельная плашка в углу спорила с ним и
              с книгой, а уйти отсюда можно и той, и другой дорогой. */}
          <WorldCanvas fill interactive homeHref="/" />
        </div>
      ) : (
        <div className="mx-auto max-w-3xl px-5 py-10">
          <h1 className="text-ink font-display text-2xl tracking-tight">
            {t('world.screen.title')}
          </h1>
          <p className="text-ink-muted mt-1 text-sm">{t('world.screen.subtitle')}</p>

          <div className="mt-6">
            <WorldPlan support={support} />
          </div>
        </div>
      )}

      {/* Список глав и текст книги нужны и при сцене: она недоступна с
          клавиатуры, а весь текст резюме там живёт в текстурах страниц. */}
      {ready ? (
        <div className="sr-only">
          <h1>{t('world.screen.title')}</h1>
          <ChapterList />
          <BookContents />
        </div>
      ) : null}

    </main>
  );
}
