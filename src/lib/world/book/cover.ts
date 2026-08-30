/** Внешняя сторона книги: раскладка атласа и поза корешка. */

import { BLOCK_T, BOARD_T, COVER_MARGIN, PAGE_H, PAGE_W } from './metrics';

/** Ширины панелей развёртки в пикселях: задняя, корешок, передняя. */
const PANELS = { back: 704, spine: 224, front: 704 };

const ATLAS_WIDTH = PANELS.back + PANELS.spine + PANELS.front;

/** Доля атласа по горизонтали: от `u0` до `u1`. */
export type PanelRect = { u0: number; u1: number };

/** Куски атласа по панелям. Вертикаль у всех полная, режется только ширина. */
export const COVER_ATLAS: Record<'back' | 'spine' | 'front', PanelRect> = {
  back: { u0: 0, u1: PANELS.back / ATLAS_WIDTH },
  spine: {
    u0: PANELS.back / ATLAS_WIDTH,
    u1: (PANELS.back + PANELS.spine) / ATLAS_WIDTH,
  },
  front: { u0: (PANELS.back + PANELS.spine) / ATLAS_WIDTH, u1: 1 },
};

/** Толщина закрытой книги: два переплёта и два бумажных блока. */
export const CLOSED_THICKNESS = 2 * (BLOCK_T + BOARD_T);

/** Ширина крышки переплёта поперёк книги. */
export const COVER_W = PAGE_W + COVER_MARGIN;

/** Высота крышки переплёта. */
export const COVER_H = PAGE_H + COVER_MARGIN;

/** Радиус закрытой книги от начала её координат. */
export const CLOSED_RADIUS = Math.hypot(
  PAGE_W / 2 + COVER_W / 2,
  COVER_H / 2,
  CLOSED_THICKNESS / 2,
);

/** Поза корешка: сдвиг вдоль книги, глубина и поворот вокруг оси корешка. */
export type SpinePose = { x: number; z: number; angle: number };

/** Где стоит корешок при доле раскрытия `raised`. */
export function spinePose(raised: number): SpinePose {
  const settled = Math.min(Math.max(raised, 0), 1);

  const closedX = -(COVER_MARGIN / 2 + BOARD_T / 2);
  const openZ = -(BLOCK_T + BOARD_T + BOARD_T / 2);

  return {
    x: closedX * (1 - settled),
    z: openZ * settled,
    angle: (Math.PI / 2) * (1 - settled),
  };
}
