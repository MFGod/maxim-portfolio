'use client';

import type { BrowserItem, ColumnPane } from '@/lib/files/browser-items';
import type { FileTree } from '@/lib/files/types';
import type { FileView } from '@/lib/settings/types';

import { ColumnsView } from './views/columns-view';
import { GalleryView } from './views/gallery-view';
import { IconsView } from './views/icons-view';
import { ListView } from './views/list-view';
import type { ItemView } from './views/shared';

type Props = {
  mode: FileView;
  view: ItemView;
  nodes: FileTree;
  panes: ColumnPane[];
  focused: BrowserItem | null;
  onNavigate: (parentId: string | null) => void;
};

/** Раскладка по выбранному режиму. Всё остальное у режимов общее. */
export function FileLayout({ mode, view, nodes, panes, focused, onNavigate }: Props) {
  switch (mode) {
    case 'icons':
      return <IconsView view={view} />;
    case 'list':
      return <ListView view={view} nodes={nodes} />;
    case 'columns':
      return <ColumnsView view={view} panes={panes} onNavigate={onNavigate} />;
    case 'gallery':
      return <GalleryView view={view} nodes={nodes} focused={focused} />;
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}
