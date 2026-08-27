'use client';

import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { ColumnPane } from '@/lib/files/browser-items';

import { ItemRow } from './items';
import { type ItemView } from './shared';

/**
 * Режим колонок: путь виден целиком — каждая папка цепочки показана своей
 * панелью. Нажатие на папку раскрывает следующую панель, на файл — просто
 * выделяет. Рамка выделения здесь не работает: панелей несколько, и жест,
 * начатый в одной, не должен захватывать соседние.
 */
export function ColumnsView({
  view,
  panes,
  onNavigate,
}: {
  view: ItemView;
  panes: ColumnPane[];
  onNavigate: (parentId: string | null) => void;
}) {
  return (
    <div className="flex h-full min-h-0 items-stretch overflow-x-auto">
      {panes.map((pane, index) => (
        <div
          key={pane.id ?? 'root'}
          className={cn(
            'flex min-h-0 w-56 shrink-0 flex-col',
            index > 0 && 'border-line-subtle border-l',
          )}
        >
          <div className="text-2xs text-ink-faint border-line-subtle flex items-center gap-1 border-b px-2 py-1">
            <span className="truncate">{pane.title}</span>
          </div>

          {pane.items.length === 0 ? (
            <p className="text-2xs text-ink-faint px-2 py-2">Пусто</p>
          ) : (
            <ul className="min-h-0 flex-1 scrollbar-thin space-y-0.5 overflow-y-auto p-1">
              {pane.items.map((item) => {
                const isFolder = item.kind === 'file' && item.node.kind === 'folder';
                return (
                  <ItemRow
                    key={item.key}
                    item={item}
                    view={{
                      ...view,
                      // Обычное нажатие на папке раскрывает её следующей
                      // панелью: это и есть навигация в режиме колонок. С
                      // модификатором набирают выделение — уходить из папки
                      // на середине набора нельзя.
                      onSelect: (key, modifiers) => {
                        view.onSelect(key, modifiers);
                        const additive =
                          modifiers.ctrlKey || modifiers.metaKey || modifiers.shiftKey;
                        if (!additive && isFolder && item.kind === 'file') {
                          onNavigate(item.node.id);
                        }
                      },
                    }}
                  >
                    {isFolder ? (
                      <ChevronRight
                        aria-hidden
                        className={cn(
                          'size-3.5 shrink-0',
                          item.kind === 'file' && item.node.id === pane.openedId
                            ? 'text-accent'
                            : 'text-ink-faint',
                        )}
                      />
                    ) : null}
                  </ItemRow>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
