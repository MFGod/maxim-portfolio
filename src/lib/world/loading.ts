/**
 * Порядок загрузки мира: чем занять первые секунды.
 *
 * Мир весит около тридцати четырёх мегабайт, и двадцать из них — сама карта.
 * Дожидаться всего до первого кадра значит держать посетителя на полосе
 * загрузки, пока приедет последний куст: файлов инстансов две сотни, и каждый
 * из них ничего не решает по отдельности.
 *
 * Отсюда две волны. Сначала рельеф и то, по чему мир узнаётся, — башня,
 * церковь, замки, благодати: с ними кадр уже читается местом, и по нему можно
 * идти. Следом россыпь — деревья, кусты, утварь: она достраивается на глазах и
 * ничего не ломает своим опозданием.
 *
 * Разбиение здесь, а не в сцене, потому что это список: его правят, когда в
 * карту добавляют объект, и тест следит, чтобы новое имя не потерялось между
 * волнами.
 */

import { INSTANCED, type InstancedName } from './assets';

/**
 * Ориентиры: по ним мир узнаётся с первого кадра.
 *
 * Отбор по роли в кадре, а не по весу файла. Башня видна с любой точки карты,
 * благодать отмечает главу карьеры, замок держит силуэт Лейндела — без них
 * рельеф читается пустой болванкой, и посетитель не понимает, куда попал.
 */
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

/**
 * Инстансы по волнам.
 *
 * Россыпь считается вычитанием, а не вторым списком: два перечня разошлись бы
 * на первом же добавленном объекте, и он либо потерялся бы, либо приехал
 * дважды.
 */
export function loadWaves(): LoadWave {
  const first = new Set<string>(LANDMARKS);

  return {
    landmarks: INSTANCED.filter((name) => first.has(name)),
    scatter: INSTANCED.filter((name) => !first.has(name)),
  };
}
