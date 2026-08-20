'use client';

import { labelOf } from '@/components/applications/app-registry';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslate } from '@/lib/i18n';
import { useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';

/** Показывается, только если включено подтверждение закрытия. */
export function CloseConfirmDialog() {
  const { state, pendingCloseId, confirmClose, cancelClose } = useWindowManager();
  const locale = useSetting((settings) => settings.language);
  const t = useTranslate();

  if (!pendingCloseId) return null;
  const instance = state.windows[pendingCloseId];
  if (!instance) return null;

  return (
    <ConfirmDialog
      scope="screen"
      title={t('close.confirm.title')}
      body={t('close.confirm.body')}
      detail={labelOf(instance, locale).title}
      confirmLabel={t('close.confirm.submit')}
      onCancel={cancelClose}
      onConfirm={confirmClose}
    />
  );
}
