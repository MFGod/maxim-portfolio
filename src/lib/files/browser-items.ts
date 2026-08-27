import { applications, type AppId } from '@/data/applications';
import { groupEntries, type GroupEntry } from '@/lib/files/grouping';
import { childrenOf } from '@/lib/files/tree';
import type { FileNode, FileTree } from '@/lib/files/types';
import type { FileGroup } from '@/lib/settings/types';

/**
 * Объект списка. Ярлык программы и файл ведут себя по-разному (ярлык нельзя
 * ни переименовать, ни удалить), но выделяются, рисуются и открываются они
 * одинаково — поэтому у режимов отображения один тип на оба случая.
 */
export type BrowserItem =
  | { key: string; kind: 'app'; app: AppId; name: string }
  | { key: string; kind: 'file'; node: FileNode; name: string };

/** Группа объектов с заголовком. Пустой заголовок — группировка выключена. */
export type ItemGroup = { id: string; title: string; items: BrowserItem[] };

/** Панель режима колонок: содержимое папки и раскрытая в ней подпапка. */
export type ColumnPane = {
  /** `null` — корень, то есть рабочий стол. */
  id: string | null;
  title: string;
  items: BrowserItem[];
  /** Подпапка, раскрытая в следующей панели. */
  openedId: string | null;
};

/**
 * Ярлыки, которые лежат на самом столе. В корне проводника они показываются
 * рядом с файлами: иначе «Рабочий стол» отвечал бы «пусто», когда на столе
 * видно четыре ярлыка. Переносить и удалять их нельзя — это часть системы.
 */
const desktopShortcuts: AppId[] = Object.values(applications)
  .filter((app) => app.onDesktop)
  .map((app) => app.id);

/** Содержимое папки в виде объектов списка: сначала ярлыки, потом файлы. */
export function browserItems(
  parentId: string | null,
  nodes: FileTree,
  excludeShortcut?: AppId,
): BrowserItem[] {
  const shortcuts =
    parentId === null ? desktopShortcuts.filter((id) => id !== excludeShortcut) : [];

  return [
    ...shortcuts.map((app): BrowserItem => ({
      key: `app:${app}`,
      kind: 'app',
      app,
      name: applications[app].title,
    })),
    ...childrenOf(nodes, parentId).map((node): BrowserItem => ({
      key: node.id,
      kind: 'file',
      node,
      name: node.name,
    })),
  ];
}

/** Объекты, разложенные по группам. Внутри группы порядок исходный. */
export function groupsOf(items: BrowserItem[], mode: FileGroup): ItemGroup[] {
  const entries: GroupEntry[] = items.map((item) => ({
    key: item.key,
    name: item.name,
    kind: item.kind === 'app' ? 'app' : item.node.kind,
    modifiedAt: item.kind === 'app' ? null : item.node.updatedAt,
  }));

  const byKey = new Map(items.map((item) => [item.key, item]));

  return groupEntries(entries, mode).map((group) => ({
    id: group.id,
    title: group.title,
    items: group.keys.flatMap((key) => {
      const item = byKey.get(key);
      return item ? [item] : [];
    }),
  }));
}

/**
 * Цепочка панелей для режима колонок: корень, каждая папка пути и текущая
 * папка. В каждой отмечено, какая подпапка раскрыта следующей панелью.
 */
export function columnPanes(
  nodes: FileTree,
  path: FileNode[],
  excludeShortcut?: AppId,
): ColumnPane[] {
  const chain: Array<{ id: string | null; title: string }> = [
    { id: null, title: 'Рабочий стол' },
    ...path.map((node) => ({ id: node.id, title: node.name })),
  ];

  return chain.map((pane, index) => ({
    id: pane.id,
    title: pane.title,
    items: browserItems(pane.id, nodes, excludeShortcut),
    // Раскрыта та папка, которая стала следующей панелью. У последней панели
    // следующей нет — раскрывать нечего.
    openedId: chain[index + 1]?.id ?? null,
  }));
}
