'use client';

import { useTranslate } from '@/lib/i18n';
import { pageContent, type PageBlock, type PageSide } from '@/lib/world/book/content';
import { spreads } from '@/lib/world/book/plan';

/**
 * Книга словами — для тех, кто её не видит.
 *
 * Страница книги живёт в текстуре: скринридер не читает пиксели, клавиатура не
 * доводит луч до строки, а поиск по странице не находит в мире ни одного слова
 * резюме. Поэтому весь текст книги лежит ещё и здесь, в скрытой разметке.
 *
 * Содержимое берётся из того же `pageContent`, что рисует холст (D8). Копии
 * текста тут нет ни строки — иначе разметка и страница разошлись бы молча.
 *
 * Разворотами, а не сплошным потоком: порядок здесь тот же, что при листании, и
 * услышанное совпадает с увиденным.
 */
export function BookContents() {
  const t = useTranslate();
  const layout = spreads();
  const sides: PageSide[] = ['left', 'right'];

  return (
    <section aria-label={t('world.book.contents')}>
      {layout.map((spread, index) => (
        <article key={`${spread.kind}:${index}`}>
          {sides.map((side) => (
            <Page key={side} blocks={pageContent({ spread, side }, t)} />
          ))}
        </article>
      ))}
    </section>
  );
}

/**
 * Страница разметкой.
 *
 * Роли переводятся в теги, а не в классы: разметка эта звучит, а не выглядит, и
 * заголовок здесь нужен затем, чтобы по книге можно было ходить по заголовкам.
 */
function Page({ blocks }: { blocks: readonly PageBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </>
  );
}

function Block({ block }: { block: PageBlock }) {
  if (block.kind === 'list') {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  if (block.kind === 'links') {
    return (
      <ul>
        {block.items.map((link) => (
          <li key={link.href}>
            {/* Те же адреса, что и на странице: ссылка в разметке — не дубль
                контакта, а единственный способ пройти по ней с клавиатуры. */}
            <a href={link.href} rel="noopener noreferrer" target="_blank">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    );
  }

  // Титул страницы — третий уровень, что бы на ней ни стояло: имя на
  // авантитуле, название книги на титуле, компания в начале главы. Проект и
  // подсказка — четвёртый: они внутри главы, а не рядом с ней.
  if (
    block.role === 'name' ||
    block.role === 'coverTitle' ||
    block.role === 'chapterTitle'
  ) {
    return <h3>{block.text}</h3>;
  }

  if (block.role === 'sectionTitle') {
    return <h4>{block.text}</h4>;
  }

  return <p>{block.text}</p>;
}
