'use client';

import { IconBadge } from '@/components/ui/icon-badge';
import { applications } from '@/data/applications';
import { childrenOf } from '@/lib/files/tree';
import type { FileTree } from '@/lib/files/types';
import { formatCount, formatTimestamp } from '@/lib/format';

import { ItemTile, iconFor, type BrowserItem, type ItemView } from './shared';

/** Сколько текста показывать в предпросмотре. Дальше — открывать в редакторе. */
const PREVIEW_LIMIT = 1200;

/**
 * Режим галереи: крупный предпросмотр выбранного объекта и лента плиток внизу.
 * Картинок в файловой модели нет, поэтому «предпросмотр» — это содержимое
 * текстового файла и сводка по папке; для этого режим и полезен.
 */
export function GalleryView({
  view,
  nodes,
  focused,
}: {
  view: ItemView;
  nodes: FileTree;
  /** Что показывать крупно. Обычно — единственный выделенный объект. */
  focused: BrowserItem | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="border-line-subtle bg-surface-1/40 min-h-0 flex-1 rounded-lg border p-4">
        {focused ? <Preview item={focused} nodes={nodes} /> : <Empty />}
      </div>

      <ul className="flex shrink-0 gap-1 overflow-x-auto pb-1">
        {view.items.map((item) => (
          <ItemTile key={item.key} item={item} view={view} />
        ))}
      </ul>
    </div>
  );
}

function Empty() {
  return (
    <p className="text-ink-faint grid h-full place-items-center text-sm">
      Выберите объект в ленте — здесь появится его содержимое
    </p>
  );
}

function Preview({ item, nodes }: { item: BrowserItem; nodes: FileTree }) {
  const summary =
    item.kind === 'app'
      ? applications[item.app].hint
      : item.node.kind === 'folder'
        ? formatCount(childrenOf(nodes, item.node.id).length, [
            'объект',
            'объекта',
            'объектов',
          ])
        : `изменён ${formatTimestamp(item.node.updatedAt)}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-3">
        <IconBadge
          icon={iconFor(item)}
          accent={item.kind === 'file' && item.node.kind === 'folder'}
        />
        <div className="min-w-0">
          <p className="text-ink truncate text-sm">{item.name}</p>
          <p className="text-2xs text-ink-faint truncate">{summary}</p>
        </div>
      </div>

      {item.kind === 'file' && item.node.kind === 'text' ? (
        <pre className="text-2xs text-ink-muted min-h-0 flex-1 scrollbar-thin overflow-auto font-mono whitespace-pre-wrap">
          {item.node.body.slice(0, PREVIEW_LIMIT) || 'Файл пуст'}
        </pre>
      ) : null}
    </div>
  );
}
