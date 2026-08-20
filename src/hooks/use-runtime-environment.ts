'use client';

import { useEffect, useState } from 'react';

import { deviceType, parseBrowser, type DeviceType } from '@/lib/runtime/environment';

type RuntimeEnvironment = {
  /** `null` до гидратации: на сервере вьюпорта клиента не существует. */
  viewport: { width: number; height: number } | null;
  device: DeviceType | null;
  browser: string | null;
  online: boolean | null;
};

const EMPTY: RuntimeEnvironment = {
  viewport: null,
  device: null,
  browser: null,
  online: null,
};

/**
 * Окружение браузера: размер окна, тип устройства, движок, сеть. Читается после
 * монтирования — до него этих значений не существует.
 */
export function useRuntimeEnvironment(): RuntimeEnvironment {
  const [environment, setEnvironment] = useState<RuntimeEnvironment>(EMPTY);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');

    const read = () =>
      setEnvironment({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        device: deviceType(window.innerWidth, coarse.matches),
        browser: parseBrowser(navigator.userAgent),
        online: navigator.onLine,
      });

    read();
    window.addEventListener('resize', read, { passive: true });
    window.addEventListener('online', read);
    window.addEventListener('offline', read);
    coarse.addEventListener('change', read);

    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('online', read);
      window.removeEventListener('offline', read);
      coarse.removeEventListener('change', read);
    };
  }, []);

  return environment;
}
