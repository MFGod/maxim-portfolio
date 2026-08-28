import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyShot,
  clearShots,
  exportShots,
  listShots,
  pocketsFromShots,
  removeShot,
  saveShot,
} from '@/lib/world/dev-shots';
import { POCKET_SLACK } from '@/lib/world/shots';

/**
 * Инструмент подбора выключен флагом, но проверяется тестами: выключенный код
 * без покрытия молча гниёт и перестаёт работать ровно тогда, когда снова
 * понадобился.
 */
function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

function cameraAt(
  position: [number, number, number],
  lookAt: [number, number, number],
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(...position);
  camera.lookAt(new THREE.Vector3(...lookAt));
  return camera;
}

const target = (point: [number, number, number]) => new THREE.Vector3(...point);

describe('снимки камеры', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('сохраняет позицию камеры как есть', () => {
    const shot = saveShot(cameraAt([1.234, 5.678, -9.1], [0, 0, 0]), target([0, 0, 0]));
    expect(shot.at).toEqual([1.23, 5.68, -9.1]);
  });

  it('точку взгляда берёт по направлению камеры, а не по цели контрола', () => {
    // Цель прижата к камере, как в режиме «от первого лица»: направление в ней
    // после округления до сотых теряется полностью.
    const camera = cameraAt([0, 2, 0], [0, 2, -10]);
    const shot = saveShot(camera, target([0, 2, -0.01]));

    const distance = Math.hypot(
      shot.look[0] - shot.at[0],
      shot.look[1] - shot.at[1],
      shot.look[2] - shot.at[2],
    );

    expect(distance).toBeGreaterThan(19);
    expect(shot.look[2]).toBeLessThan(shot.at[2]);
  });

  it('нумерует по наибольшему занятому номеру, а не по длине списка', () => {
    saveShot(cameraAt([0, 1, 0], [0, 1, -5]), target([0, 1, -5]));
    saveShot(cameraAt([0, 1, 1], [0, 1, -5]), target([0, 1, -5]));
    saveShot(cameraAt([0, 1, 2], [0, 1, -5]), target([0, 1, -5]));

    removeShot('снимок-1');
    const next = saveShot(cameraAt([0, 1, 3], [0, 1, -5]), target([0, 1, -5]));

    // По длине списка вышло бы «снимок-3» — и затёрло бы существующий.
    expect(next.name).toBe('снимок-4');
    expect(listShots()).toHaveLength(3);
  });

  it('снимок с тем же именем заменяет прежний', () => {
    saveShot(cameraAt([0, 1, 0], [0, 1, -5]), target([0, 1, -5]), 'вход');
    saveShot(cameraAt([7, 8, 9], [0, 1, -5]), target([0, 1, -5]), 'вход');

    const shots = listShots();
    expect(shots).toHaveLength(1);
    expect(shots[0]!.at).toEqual([7, 8, 9]);
  });

  it('возвращает камеру в сохранённый вид', () => {
    saveShot(cameraAt([3, 4, 5], [0, 0, 0]), target([0, 0, 0]), 'вход');

    const camera = cameraAt([0, 0, 0], [0, 0, -1]);
    const look = target([0, 0, 0]);
    const shot = applyShot('вход', camera, look);

    expect(shot).not.toBeNull();
    expect(camera.position.toArray()).toEqual([3, 4, 5]);
    expect(look.toArray()).toEqual([...shot!.look]);
  });

  it('о неизвестном снимке сообщает, а не молчит', () => {
    expect(
      applyShot('нет такого', cameraAt([0, 0, 0], [0, 0, -1]), target([0, 0, 0])),
    ).toBeNull();
    expect(removeShot('нет такого')).toBe(false);
  });

  it('забывает все снимки разом', () => {
    saveShot(cameraAt([0, 1, 0], [0, 1, -5]), target([0, 1, -5]));
    saveShot(cameraAt([0, 1, 1], [0, 1, -5]), target([0, 1, -5]));

    clearShots();
    expect(listShots()).toEqual([]);
  });
});

describe('чужое хранилище', () => {
  it('мусор вместо JSON не роняет подбор', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'world.dev.shots': '{не json' }));
    expect(listShots()).toEqual([]);
  });

  it('записи чужого формата отсеиваются поштучно', () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        'world.dev.shots': JSON.stringify([
          { name: 'целый', at: [1, 2, 3], look: [4, 5, 6] },
          { name: 'без взгляда', at: [1, 2, 3] },
          { name: 'короткая точка', at: [1, 2], look: [4, 5, 6] },
          { name: 'не число', at: [1, 'два', 3], look: [4, 5, 6] },
          null,
        ]),
      }),
    );

    const shots = listShots();
    expect(shots).toHaveLength(1);
    expect(shots[0]!.name).toBe('целый');
  });

  it('недоступное хранилище не роняет сохранение', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const shot = saveShot(cameraAt([1, 2, 3], [0, 0, 0]), target([0, 0, 0]));
    expect(shot.at).toEqual([1, 2, 3]);
  });

  it('на сервере хранилища нет вовсе — список пуст', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(listShots()).toEqual([]);
  });
});

describe('выгрузка в данные', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('печатает строку, готовую к вставке', () => {
    saveShot(cameraAt([1, 2, 3], [1, 2, -17]), target([1, 2, -17]), 'вход');
    expect(exportShots()).toBe("  { id: 'вход', at: [1, 2, 3], look: [1, 2, -17] },");
  });

  it('апостроф в имени не рвёт литерал', () => {
    saveShot(cameraAt([0, 1, 0], [0, 1, -5]), target([0, 1, -5]), "у Древа's");
    expect(exportShots()).toContain("id: 'у Древа\\'s'");
  });
});

describe('карманы от несохранённых снимков', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
  });

  it('дно кармана ниже камеры ровно на общий запас', () => {
    saveShot(cameraAt([4, 3, 2], [4, 3, -10]), target([4, 3, -10]), 'вход');

    const [pocket] = pocketsFromShots();
    expect(pocket!.x).toBe(4);
    expect(pocket!.z).toBe(2);
    expect(pocket!.floor).toBeCloseTo(3 - POCKET_SLACK, 5);
  });
});
