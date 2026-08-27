'use client';

import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';

import { FileBrowser } from '@/components/applications/files/file-browser';
import { ToolbarButton } from '@/components/ui/toolbar-button';
import { useNavigationHistory } from '@/hooks/use-navigation-history';

import { ComputerSidebar } from './computer-sidebar';
import { Programs, Projects } from './computer-sections';

/**
 * Где сейчас находится проводник. Программы и проекты — такие же места, как
 * папка: у бокового списка один тип выбранного значения, а не три флага.
 */
export type Location =
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
      <ComputerSidebar location={location} onNavigate={navigation.go} />

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
          <ToolbarButton
            icon={ArrowLeft}
            label="Назад"
            disabled={!navigation.canBack}
            onSelect={navigation.back}
          />
          <ToolbarButton
            icon={ArrowRight}
            label="Вперёд"
            disabled={!navigation.canForward}
            onSelect={navigation.forward}
          />
          <ToolbarButton
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
