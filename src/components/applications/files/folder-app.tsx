'use client';

import { useNavigationHistory } from '@/hooks/use-navigation-history';

import { FileBrowser } from './file-browser';

/**
 * Окно папки. Навигация идёт внутри окна — как в проводнике, а не новым окном на
 * каждый уровень: иначе десяток вложенных папок засыпает рабочий стол.
 */
export function FolderApp({ fileId }: { fileId: string }) {
  const navigation = useNavigationHistory<string | null>(fileId);

  return (
    <FileBrowser
      parentId={navigation.current}
      onNavigate={navigation.go}
      onBack={navigation.back}
      onForward={navigation.forward}
      canBack={navigation.canBack}
      canForward={navigation.canForward}
    />
  );
}
