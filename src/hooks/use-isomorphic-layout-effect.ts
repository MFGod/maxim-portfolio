'use client';

import { useEffect, useLayoutEffect } from 'react';

/** На сервере layout-эффектов нет, там достаточно обычного. */
export const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;
