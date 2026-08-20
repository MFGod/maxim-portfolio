'use client';

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Folder,
  HardDrive,
  LayoutGrid,
} from 'lucide-react';
import { Fragment, useState } from 'react';

import { appHint, appTitle } from '@/components/applications/app-registry';
import type { IconComponent } from '@/components/ui/icons';
import { FileBrowser } from '@/components/applications/files/file-browser';
import { applications, programGroups, type AppId } from '@/data/applications';
import { useNavigationHistory } from '@/hooks/use-navigation-history';
import { projects } from '@/data/resume';
import { cn } from '@/lib/cn';
import { useFiles } from '@/lib/files/store';
import { childrenOf } from '@/lib/files/tree';
import { formatCount } from '@/lib/format';
import { useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';

/**
 * Где сейчас находится проводник. Программы и проекты — такие же места, как
 * папка: у бокового списка один тип выбранного значения, а не три флага.
 */
type Location =
  | { kind: 'programs' }
  | { kind: 'projects' }
  | { kind: 'files'; parentId: string | null };

const START: Location = Object.freeze({ kind: 'files', parentId: null });

/** Одно и то же место. Место здесь — объект, поэтому сравнение по значению. */
function sameLocation(a: Location, b: Location): boolean {
  if (a.kind === 'files' && b.kind === 'files') return a.parentId === b.parentId;
  return a.kind === b.kind;
}

export function ComputerApp() {
  // История общая на всё окно: «Назад» возвращает и в папку, и в «Программы».
  const navigation = useNavigationHistory<Location>(START, sameLocation);
  const location = navigation.current;

  return (
    <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <Sidebar location={location} onNavigate={navigation.go} />

      <div className="min-h-0 flex-1">
        {location.kind === 'files' ? (
          <FileBrowser
            parentId={location.parentId}
            onNavigate={(parentId) => navigation.go({ kind: 'files', parentId })}
            excludeShortcut="computer"
            onBack={navigation.back}
            onForward={navigation.forward}
            canBack={navigation.canBack}
            canForward={navigation.canForward}
          />
        ) : (
          <Section
            navigation={navigation}
            title={location.kind === 'programs' ? 'Программы' : 'Проекты'}
          >
            {location.kind === 'programs' ? <Programs /> : <Projects />}
          </Section>
        )}
      </div>
    </div>
  );
}

/**
 * Программы и проекты — такие же места, как папка, и ходить по ним нужно теми же
 * кнопками. Панель повторяет ту, что рисует проводник.
 */
function Section({
  navigation,
  title,
  children,
}: {
  navigation: ReturnType<typeof useNavigationHistory<Location>>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-line-subtle flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <NavButton
            icon={ArrowLeft}
            label="Назад"
            disabled={!navigation.canBack}
            onSelect={navigation.back}
          />
          <NavButton
            icon={ArrowRight}
            label="Вперёд"
            disabled={!navigation.canForward}
            onSelect={navigation.forward}
          />
          <NavButton
            icon={ArrowUp}
            label="На уровень вверх"
            onSelect={() => navigation.go(START)}
          />
        </div>
        <span className="text-ink-faint text-xs">{title}</span>
      </div>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function NavButton({
  icon: Icon,
  label,
  disabled,
  onSelect,
}: {
  icon: IconComponent;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'border-line-subtle grid size-7 place-items-center rounded-md border transition-colors duration-(--duration-fast)',
        disabled
          ? 'text-ink-faint opacity-40'
          : 'text-ink-muted hover:border-accent-dim hover:text-accent',
      )}
    >
      <Icon aria-hidden className="size-4" strokeWidth={1.5} />
    </button>
  );
}

function Sidebar({
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

/** Все программы, разложенные по назначению. */
function Programs() {
  const { open } = useWindowManager();
  const locale = useSetting((settings) => settings.language);

  return (
    <div className="h-full scrollbar-thin overflow-y-auto px-(--app-pad-x) py-(--app-pad-y)">
      {programGroups.map((group) => (
        <section key={group.id} className="mt-7 first:mt-0">
          <h3 className="text-ink font-display text-base tracking-[0.16em] uppercase">
            {group.label}
          </h3>
          <div
            aria-hidden
            className="mt-2 mb-3 h-px"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--color-accent-dim), transparent)',
            }}
          />

          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {group.apps.map((id) => (
              <ProgramTile key={id} id={id} onOpen={() => open(id)} locale={locale} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ProgramTile({
  id,
  onOpen,
  locale,
}: {
  id: AppId;
  onOpen: () => void;
  locale: Parameters<typeof appTitle>[1];
}) {
  const app = applications[id];
  const Icon = app.icon;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group border-line-subtle bg-surface-1/60 hover:border-accent-dim/60 hover:bg-surface-2 flex w-full flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors duration-(--duration-fast)"
      >
        <span className="border-line-subtle bg-surface-2/80 text-ink-muted group-hover:border-accent-dim group-hover:text-accent grid size-9 place-items-center rounded-md border transition-colors duration-(--duration-fast)">
          <Icon aria-hidden className="size-4.5" strokeWidth={1.5} />
        </span>
        <span className="min-w-0">
          <span className="text-ink block truncate text-sm font-medium">
            {appTitle(id, locale)}
          </span>
          <span className="text-ink-faint mt-0.5 block truncate text-xs">
            {appHint(id, locale)}
          </span>
        </span>
      </button>
    </li>
  );
}

function Projects() {
  const { open } = useWindowManager();

  return (
    <div className="h-full scrollbar-thin overflow-y-auto px-(--app-pad-x) py-(--app-pad-y)">
      <p className="text-ink-muted text-sm">
        {formatCount(projects.length, ['проект', 'проекта', 'проектов'])} — карточка
        открывается отдельным окном.
      </p>

      <ul className="divide-line-subtle border-line-subtle mt-4 divide-y rounded-lg border">
        {projects.map((project) => (
          <li key={project.slug}>
            <button
              type="button"
              onClick={() => open('project', { slug: project.slug })}
              className="group hover:bg-surface-2 kbd-focus:bg-surface-2 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-(--duration-fast)"
            >
              <span className="min-w-0 flex-1">
                <span className="text-ink group-hover:text-accent block truncate text-sm font-medium">
                  {project.name}
                </span>
                <span className="text-ink-faint mt-0.5 block truncate text-xs">
                  {project.tagline}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="text-ink-faint group-hover:text-accent size-4 shrink-0 transition-transform duration-(--duration-fast) group-hover:translate-x-0.5"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
