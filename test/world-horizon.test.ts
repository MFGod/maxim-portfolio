import { describe, expect, it } from 'vitest';

import { cloudCircle, cloudReach, floorRadius } from '@/lib/world/clouds';
import { DAY, DUSK } from '@/lib/world/daylight';
import { DRAW_DISTANCE, FOG_LEAD, worldFog } from '@/lib/world/horizon';
import { MOON_DISTANCE } from '@/lib/world/moon';
import { STAR_RADIUS } from '@/lib/world/stars';

const FOG = worldFog();
const CIRCLE = cloudCircle();

describe('туман по кругу облаков', () => {
  it('садится чуть раньше кольца', () => {
    expect(FOG.near).toBeLessThan(CIRCLE.radius);
    expect(CIRCLE.radius - FOG.near).toBe(FOG_LEAD);
    expect(FOG_LEAD).toBeLessThan(CIRCLE.radius / 2);
  });

  it('добирает полную силу внутри облачной полосы', () => {
    expect(FOG.far).toBeGreaterThan(CIRCLE.radius);
    expect(FOG.far).toBeLessThan(cloudReach());
  });

  it('дневной набор берёт этот туман как есть, сумеречный сгущает', () => {
    expect(DAY.fog).toEqual(FOG);
    expect(DUSK.fog.near).toBeLessThan(DAY.fog.near);
    expect(DUSK.fog.far).toBeLessThan(DAY.fog.far);
    expect(DUSK.fog.far).toBeGreaterThan(CIRCLE.radius);
  });
});

describe('предел прорисовки', () => {
  it('стоит за туманом: дальше него в кадре одно небо', () => {
    expect(DRAW_DISTANCE).toBeGreaterThan(FOG.far);
  });

  it('срезает хвост облачной полосы и край подложки', () => {
    expect(DRAW_DISTANCE).toBeLessThan(cloudReach());
    expect(DRAW_DISTANCE).toBeLessThan(floorRadius());
  });

  it('оставляет в кадре и звёзды, и луну', () => {
    expect(STAR_RADIUS).toBeLessThan(DRAW_DISTANCE);
    expect(MOON_DISTANCE).toBeLessThan(STAR_RADIUS);
    expect(MOON_DISTANCE).toBeGreaterThan(CIRCLE.radius);
  });
});
