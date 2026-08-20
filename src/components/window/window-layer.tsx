'use client';

import { AnimatePresence } from 'motion/react';

import { AppContent, labelOf } from '@/components/applications/app-registry';
import { useSetting } from '@/lib/settings';
import { useWindowManager } from '@/lib/window-manager';

import { WindowFrame } from './window-frame';

export function WindowLayer() {
  const { state } = useWindowManager();
  const locale = useSetting((settings) => settings.language);

  return (
    <div className="pointer-events-none fixed inset-0 z-(--z-windows)">
      <AnimatePresence>
        {state.order.map((id) => {
          const instance = state.windows[id];
          if (!instance) return null;
          const label = labelOf(instance, locale);

          return (
            <WindowFrame
              key={id}
              instance={instance}
              title={label.title}
              {...(label.subtitle ? { subtitle: label.subtitle } : {})}
            >
              <AppContent instance={instance} />
            </WindowFrame>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
