import { describe, expect, it } from 'vitest';

import { profile, projects } from '@/data/resume';
import { translator } from '@/lib/i18n';
import { pageContent, type PageBlock, type PageSide } from '@/lib/world/book/content';
import { spreads } from '@/lib/world/book/plan';

const SIDES: PageSide[] = ['left', 'right'];

const ru = translator('ru');
const en = translator('en');

/** Все страницы книги по порядку листания. */
function pages(t: ReturnType<typeof translator>) {
  return spreads().flatMap((spread) =>
    SIDES.map((side) => ({
      spread,
      side,
      blocks: pageContent({ spread, side }, t),
    })),
  );
}

/** Слепок структуры страницы: что за блоки и в какой роли, без текста. */
function shape(blocks: readonly PageBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'text') return `text:${block.role}`;
      if (block.kind === 'list') return `list:${block.role}:${block.items.length}`;
      return `links:${block.items.length}`;
    })
    .join('|');
}

describe('содержимое страниц книги', () => {
  it('ни одна страница не выходит пустой', () => {
    for (const page of pages(ru)) {
      expect(shape(page.blocks), `${page.spread.kind}/${page.side}`).not.toBe('');
    }
  });

  it('текст резюме от языка не зависит', () => {
    const russian = pages(ru);
    const english = pages(en);

    for (const [index, page] of russian.entries()) {
      if (page.spread.kind !== 'chapter' && page.spread.kind !== 'project') continue;

      expect(english[index]?.blocks).toEqual(page.blocks);
    }
  });

  it('хром книги переводится', () => {
    const guideIndex = spreads().findIndex((spread) => spread.kind === 'guide');
    const side: PageSide = 'left';

    const russian = pageContent({ spread: spreads()[guideIndex]!, side }, ru);
    const english = pageContent({ spread: spreads()[guideIndex]!, side }, en);

    expect(shape(english)).toBe(shape(russian));
    expect(english).not.toEqual(russian);
  });

  it('структура страниц одинакова на обоих языках', () => {
    for (const [index, page] of pages(ru).entries()) {
      expect(shape(pages(en)[index]!.blocks)).toBe(shape(page.blocks));
    }
  });

  it('ссылки берутся только из резюме', () => {
    const allowed = new Set([
      ...profile.contacts.map((contact) => contact.href),
      ...projects.flatMap((project) => project.links.map((link) => link.href)),
    ]);

    const placed = pages(ru)
      .flatMap((page) => page.blocks)
      .filter((block) => block.kind === 'links')
      .flatMap((block) => block.items);

    expect(placed.length).toBeGreaterThan(0);
    for (const link of placed) {
      expect(allowed.has(link.href), link.href).toBe(true);
      expect(link.label.length).toBeGreaterThan(0);
    }
  });

  it('контакты стоят на авантитуле', () => {
    const cover = spreads().find((spread) => spread.kind === 'cover')!;
    const blocks = pageContent({ spread: cover, side: 'left' }, ru);

    const links = blocks.find((block) => block.kind === 'links');
    expect(links?.items.map((item) => item.href)).toEqual(
      profile.contacts.map((contact) => contact.href),
    );
  });

  it('у проекта под NDA ссылок нет', () => {
    const closed = projects.find((project) => project.confidential);
    if (!closed) return;

    const spread = spreads().find(
      (item) => item.kind === 'project' && item.slug === closed.slug,
    );
    if (!spread) return;

    for (const side of SIDES) {
      const blocks = pageContent({ spread, side }, ru);
      expect(blocks.some((block) => block.kind === 'links')).toBe(false);
    }
  });
});
