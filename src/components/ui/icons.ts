import type { ComponentType } from 'react';

/**
 * Минимальный контракт иконки: ему удовлетворяют и компоненты `lucide-react`,
 * и собственные бренд-марки. Нужен потому, что в lucide v1 бренд-иконок нет.
 */
export type IconComponent = ComponentType<{
  className?: string;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
}>;
