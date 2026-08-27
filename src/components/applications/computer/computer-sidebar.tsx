'use client';

import { ChevronDown, ChevronRight, Folder, HardDrive, LayoutGrid } from 'lucide-react';
import { Fragment, useState } from 'react';

import type { IconComponent } from '@/components/ui/icons';
import { applications } from '@/data/applications';
import { cn } from '@/lib/cn';
import { useFiles } from '@/lib/files/store';
import { childrenOf } from '@/lib/files/tree';

import type { Location } from './computer-app';

export function ComputerSidebar({
  location,
  onNavigate,
}: {
  location: Location;
  onNavigate: (location: Location) => void;
}) {
  const { nodes } = useFiles();
  const [expanded, setExpanded] = useState<string[]>([]);

  const toggle = (id: string) =>
    setExpanded((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  return (
    <nav
      aria-label="Разделы компьютера"
      className="border-line-subtle bg-surface-0/60 shrink-0 scrollbar-thin overflow-x-auto border-b p-2 sm:w-56 sm:overflow-y-auto sm:border-r sm:border-b-0"
    >
      <ul className="flex gap-1 sm:flex-col">
        <SidebarRow
          icon={HardDrive}
          label="Рабочий стол"
          active={location.kind === 'files' && location.parentId === null}
          onSelect={() => onNavigate({ kind: 'files', parentId: null })}
        />

        <FolderTree
          nodes={nodes}
          parentId={null}
          depth={1}
          expanded={expanded}
          onToggle={toggle}
          location={location}
          onNavigate={onNavigate}
        />

        <SidebarRow
          icon={LayoutGrid}
          label="Программы"
          active={location.kind === 'programs'}
          onSelect={() => onNavigate({ kind: 'programs' })}
        />
        <SidebarRow
          icon={applications.projects.icon}
          label="Проекты"
          active={location.kind === 'projects'}
          onSelect={() => onNavigate({ kind: 'projects' })}
        />
      </ul>
    </nav>
  );
}

/** Дерево папок. Разворачивается только то, что попросили: список не растёт сам. */
function FolderTree({
  nodes,
  parentId,
  depth,
  expanded,
  onToggle,
  location,
  onNavigate,
}: {
  nodes: ReturnType<typeof useFiles>['nodes'];
  parentId: string | null;
  depth: number;
  expanded: string[];
  onToggle: (id: string) => void;
  location: Location;
  onNavigate: (location: Location) => void;
}) {
  const folders = childrenOf(nodes, parentId).filter((node) => node.kind === 'folder');
  if (folders.length === 0) return null;

  return (
    <>
      {folders.map((folder) => {
        const isOpen = expanded.includes(folder.id);
        const hasChildren = childrenOf(nodes, folder.id).some(
          (child) => child.kind === 'folder',
        );

        return (
          // Пункт и его поддерево — соседи в одном списке: обёртка сделала бы
          // `li` внутри `li`, а это недопустимая вложенность.
          <Fragment key={folder.id}>
            <SidebarRow
              icon={Folder}
              label={folder.name}
              depth={depth}
              active={location.kind === 'files' && location.parentId === folder.id}
              expandable={hasChildren}
              expanded={isOpen}
              onToggleExpanded={() => onToggle(folder.id)}
              onSelect={() => onNavigate({ kind: 'files', parentId: folder.id })}
            />
            {isOpen ? (
              <FolderTree
                nodes={nodes}
                parentId={folder.id}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                location={location}
                onNavigate={onNavigate}
              />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

function SidebarRow({
  icon: Icon,
  label,
  depth = 0,
  active,
  expandable,
  expanded,
  onToggleExpanded,
  onSelect,
}: {
  icon: IconComponent;
  label: string;
  depth?: number;
  active: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onSelect: () => void;
}) {
  return (
    <li className="min-w-0">
      <span
        className={cn(
          'flex items-center gap-1 rounded-md pr-1 transition-colors duration-(--duration-fast)',
          active
            ? 'border-accent-dim/50 bg-accent-wash border'
            : 'hover:bg-surface-2 border border-transparent',
        )}
        style={{ paddingLeft: `${depth * 0.75}rem` }}
      >
        {expandable ? (
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-label={expanded ? `Свернуть ${label}` : `Развернуть ${label}`}
            aria-expanded={expanded}
            className="text-ink-faint hover:text-accent grid size-4 shrink-0 place-items-center rounded-xs"
          >
            {expanded ? (
              <ChevronDown aria-hidden className="size-3" />
            ) : (
              <ChevronRight aria-hidden className="size-3" />
            )}
          </button>
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}

        <button
          type="button"
          onClick={onSelect}
          aria-current={active || undefined}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-xs whitespace-nowrap',
            active ? 'text-ink' : 'text-ink-muted',
          )}
        >
          <Icon
            aria-hidden
            className={cn(
              'size-3.5 shrink-0',
              active ? 'text-accent' : 'text-ink-faint',
            )}
            strokeWidth={1.5}
          />
          <span className="truncate">{label}</span>
        </button>
      </span>
    </li>
  );
}
