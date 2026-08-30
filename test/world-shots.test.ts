import { describe, expect, it } from 'vitest';

import { worldBattles } from '@/data/world-battles';
import { SEA_LEVEL, WORLD_BOUNDS, mainRoute, worldChapters } from '@/data/world-places';
import {
  allShots,
  entryPath,
  peakRoute,
  zoneOf,
  zoneShots,
  type WorldShot,
} from '@/data/world-shots';
import { battleView } from '@/lib/world/battle';
import {
  POCKET_FADE,
  POCKET_RADIUS,
  battlePockets,
  peakPath,
  pocketOf,
  routeStops,
  worldPockets,
} from '@/lib/world/shots';

const flat = (a: WorldShot, b: WorldShot) =>
  Math.hypot(a.at[0] - b.at[0], a.at[2] - b.at[2]);

const inside = (shot: WorldShot) =>
  shot.at[0] >= WORLD_BOUNDS.minX &&
  shot.at[0] <= WORLD_BOUNDS.maxX &&
  shot.at[2] >= WORLD_BOUNDS.minZ &&
  shot.at[2] <= WORLD_BOUNDS.maxZ;

describe('ракурсы мира', () => {
  it('каждая глава карьеры получила зону', () => {
    for (const chapter of worldChapters) {
      expect(
        zoneOf(chapter.positionId),
        `нет зоны для ${chapter.positionId}`,
      ).toBeDefined();
    }
  });

  it('зоны не ссылаются на несуществующие главы', () => {
    const known = new Set(worldChapters.map((chapter) => chapter.positionId));
    for (const zone of zoneShots) {
      expect(known.has(zone.positionId), `лишняя глава ${zone.positionId}`).toBe(true);
    }
  });

  it('имена не повторяются: карман строится по точке', () => {
    const names = allShots().map((shot) => shot.id);
    expect(new Set(names).size).toBe(names.length);
  });

  it('камера стоит внутри обрезанной карты', () => {
    for (const shot of allShots()) {
      expect(inside(shot), `${shot.id} вышел за границы мира`).toBe(true);
    }
  });

  it('ни одна точка не утоплена под воду', () => {
    for (const shot of allShots()) {
      expect(shot.at[1], `${shot.id} ниже уровня моря`).toBeGreaterThan(SEA_LEVEL);
    }
  });

  it('направление взгляда определено: точка взгляда не слиплась с камерой', () => {
    for (const shot of allShots()) {
      const distance = Math.hypot(
        shot.look[0] - shot.at[0],
        shot.look[1] - shot.at[1],
        shot.look[2] - shot.at[2],
      );
      expect(distance, `${shot.id}: взгляд вырожден`).toBeGreaterThan(1);
    }
  });
});

describe('зоны', () => {
  it('подлёт стоит дальше от прибытия, чем на шаг: иначе это не дуга', () => {
    for (const zone of zoneShots) {
      if (!zone.approach) continue;
      expect(
        flat(zone.approach, zone.arrival),
        `${zone.positionId}: подлёт слился с прибытием`,
      ).toBeGreaterThan(3);
    }
  });

  it('подлёт дальше от благодати, чем прибытие: он подводка, а не дубль', () => {
    for (const zone of zoneShots) {
      if (!zone.approach) continue;

      const grace = worldChapters.find((c) => c.positionId === zone.positionId)!.grace;
      const toApproach = Math.hypot(
        zone.approach.at[0] - grace[0],
        zone.approach.at[2] - grace[2],
      );
      const toArrival = Math.hypot(
        zone.arrival.at[0] - grace[0],
        zone.arrival.at[2] - grace[2],
      );

      expect(toApproach, `${zone.positionId}: подлёт ближе прибытия`).toBeGreaterThan(
        toArrival,
      );
    }
  });

  it('прибытие лежит ближе к своей благодати, чем к чужой', () => {
    for (const zone of zoneShots) {
      const own = worldChapters.find((c) => c.positionId === zone.positionId)!;
      const ownDistance = Math.hypot(
        zone.arrival.at[0] - own.grace[0],
        zone.arrival.at[2] - own.grace[2],
      );

      for (const other of worldChapters) {
        if (other.positionId === zone.positionId) continue;
        const otherDistance = Math.hypot(
          zone.arrival.at[0] - other.grace[0],
          zone.arrival.at[2] - other.grace[2],
        );
        expect(
          ownDistance,
          `прибытие ${zone.positionId} ближе к главе ${other.positionId}`,
        ).toBeLessThan(otherDistance);
      }
    }
  });
});

describe('маршрут', () => {
  it('идёт по хронологии карьеры, ответвление последним', () => {
    const stops = routeStops();
    const expected = [
      ...mainRoute().map((chapter) => chapter.positionId),
      ...worldChapters.filter((chapter) => chapter.branch).map((c) => c.positionId),
    ];

    expect(stops.map((stop) => stop.positionId)).toEqual(expected);
    expect(stops.at(-1)!.branch).toBe(true);
  });

  it('у каждой остановки есть куда прийти', () => {
    for (const stop of routeStops()) {
      expect(stop.path.length, stop.positionId).toBeGreaterThanOrEqual(1);
      expect(stop.path.at(-1)).toBe(zoneOf(stop.positionId)!.arrival);
    }
  });

  it('соседние главы не дальше половины мира: перелёт остаётся перелётом', () => {
    const stops = routeStops().filter((stop) => !stop.branch);
    for (let i = 1; i < stops.length; i++) {
      const from = stops[i - 1]!.path.at(-1)!;
      const to = stops[i]!.path[0]!;
      expect(
        flat(from, to),
        `${stops[i - 1]!.positionId} → ${stops[i]!.positionId}`,
      ).toBeLessThan(60);
    }
  });

  it('путь к вершине идёт через промежуточную точку: сорок юнитов по прямой', () => {
    const path = peakPath();
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path.at(-1)).toBe(peakRoute.arrival);

    const straight = flat(peakRoute.from, peakRoute.arrival);
    expect(straight).toBeGreaterThan(30);
  });
});

describe('вход', () => {
  it('идёт не менее чем через три точки: иначе это перескок, а не пролёт', () => {
    expect(entryPath.length).toBeGreaterThanOrEqual(3);
  });

  it('заканчивается прибытием первой главы по хронологии', () => {
    const first = mainRoute()[0]!;
    expect(entryPath.at(-1)).toBe(zoneOf(first.positionId)!.arrival);
  });

  it('идёт дугой: от земли вверх и снова к земле', () => {
    const heights = entryPath.map((shot) => shot.at[1]);
    const top = Math.max(...heights);
    const topIndex = heights.indexOf(top);

    expect(topIndex).toBeGreaterThan(0);
    expect(topIndex).toBeLessThan(heights.length - 1);

    expect(top).toBeGreaterThan(heights[0]! + 5);
    expect(heights.at(-1)!).toBeLessThan(top);
  });

  it('после верхней точки только снижается: болтанки в конце нет', () => {
    const heights = entryPath.map((shot) => shot.at[1]);
    const topIndex = heights.indexOf(Math.max(...heights));

    for (let i = topIndex + 1; i < heights.length; i++) {
      expect(heights[i]!, `точка ${i} входа выше предыдущей`).toBeLessThan(
        heights[i - 1]!,
      );
    }
  });
});

describe('карманы оболочки', () => {
  it('карман строится под каждый утверждённый ракурс и под каждую стычку', () => {
    expect(worldPockets().length).toBe(allShots().length + worldBattles.length);
    expect(battlePockets().length).toBe(worldBattles.length);
  });

  it('дно кармана стычки лежит ниже её ракурса', () => {
    for (const battle of worldBattles) {
      const view = battleView(battle);
      const pocket = battlePockets().find(
        (item) => item.x === view.at[0] && item.z === view.at[2],
      );
      expect(pocket, battle.id).toBeDefined();
      expect(pocket!.floor).toBeLessThan(view.at[1]);
    }
  });

  it('дно кармана лежит ниже камеры — иначе вид вытолкнет', () => {
    for (const shot of allShots()) {
      expect(pocketOf(shot).floor).toBeLessThan(shot.at[1]);
    }
  });

  it('послабление сходит на нет дальше, чем держится полностью', () => {
    expect(POCKET_FADE).toBeGreaterThan(POCKET_RADIUS);
  });
});
