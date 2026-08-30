/** Порядок загрузки мира: чем занять первые секунды. */

import { INSTANCED, type InstancedName } from './assets';

/** Ориентиры: по ним мир узнаётся с первого кадра. */
export const LANDMARKS: readonly InstancedName[] = [
  'divine_tower',
  'haligtree_tower',
  'mage_tower',
  'church',
  'building_1',
  'building_2',
  'building_3',
  'building_4',
  'building_5',
  'mausoleum',
  'catacombs',
  'dungeon',
  'evergaol',
  'hero_grave',
  'cemetery_1',
  'cemetery_2',
  'cemetery_3',
  'grace',
  'arch',
  'gazebo',
  'windmill',
  'telescope',
  'teleport',
  'azula_stone',
  'caelid_statue',
  'gelmir_rock_1',
  'gelmir_rock_2',
  'mttops_rock_1',
  'mttops_rock_2',
  'map',
];

/** Волна загрузки: имя и что в неё входит. */
export type LoadWave = {
  landmarks: InstancedName[];
  scatter: InstancedName[];
};

/** Инстансы по волнам. */
export function loadWaves(): LoadWave {
  const first = new Set<string>(LANDMARKS);

  return {
    landmarks: INSTANCED.filter((name) => first.has(name)),
    scatter: INSTANCED.filter((name) => !first.has(name)),
  };
}
