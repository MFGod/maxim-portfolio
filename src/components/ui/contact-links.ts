import { Mail } from 'lucide-react';

import { GithubMark, TelegramMark } from '@/components/ui/brand-icons';
import type { IconComponent } from '@/components/ui/icons';
import type { ContactKind } from '@/types/resume';
import { deepFreeze } from '@/lib/freeze';

export const contactIcon: Record<ContactKind, IconComponent> = deepFreeze({
  telegram: TelegramMark,
  github: GithubMark,
  email: Mail,
});

/** `mailto:` открывает почтовый клиент: новая вкладка осталась бы пустой. */
export const contactLinkTarget = (kind: ContactKind) =>
  kind === 'email' ? {} : { target: '_blank', rel: 'noreferrer noopener' };
