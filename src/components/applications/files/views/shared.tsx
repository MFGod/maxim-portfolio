'use client';

import { Folder, NotepadText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconBadge } from '@/components/ui/icon-badge';
import type { IconComponent } from '@/components/ui/icons';
import { applications, type AppId } from '@/data/applications';
import { SELECT_KEY_ATTRIBUTE } from '@/hooks/use-marquee';
import { cn } from '@/lib/cn';
import { fileStore } from '@/lib/files/store';
import { splitName } from '@/lib/files/tree';
import type { FileNode } from '@/lib/files/types';

/** Формат MIME для переноса внутри окна. Своё имя — чтобы не ловить чужие данные. */
export const DRAG_TYPE = 'application/x-desktop-file';

/** Модификаторы, при которых клик добавляет к выделению, а не заменяет его. */
export type Modifiers = Pick<React.MouseEvent, 'ctrlKey' | 'metaKey' | 'shiftKey'>;

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

/**
 * Всё, что режиму отображения нужно знать о состоянии и уметь сообщить наружу.
 * Логика выделения, буфера и меню живёт в `FileBrowser`: режимы отвечают только
 * за раскладку.
 */
export type ItemView = {
  /** Плоский список в порядке чтения: лента галереи и панели колонок. */
  items: BrowserItem[];
  /** Тот же список, разложенный по группам: режимы значков и списка. */
  groups: ItemGroup[];
  selected: ReadonlySet<string>;
  /** Идентификаторы вырезанных файлов: рисуются приглушённо. */
  cutIds: readonly string[];
  dropTargetId: string | null;
  renamingId: string | null;
  /** Что поедет за курсором, если тянуть этот объект. */
  dragIdsFor: (key: string) => string[];
  onSelect: (key: string, modifiers: Modifiers) => void;
  onSelectOnly: (key: string) => void;
  onOpen: (item: BrowserItem) => void;
  onMenu: (item: BrowserItem, event: React.MouseEvent) => void;
  onDropTarget: (id: string | null) => void;
  onRenameEnd: () => void;
};

export function iconFor(item: BrowserItem): IconComponent {
  if (item.kind === 'app') return applications[item.app].icon;
  return item.node.kind === 'folder' ? Folder : NotepadText;
}

/** Папка — единственный приёмник для переноса. */
function folderIdOf(item: BrowserItem): string | null {
  return item.kind === 'file' && item.node.kind === 'folder' ? item.node.id : null;
}

/**
 * Список идентификаторов из `dataTransfer`. Данные кладёт то же приложение, но
 * приходят они через браузер — разбираем как внешние.
 */
export function readDragIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

/**
 * Обработчики переноса мышью. Одни и те же в плитке и в строке: тянуть и
 * принимать умеют оба режима.
 */
function dragProps(item: BrowserItem, view: ItemView) {
  const folderId = folderIdOf(item);

  return {
    draggable: item.kind === 'file',
    onDragStart: (event: React.DragEvent) => {
      // Перетаскивание не даёт клика: выделить объект нужно здесь.
      if (!view.selected.has(item.key)) view.onSelectOnly(item.key);
      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(view.dragIdsFor(item.key)));
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (event: React.DragEvent) => {
      if (!folderId) return;
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      view.onDropTarget(folderId);
    },
    onDragLeave: () => view.onDropTarget(null),
    onDrop: (event: React.DragEvent) => {
      if (!folderId) return;
      event.preventDefault();
      event.stopPropagation();
      const ids = readDragIds(event.dataTransfer.getData(DRAG_TYPE));
      if (ids.length > 0) fileStore.moveMany(ids, folderId);
      view.onDropTarget(null);
    },
  };
}

/** Состояния оформления, общие для плитки и строки. */
function stateClasses(item: BrowserItem, view: ItemView) {
  const selected = view.selected.has(item.key);
  // Приёмник — только папка: у файла и ярлыка `folderIdOf` даёт `null`, и без
  // явной проверки они совпали бы с пустым `dropTargetId`.
  const folderId = folderIdOf(item);
  const dropTarget = folderId !== null && folderId === view.dropTargetId;
  const cut = item.kind === 'file' && view.cutIds.includes(item.node.id);
  return { selected, dropTarget, cut };
}

/**
 * Квадратная плитка: режим значков и лента галереи. Габарит приходит из
 * `--icon-size`, поэтому плитка совпадает с ярлыком рабочего стола.
 */
export function ItemTile({ item, view }: { item: BrowserItem; view: ItemView }) {
  const { selected, dropTarget, cut } = stateClasses(item, view);
  const renaming = item.kind === 'file' && view.renamingId === item.node.id;

  return (
    <li>
      <div
        {...{ [SELECT_KEY_ATTRIBUTE]: item.key }}
        {...dragProps(item, view)}
        onContextMenu={(event) => view.onMenu(item, event)}
        className={cn(
          'group/tile m-0.5 size-(--icon-size) overflow-hidden rounded-lg border select-none',
          'transition-colors duration-(--duration-fast)',
          dropTarget
            ? 'border-accent bg-accent-wash'
            : selected
              ? 'border-accent-dim/60 bg-surface-2'
              : 'hover:bg-surface-2/60 border-transparent',
          cut && 'opacity-50',
        )}
      >
        {/* Поле правки имени не может жить внутри `button`: такая вложенность
            недопустима, и браузер не отдаёт полю ни фокус, ни ввод. */}
        {renaming && item.kind === 'file' ? (
          <div className="flex size-full flex-col items-center justify-center gap-(--icon-gap) p-(--icon-pad) text-center">
            <IconBadge icon={iconFor(item)} accent={item.node.kind === 'folder'} />
            <RenameInput node={item.node} onDone={view.onRenameEnd} />
          </div>
        ) : (
          <button
            type="button"
            onClick={(event) => view.onSelect(item.key, event)}
            onDoubleClick={() => view.onOpen(item)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              view.onOpen(item);
            }}
            aria-label={item.kind === 'app' ? `${item.name}. Программа` : item.name}
            className="group flex size-full flex-col items-center justify-center gap-(--icon-gap) p-(--icon-pad) text-center"
          >
            <IconBadge
              icon={iconFor(item)}
              accent={item.kind === 'file' && item.node.kind === 'folder'}
            />
            <span className="text-ink-muted line-clamp-2 text-(length:--icon-label) leading-tight break-all">
              {item.name}
            </span>
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Значок строки. Отдельным компонентом, потому что тип значка выбирается по
 * объекту: подставлять результат выбора прямо в разметку React не даёт.
 */
function RowIcon({ icon: Icon, accent }: { icon: IconComponent; accent: boolean }) {
  return (
    <Icon
      aria-hidden
      className={cn('size-4 shrink-0', accent ? 'text-accent' : 'text-ink-faint')}
      strokeWidth={1.5}
    />
  );
}

/**
 * Строка списка. Значок уменьшен вдвое против плитки: в строке он опознаёт тип,
 * а не служит целью попадания.
 */
export function ItemRow({
  item,
  view,
  children,
}: {
  item: BrowserItem;
  view: ItemView;
  /** Колонки справа от имени. В панели «колонок» их нет. */
  children?: React.ReactNode;
}) {
  const { selected, dropTarget, cut } = stateClasses(item, view);
  const renaming = item.kind === 'file' && view.renamingId === item.node.id;

  return (
    <li
      {...{ [SELECT_KEY_ATTRIBUTE]: item.key }}
      {...dragProps(item, view)}
      onContextMenu={(event) => view.onMenu(item, event)}
      className={cn(
        'flex items-center gap-2 rounded-md border px-2 py-1 select-none',
        'transition-colors duration-(--duration-fast)',
        dropTarget
          ? 'border-accent bg-accent-wash'
          : selected
            ? 'border-accent-dim/60 bg-surface-2'
            : 'hover:bg-surface-2/60 border-transparent',
        cut && 'opacity-50',
      )}
    >
      <RowIcon
        icon={iconFor(item)}
        accent={item.kind === 'file' && item.node.kind === 'folder'}
      />

      {renaming && item.kind === 'file' ? (
        <RenameInput node={item.node} onDone={view.onRenameEnd} />
      ) : (
        <button
          type="button"
          onClick={(event) => view.onSelect(item.key, event)}
          onDoubleClick={() => view.onOpen(item)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            view.onOpen(item);
          }}
          className="text-ink-muted min-w-0 flex-1 truncate text-left text-xs"
        >
          {item.name}
        </button>
      )}

      {children}
    </li>
  );
}

/** Поле переименования. Enter — принять, Esc — отменить, потеря фокуса — принять. */
export function RenameInput({ node, onDone }: { node: FileNode; onDone: () => void }) {
  const [value, setValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    // Расширение выделять не нужно: правят обычно имя.
    const { base } = splitName(node.name, node.kind);
    input.setSelectionRange(0, base.length);
  }, [node.kind, node.name]);

  const commit = () => {
    fileStore.rename(node.id, value);
    onDone();
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onDone();
        }
      }}
      aria-label={`Имя: ${node.name}`}
      className="border-accent-dim bg-surface-1 text-2xs text-ink w-full min-w-0 flex-1 rounded-sm border px-1 py-0.5 text-center outline-none"
    />
  );
}

/**
 * Заголовок группы. Показывается, только когда группировка включена: у режима
 * «без групп» заголовок пустой, и лишней полосы над содержимым не появляется.
 */
export function GroupTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="text-2xs text-ink-faint flex items-baseline gap-2 px-1 pt-2 pb-1 select-none">
      <span className="text-ink-muted">{title}</span>
      <span className="font-mono">{count}</span>
    </div>
  );
}
