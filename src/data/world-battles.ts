import { deepFreeze } from '@/lib/freeze';

import type { WorldBattle } from '@/lib/world/battle';

/** Стычки: где на карте дерутся живые с нежитью. */

/** Рост бойца в юнитах мира — как у людей, расставленных автором карты. */
const HEIGHT = 0.117;

export const worldBattles: WorldBattle[] = deepFreeze([
  {
    /**
     * Равнина Кейлида среди упавших колонн — одна из двух площадок, что нашлись
     * на всей карте. Земля здесь плоская до миллиметра, воды нет, над головой
     * ничего: девять лучей вдоль полосы дали расхождение ноль. Фронт развёрнут
     * не поперёк взгляда, а вдоль: поперёк полоса упирается в стену развалин —
     * луч показал зазор в 5,28 юнита.
     */
    id: 'стычка-колонны',
    at: [19, 0.245, 1.4],
    slope: [0, 0],
    facing: 0,
    offset: 0,
    undead: {
      models: ['skeleton_minion', 'skeleton_warrior', 'skeleton_mage'],
      height: HEIGHT,
    },
    living: { models: ['rogue', 'knight', 'mage'], height: HEIGHT },
  },
  {
    /**
     * Вторая площадка той же равнины, в семи юнитах к северо-западу. Фронт
     * развёрнут поперёк взгляда с прибытия к «Собственным проектам»: здесь
     * полоса чистая в обе стороны, и со станции бой виден в профиль.
     */
    id: 'стычка-гниль',
    at: [15, 0.245, 7.4],
    slope: [0, 0],
    facing: 1.946,
    offset: 23,
    undead: {
      models: ['skeleton_warrior', 'skeleton_rogue', 'skeleton_mage'],
      height: HEIGHT,
    },
    living: { models: ['knight', 'barbarian', 'mage'], height: HEIGHT },
  },
  {
    /**
     * Третья площадка, ровно между двумя первыми: три с половиной юнита до
     * каждой — при радиусе стычки около 1,25 бои не сливаются, но с ракурса
     * маршрута попадают в кадр вместе, и равнина читается полем, а не двумя
     * отдельными сценами.
     */
    id: 'стычка-равнина',
    at: [17, 0.245, 4.4],
    slope: [0, 0],
    facing: 0.131,
    offset: 11,
    undead: {
      models: ['skeleton_minion', 'skeleton_rogue', 'skeleton_mage'],
      height: HEIGHT,
    },
    living: { models: ['barbarian', 'rogue', 'mage'], height: HEIGHT },
  },
]);
