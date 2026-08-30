import { describe, expect, it } from 'vitest';

import {
  STAR_COUNT,
  STAR_RADIUS,
  TWINKLE_DEPTH,
  TWINKLE_PERIOD,
} from '@/lib/world/stars';
import { DRAW_DISTANCE } from '@/lib/world/horizon';
import { MOON_DISTANCE } from '@/lib/world/moon';

describe('звёздное поле', () => {
  it('звёзд хватает на небо, но они не застят луну', () => {
    expect(STAR_COUNT).toBeGreaterThan(1000);
    expect(STAR_COUNT).toBeLessThan(3000);
  });

  it('поле стоит за луной и не выходит за дальнюю плоскость', () => {
    expect(STAR_RADIUS).toBeGreaterThan(MOON_DISTANCE);
    expect(STAR_RADIUS).toBeLessThan(DRAW_DISTANCE);
  });
});

describe('мерцание', () => {
  it('звезда дрожит, а не моргает', () => {
    expect(TWINKLE_DEPTH).toBeGreaterThan(0);
    expect(TWINKLE_DEPTH).toBeLessThan(0.5);
  });

  it('круг времени длинный: повтор не читается', () => {
    expect(TWINKLE_PERIOD).toBeGreaterThanOrEqual(300);
  });
});
