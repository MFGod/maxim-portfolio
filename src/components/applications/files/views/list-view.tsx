'use client';

import { childrenOf } from '@/lib/files/tree';
import type { FileTree } from '@/lib/files/types';
import { formatCount, formatTimestamp } from '@/lib/format';

import { GroupTitle, ItemRow } from './items';
import { type BrowserItem, type ItemView } from './shared';

/** Что за объект: колонка «Тип» повторяет то, что видно по значку, словами. */
function typeLabel(item: BrowserItem): string {
  if (item.kind === 'app') return 'Программа';
  return item.node.kind === 'folder' ? 'Папка' : 'Текстовый документ';
}

/**
 * Колонка «Размер». У папки это число вложенных объектов, у текста — длина;
 * байты показывать нечего: файлы живут в localStorage, а не на диске.
 */
function sizeLabel(item: BrowserItem, nodes: FileTree): string {
  if (item.kind === 'app') return '—';
  if (item.node.kind === 'folder') {
    return formatCount(childrenOf(nodes, item.node.id).length, [
      'объект',
      'объекта',
      'объектов',
    ]);
  }
  return formatCount(item.node.body.length, ['символ', 'символа', 'символов']);
}

/**
 * Режим списка: строка на объект, справа тип, размер и дата изменения. Колонки
 * фиксированной ширины — так значения выстраиваются друг под другом и их можно
 * сравнивать взглядом.
 */
export function ListView({ view, nodes }: { view: ItemView; nodes: FileTree }) {
  return (
    <div className="min-w-0">
      <div className="text-2xs text-ink-faint border-line-subtle flex items-center gap-2 border-b px-2 pb-1 font-mono select-none">
        <span className="w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Имя</span>
        <span className="w-36 shrink-0 max-sm:hidden">Тип</span>
        <span className="w-28 shrink-0 max-sm:hidden">Размер</span>
        <span className="w-32 shrink-0 max-md:hidden">Изменён</span>
      </div>

      {view.groups.map((group) => (
        <section key={group.id}>
          {group.title ? (
            <GroupTitle title={group.title} count={group.items.length} />
          ) : null}

          <ul className="pt-1">
            {group.items.map((item) => (
              <ItemRow key={item.key} item={item} view={view}>
                <span className="text-2xs text-ink-faint w-36 shrink-0 truncate max-sm:hidden">
                  {typeLabel(item)}
                </span>
                <span className="text-2xs text-ink-faint w-28 shrink-0 truncate max-sm:hidden">
                  {sizeLabel(item, nodes)}
                </span>
                <span className="text-2xs text-ink-faint w-32 shrink-0 truncate font-mono max-md:hidden">
                  {item.kind === 'file' ? formatTimestamp(item.node.updatedAt) : '—'}
                </span>
              </ItemRow>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
