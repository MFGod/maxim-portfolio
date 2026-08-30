'use client';

import { useTranslate } from '@/lib/i18n';
import { pageContent, type PageBlock, type PageSide } from '@/lib/world/book/content';
import { spreads } from '@/lib/world/book/plan';

/** Книга словами — для тех, кто её не видит. */
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

/** Страница разметкой. */
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
            <a href={link.href} rel="noopener noreferrer" target="_blank">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    );
  }

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
