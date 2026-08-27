import { deepFreeze } from '@/lib/freeze';

/**
 * Фигуры мира: кто где стоит.
 *
 * Расстановка — данные, а не код в сцене (решение D4): координаты подбираются
 * вживую инструментом `window.__world.figures`, выгружаются им же готовым
 * куском и вставляются сюда. Тест сверяет каждую запись, чтобы опечатка в
 * координате не всплыла кадром в проде.
 *
 * Модели — CC0 из наборов KayKit (Kay Lousberg): четыре скелета (воин,
 * разбойник, маг, миньон) и четверо живых (рыцарь, варвар, разбойник, маг).
 * Каждая обрезана до пяти-шести анимаций и весит 230–280 КБ. Все восемь сидят
 * на одном риге в 41 кость и делят один атлас — смешивать их ничего не стоит.
 */

/** Файлы моделей. Ключ — то, что пишется в `model` у фигуры. */
export const FIGURE_MODELS = {
  skeleton_warrior: 'figures/skeleton_warrior.glb',
  skeleton_rogue: 'figures/skeleton_rogue.glb',
  skeleton_mage: 'figures/skeleton_mage.glb',
  skeleton_minion: 'figures/skeleton_minion.glb',
  knight: 'figures/knight.glb',
  barbarian: 'figures/barbarian.glb',
  rogue: 'figures/rogue.glb',
  mage: 'figures/mage.glb',
  dragon: 'figures/dragon.glb',
  dragon_elder: 'figures/dragon_elder.glb',
  dragon_wyvern: 'figures/dragon_wyvern.glb',
} as const;

export type FigureModel = keyof typeof FIGURE_MODELS;

/**
 * Анимации, оставленные в моделях. Остальные вырезаны: у скелета они весили
 * 4,4 МБ из 4,64, а миру нужны стойка, шаг и пара поз на месте.
 *
 * Десять поз общие у людей и у нежити, три — только у скелетов, две — у
 * дракона. Тип общий на всех, а `figures.ts` подставляет `Idle`, если модель
 * запрошенного клипа не знает: иначе фигура застывает в T-позе.
 *
 * Отдельный набор KayKit Character Animations на 133 клипа не качался: те же
 * клипы уже лежат в самих моделях (у скелета их 95, у человека 76), и вопрос
 * был только в том, сколько оставить при обрезке.
 */
export const FIGURE_CLIPS = [
  // Есть у всех людей и у нежити.
  'Idle',
  'Walking_A',
  'Cheer',
  'Interact',
  'PickUp',
  'Sit_Floor_Idle',
  'Lie_Idle',
  'Blocking',
  'Spellcasting',
  'Death_A_Pose',
  // Только у нежити.
  'Taunt',
  'Skeleton_Inactive_Standing_Pose',
  'Skeletons_Awaken_Standing',
  // Только у драконов.
  'Dragon_Flying',
  'Dragon_Attack',
  'Fast_Flying',
  'Flying_Idle',
] as const;

export type FigureClip = (typeof FIGURE_CLIPS)[number];

/**
 * Разумные пределы высоты фигуры **в юнитах мира**. Масштаб модели считается
 * от неё, а не задаётся множителем: у этой карты нет честного метра — дерево
 * 0,28 юнита, горшок 0,0765, надгробие 0,3, — и множитель ничего не сказал бы.
 */
export const MIN_FIGURE_HEIGHT = 0.02;
export const MAX_FIGURE_HEIGHT = 0.4;

export type WorldFigure = {
  /** Своё имя. Должно быть уникальным: по нему фигура ищется в инструменте. */
  id: string;
  model: FigureModel;
  clip: FigureClip;
  /** Точка в мировых координатах: X, Y, Z. Y — где стоят ступни. */
  at: readonly [number, number, number];
  /** Поворот вокруг вертикали, радианы. */
  turn: number;
  /** Высота фигуры в юнитах мира. */
  height: number;
};

/**
 * Одиночки: дозорные на башнях и стража у пещер.
 *
 * Башни — `mage_tower`, три штуки, разнесённые по карте; высота верхушки снята
 * лучом сверху по постройкам (`dropAt(x, z, 'props')`).
 * Пещеры — входы `dungeon`; у каждого по паре, смотрят друг на друга поперёк
 * входа. Из тридцати шести входов выбраны два, у которых площадка по обе
 * стороны ровная: у остальных перепад доходит до половины юнита, и пара стояла
 * бы на разной высоте.
 *
 * Рост 0,117 — не выдуманный: столько у людей, которых автор карты уже
 * расставил по миру (материал `Person 1`).
 *
 * Идущие группы живут отдельно, в `world-patrols.ts`.
 */
/**
 * Одиночки мира: дозорные на башнях, стража у входов и люди у костров.
 *
 * Расстановка снята с самой карты, а не придумана: башни — это все двенадцать
 * `mage_tower`, входы — `dungeon` и `catacombs`, лагеря — костры
 * `firestand`. Для каждой точки проверено три вещи: земля под ногами (луч
 * сверху по геометрии, а не сетка оболочки — та висит над рельефом), свободное
 * место (след ближайшего инстанса, иначе фигура стоит внутри телеги) и ровность
 * площадки для пары у входа — иначе стражи стоят на разной высоте.
 *
 * Рост 0,117 — как у людей, которых автор карты расставил сам (`Person 1`).
 *
 * Идущие группы живут отдельно, в `world-patrols.ts`.
 */
/**
 * Одиночки мира: дозорные на башнях, стража у входов и люди у костров.
 *
 * Расстановка снята с самой карты, а не придумана: башни — это все двенадцать
 * `mage_tower`, входы — `dungeon` и `catacombs`, лагеря — костры
 * `firestand`. Для каждой точки проверено три вещи: земля под ногами (луч
 * сверху по геометрии, а не сетка оболочки — та висит над рельефом), свободное
 * место (след ближайшего инстанса, иначе фигура стоит внутри телеги) и ровность
 * площадки для пары у входа — иначе стражи стоят на разной высоте.
 *
 * Рост 0,117 — как у людей, которых автор карты расставил сам (`Person 1`).
 *
 * Идущие группы живут отдельно, в `world-patrols.ts`.
 */
/**
 * Население мира: дозорные на башнях, стража у входов, люди в лагерях и у
 * построек. Сто сорок фигур, расставленных по самой карте, а не на глаз.
 *
 * Точки взяты у авторских объектов: башни — все двенадцать `mage_tower`;
 * входы — `dungeon`, `catacombs`, `hero_grave`, `evergaol`; лагеря —
 * костры и палатки; замки — дома, церкви, беседки, мавзолеи, башни Халигдрева.
 *
 * Каждая точка проверена тремя замерами:
 *
 * 1. **Земля — верхнее попадание луча по рельефу.** Не сетка оболочки: та
 *    висит над рельефом (медиана 0,65 по замеру автора карты). И не «ярус,
 *    ближайший к оценке сетки»: у террас он промахивается мимо видимой
 *    поверхности, и фигура уходила в склон на три юнита.
 * 2. **Свободное место.** След ближайшего инстанса (7625 объектов, круг в 0,45
 *    габарита) — иначе страж стоит внутри телеги.
 * 3. **Ровность площадки** для пары у входа: перепад между стражами больше
 *    четырёх сантиметров — вход пропускается.
 *
 * Рост 0,117 — как у людей, которых автор карты расставил сам (`Person 1`).
 *
 * Идущие группы живут отдельно, в `world-patrols.ts`.
 */
/**
 * Население мира: дозорные на башнях, стража у входов, люди в лагерях и у
 * построек. Сто двадцать пять фигур, снятых с самой карты, а не расставленных
 * на глаз. Идущие группы живут отдельно, в \`world-patrols.ts\`.
 *
 * Точки берутся у авторских объектов: \`mage_tower\` — башни; \`dungeon\`,
 * \`catacombs\`, \`hero_grave\`, \`evergaol\` — входы; костры и палатки —
 * лагеря; дома, церкви, беседки, мавзолеи, Божественные башни — замки.
 *
 * Каждую точку проверяет \`dev-crowd.ts\` тремя замерами: земля по верхнему
 * попаданию луча (сетка оболочки висит над рельефом, а «ярус ближе к её
 * оценке» у террас промахивается и топит фигуру), свободное место по следу
 * инстансов и ровность площадки под ногами.
 *
 * У входа стража стоит парой, когда по обе стороны ровно, и одиночкой, когда
 * вход врезан в склон: из 66 входов пар нашлось четыре.
 *
 * Рост 0,117 — как у людей, которых автор карты расставил сам (\`Person 1\`).
 */
/**
 * Население мира: дозорные на башнях, стража у входов, люди в лагерях и у
 * построек. Точки сняты с карты инструментом \`dev-crowd.ts\`, который
 * проверяет каждую пятью замерами:
 *
 * 1. **Земля — верх рельефа** (луч сверху). Сетка оболочки висит над рельефом,
 *    а «ярус ближе к её оценке» у террас промахивается и топит фигуру.
 * 2. **Место свободно** — след ближайшего инстанса.
 * 3. **Площадка ровная** — рельеф вокруг не поднимается выше роста.
 * 4. **Это ходовая земля, а не крыша.** Замки в карте — часть рельефа, и без
 *    этой проверки фигура забиралась на шпиль.
 * 5. **Вокруг открыто** — минимум пять румбов из восьми. Иначе фигура стоит в
 *    нише лицом в стену. Направление взгляда берётся оттуда же: в самую
 *    открытую сторону, а не «на объект, у которого поставили».
 *
 * Поза выбирается по месту, а не случайно: на башнях стоят и колдуют, у входов
 * держат щит, в лагерях сидят у костра, у построек несут службу.
 *
 * Рост 0,117 — как у людей, которых автор карты расставил сам (\`Person 1\`).
 * Идущие группы и драконы живут отдельно, в \`world-patrols.ts\`.
 */
export const worldFigures: WorldFigure[] = deepFreeze([
  {
    id: 'башня-1',
    model: 'skeleton_mage',
    clip: 'Spellcasting',
    at: [-1.51, 1.229, 21.773],
    turn: 2.751,
    height: 0.117,
  },
  {
    id: 'башня-2',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [19.546, 1.83, -1.299],
    turn: 2.865,
    height: 0.117,
  },
  {
    id: 'башня-3',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-33.584, 2.561, -6.074],
    turn: 4.944,
    height: 0.117,
  },
  {
    id: 'башня-4',
    model: 'skeleton_mage',
    clip: 'Spellcasting',
    at: [-35.128, 2.851, 0.777],
    turn: 2.307,
    height: 0.117,
  },
  {
    id: 'башня-5',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-30.765, 2.225, -19.503],
    turn: 4.779,
    height: 0.117,
  },
  {
    id: 'башня-6',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-18.851, 3.12, -22.632],
    turn: 6.858,
    height: 0.117,
  },
  {
    id: 'башня-7',
    model: 'skeleton_mage',
    clip: 'Spellcasting',
    at: [-31.161, 3.78, -29.464],
    turn: 7.365,
    height: 0.117,
  },
  {
    id: 'башня-8',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-31.564, 3.582, -26.638],
    turn: -3.517,
    height: 0.117,
  },
  {
    id: 'башня-9',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-32.13, 3.854, -27.964],
    turn: 1.706,
    height: 0.117,
  },
  {
    id: 'башня-10',
    model: 'skeleton_mage',
    clip: 'Spellcasting',
    at: [-16.441, 6.502, -35.142],
    turn: 1.82,
    height: 0.117,
  },
  {
    id: 'башня-11',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [20.712, 11.988, -46.613],
    turn: 0.362,
    height: 0.117,
  },
  {
    id: 'башня-12',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [12.136, 9.192, -43.531],
    turn: 5.192,
    height: 0.117,
  },
  {
    id: 'вход-1-1',
    model: 'skeleton_warrior',
    clip: 'Taunt',
    at: [-5.631, 1.23, 3.398],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'вход-2-1',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-10.19, 1.239, 10.57],
    turn: 0,
    height: 0.117,
  },
  {
    id: 'вход-3-1',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-5.471, 1.045, 9.455],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'вход-4-1',
    model: 'skeleton_warrior',
    clip: 'Taunt',
    at: [-11.682, 1.018, 13.538],
    turn: 0,
    height: 0.117,
  },
  {
    id: 'вход-5-1',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-7.643, 0.749, 10.461],
    turn: 6.286,
    height: 0.117,
  },
  {
    id: 'вход-6-1',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [1.66, 1.413, 3.56],
    turn: 0,
    height: 0.117,
  },
  {
    id: 'вход-7-1',
    model: 'skeleton_warrior',
    clip: 'Taunt',
    at: [3.506, 1.442, 6.977],
    turn: -3.535,
    height: 0.117,
  },
  {
    id: 'вход-8-1',
    model: 'skeleton_warrior',
    clip: 'Blocking',
    at: [-7.425, 0.867, 14.547],
    turn: -0.786,
    height: 0.117,
  },
  {
    id: 'вход-8-2',
    model: 'skeleton_minion',
    clip: 'Blocking',
    at: [-7.591, 0.126, 14.596],
    turn: 0.391,
    height: 0.117,
  },
  {
    id: 'вход-9-1',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-12.04, 0.312, 15.67],
    turn: -3.14,
    height: 0.117,
  },
  {
    id: 'вход-10-1',
    model: 'skeleton_warrior',
    clip: 'Taunt',
    at: [-10.331, 0.536, 20.937],
    turn: 1.177,
    height: 0.117,
  },
  {
    id: 'вход-11-1',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-8.056, 8.088, -27.679],
    turn: 3.142,
    height: 0.117,
  },
  {
    id: 'вход-12-1',
    model: 'skeleton_warrior',
    clip: 'Blocking',
    at: [-23.873, 6.647, -37.338],
    turn: -0.002,
    height: 0.117,
  },
  {
    id: 'вход-12-2',
    model: 'skeleton_minion',
    clip: 'Blocking',
    at: [-24.105, 6.647, -37.361],
    turn: -0.395,
    height: 0.117,
  },
  {
    id: 'вход-13-1',
    model: 'skeleton_warrior',
    clip: 'Blocking',
    at: [-23.795, 8.293, -40.45],
    turn: -0.79,
    height: 0.117,
  },
  {
    id: 'вход-13-2',
    model: 'skeleton_minion',
    clip: 'Blocking',
    at: [-23.967, 8.293, -40.664],
    turn: 1.574,
    height: 0.117,
  },
  {
    id: 'вход-14-1',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [21.6, 11.382, -46.258],
    turn: 2.356,
    height: 0.117,
  },
  {
    id: 'вход-15-1',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [13.233, 8.989, -44.809],
    turn: 2.356,
    height: 0.117,
  },
  {
    id: 'вход-16-1',
    model: 'skeleton_warrior',
    clip: 'Taunt',
    at: [5.68, 8.882, -40.72],
    turn: 0.79,
    height: 0.117,
  },
  {
    id: 'вход-17-1',
    model: 'skeleton_warrior',
    clip: 'Blocking',
    at: [-5.38, 1.045, 6.6],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'вход-17-2',
    model: 'skeleton_minion',
    clip: 'Blocking',
    at: [-5.38, 1.044, 6.32],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'вход-18-1',
    model: 'skeleton_warrior',
    clip: 'Idle',
    at: [-7.22, 1.764, 3.93],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'вход-19-1',
    model: 'skeleton_warrior',
    clip: 'Taunt',
    at: [-11.18, 1.736, 10.28],
    turn: 0,
    height: 0.117,
  },
  {
    id: 'лагерь-1',
    model: 'rogue',
    clip: 'Sit_Floor_Idle',
    at: [-8.145, 1.024, 9.282],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-2',
    model: 'barbarian',
    clip: 'Sit_Floor_Idle',
    at: [-5.789, 1.024, 11.127],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-3',
    model: 'knight',
    clip: 'Idle',
    at: [-11.861, 2.021, 7.04],
    turn: 2.356,
    height: 0.117,
  },
  {
    id: 'лагерь-4',
    model: 'mage',
    clip: 'Sit_Floor_Idle',
    at: [-5.949, 1.02, 8.378],
    turn: -3.148,
    height: 0.117,
  },
  {
    id: 'лагерь-5',
    model: 'rogue',
    clip: 'Cheer',
    at: [-9.66, 0.825, 24.84],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-6',
    model: 'barbarian',
    clip: 'Idle',
    at: [-4.742, 1.105, 21.67],
    turn: 2.356,
    height: 0.117,
  },
  {
    id: 'лагерь-7',
    model: 'rogue',
    clip: 'Sit_Floor_Idle',
    at: [-5.409, 0.829, 23.159],
    turn: 2.356,
    height: 0.117,
  },
  {
    id: 'лагерь-8',
    model: 'barbarian',
    clip: 'Sit_Floor_Idle',
    at: [-2.792, 0.559, 20.568],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-9',
    model: 'knight',
    clip: 'Idle',
    at: [-5.659, 1.478, 27.548],
    turn: 2.36,
    height: 0.117,
  },
  {
    id: 'лагерь-10',
    model: 'mage',
    clip: 'Sit_Floor_Idle',
    at: [-6.118, 1.441, 28.41],
    turn: 0.79,
    height: 0.117,
  },
  {
    id: 'лагерь-11',
    model: 'rogue',
    clip: 'Cheer',
    at: [16.05, 2.438, 3.15],
    turn: 0.79,
    height: 0.117,
  },
  {
    id: 'лагерь-12',
    model: 'barbarian',
    clip: 'Idle',
    at: [3.053, 1.766, 2.243],
    turn: 3.142,
    height: 0.117,
  },
  {
    id: 'лагерь-13',
    model: 'rogue',
    clip: 'Sit_Floor_Idle',
    at: [7.108, 2.046, -0.476],
    turn: 1.969,
    height: 0.117,
  },
  {
    id: 'лагерь-14',
    model: 'barbarian',
    clip: 'Sit_Floor_Idle',
    at: [16.175, 0.911, 14.185],
    turn: -1.967,
    height: 0.117,
  },
  {
    id: 'лагерь-15',
    model: 'knight',
    clip: 'Idle',
    at: [16.714, 0.911, 13.537],
    turn: -0.786,
    height: 0.117,
  },
  {
    id: 'лагерь-16',
    model: 'mage',
    clip: 'Sit_Floor_Idle',
    at: [17.439, 1.021, 14.235],
    turn: -2.362,
    height: 0.117,
  },
  {
    id: 'лагерь-17',
    model: 'rogue',
    clip: 'Cheer',
    at: [17.709, 1.206, 12.575],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-18',
    model: 'barbarian',
    clip: 'Idle',
    at: [-19.236, 2.404, -2.502],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-19',
    model: 'rogue',
    clip: 'Sit_Floor_Idle',
    at: [-20.126, 2.244, -2.627],
    turn: -2.36,
    height: 0.117,
  },
  {
    id: 'лагерь-20',
    model: 'barbarian',
    clip: 'Sit_Floor_Idle',
    at: [-19.682, 2.725, -5.301],
    turn: 0.391,
    height: 0.117,
  },
  {
    id: 'лагерь-21',
    model: 'knight',
    clip: 'Idle',
    at: [-24.733, 2.746, -24.434],
    turn: -0.788,
    height: 0.117,
  },
  {
    id: 'лагерь-22',
    model: 'mage',
    clip: 'Sit_Floor_Idle',
    at: [-23.778, 2.868, -24.722],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-23',
    model: 'rogue',
    clip: 'Cheer',
    at: [-29.25, 4.35, -13.42],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-24',
    model: 'barbarian',
    clip: 'Idle',
    at: [-30.769, 4.586, -12.742],
    turn: 1.177,
    height: 0.117,
  },
  {
    id: 'лагерь-25',
    model: 'rogue',
    clip: 'Sit_Floor_Idle',
    at: [-18.5, 6.635, -38.518],
    turn: -0.79,
    height: 0.117,
  },
  {
    id: 'лагерь-26',
    model: 'barbarian',
    clip: 'Sit_Floor_Idle',
    at: [-17.953, 6.512, -39.236],
    turn: -0.79,
    height: 0.117,
  },
  {
    id: 'лагерь-27',
    model: 'knight',
    clip: 'Idle',
    at: [-17.087, 6.509, -38.923],
    turn: 0.79,
    height: 0.117,
  },
  {
    id: 'лагерь-28',
    model: 'mage',
    clip: 'Sit_Floor_Idle',
    at: [-17.245, 6.756, -39.192],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-29',
    model: 'rogue',
    clip: 'Cheer',
    at: [-26.862, 6.209, -31.854],
    turn: 1.574,
    height: 0.117,
  },
  {
    id: 'лагерь-30',
    model: 'barbarian',
    clip: 'Idle',
    at: [-19.559, 6.319, -30.035],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-31',
    model: 'rogue',
    clip: 'Sit_Floor_Idle',
    at: [-18.41, 6.743, -30.82],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-32',
    model: 'barbarian',
    clip: 'Sit_Floor_Idle',
    at: [-22.209, 6.713, -32.149],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-33',
    model: 'knight',
    clip: 'Idle',
    at: [-21.727, 7.006, -33.991],
    turn: -5.504,
    height: 0.117,
  },
  {
    id: 'лагерь-34',
    model: 'mage',
    clip: 'Sit_Floor_Idle',
    at: [-29.856, 7.272, -36.991],
    turn: -0.79,
    height: 0.117,
  },
  {
    id: 'лагерь-35',
    model: 'rogue',
    clip: 'Cheer',
    at: [-24.016, 7.527, -33.966],
    turn: -1.181,
    height: 0.117,
  },
  {
    id: 'лагерь-36',
    model: 'barbarian',
    clip: 'Idle',
    at: [-20.761, 6.797, -38.547],
    turn: 4.327,
    height: 0.117,
  },
  {
    id: 'лагерь-37',
    model: 'rogue',
    clip: 'Sit_Floor_Idle',
    at: [3.1, 1.531, 4.15],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-38',
    model: 'barbarian',
    clip: 'Sit_Floor_Idle',
    at: [4.282, 1.264, 5.924],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'лагерь-39',
    model: 'knight',
    clip: 'Idle',
    at: [11.95, 0.611, 14.064],
    turn: 1.576,
    height: 0.117,
  },
  {
    id: 'лагерь-40',
    model: 'mage',
    clip: 'Sit_Floor_Idle',
    at: [16.09, 0.692, 12.81],
    turn: -3.14,
    height: 0.117,
  },
  {
    id: 'лагерь-41',
    model: 'rogue',
    clip: 'Cheer',
    at: [6.917, 1.264, 4.509],
    turn: -0.79,
    height: 0.117,
  },
  {
    id: 'лагерь-42',
    model: 'barbarian',
    clip: 'Idle',
    at: [-25.878, 2.546, -1.957],
    turn: 0.784,
    height: 0.117,
  },
  {
    id: 'лагерь-43',
    model: 'rogue',
    clip: 'Sit_Floor_Idle',
    at: [-21.067, 2.774, -14.25],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'замок-1',
    model: 'knight',
    clip: 'Blocking',
    at: [12.27, 0.943, 6.599],
    turn: 3.142,
    height: 0.117,
  },
  {
    id: 'замок-2',
    model: 'mage',
    clip: 'Spellcasting',
    at: [11.904, 0.623, 5],
    turn: -1.963,
    height: 0.117,
  },
  {
    id: 'замок-3',
    model: 'barbarian',
    clip: 'Idle',
    at: [7.947, 9.316, -46.501],
    turn: 1.177,
    height: 0.117,
  },
  {
    id: 'замок-4',
    model: 'knight',
    clip: 'Idle',
    at: [8.669, 9.435, -47.445],
    turn: -0.395,
    height: 0.117,
  },
  {
    id: 'замок-5',
    model: 'rogue',
    clip: 'Idle',
    at: [8.2, 9.377, -47.304],
    turn: -1.969,
    height: 0.117,
  },
  {
    id: 'замок-6',
    model: 'knight',
    clip: 'Blocking',
    at: [12.351, 0.817, 4.6],
    turn: 6.286,
    height: 0.117,
  },
  {
    id: 'замок-7',
    model: 'mage',
    clip: 'Spellcasting',
    at: [9.694, 9.479, -47.018],
    turn: -0.786,
    height: 0.117,
  },
  {
    id: 'замок-8',
    model: 'barbarian',
    clip: 'Idle',
    at: [-9.563, 1.393, 13.508],
    turn: -3.539,
    height: 0.117,
  },
  {
    id: 'замок-9',
    model: 'knight',
    clip: 'Idle',
    at: [-7.5, 1.116, 17.32],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'замок-10',
    model: 'rogue',
    clip: 'Idle',
    at: [1.755, 1.657, 2.061],
    turn: 3.93,
    height: 0.117,
  },
  {
    id: 'замок-11',
    model: 'knight',
    clip: 'Blocking',
    at: [14.152, 1.502, 5.712],
    turn: 2.356,
    height: 0.117,
  },
  {
    id: 'замок-12',
    model: 'mage',
    clip: 'Spellcasting',
    at: [-18.518, 2.686, 2.683],
    turn: 4.323,
    height: 0.117,
  },
  {
    id: 'замок-13',
    model: 'barbarian',
    clip: 'Idle',
    at: [-22.7, 3.809, -24.05],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'замок-14',
    model: 'knight',
    clip: 'Idle',
    at: [-18.093, 6.729, -33.899],
    turn: 4.321,
    height: 0.117,
  },
  {
    id: 'замок-15',
    model: 'rogue',
    clip: 'Idle',
    at: [-14.497, 7.942, -31.343],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'замок-16',
    model: 'knight',
    clip: 'Blocking',
    at: [16.289, 12.874, -35.463],
    turn: 2.356,
    height: 0.117,
  },
  {
    id: 'замок-17',
    model: 'mage',
    clip: 'Spellcasting',
    at: [24.738, 11.382, -43.02],
    turn: 3.142,
    height: 0.117,
  },
  {
    id: 'замок-18',
    model: 'barbarian',
    clip: 'Idle',
    at: [-22.51, 2.197, -2.98],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'замок-19',
    model: 'knight',
    clip: 'Idle',
    at: [-20.769, 2.197, -5.222],
    turn: -1.568,
    height: 0.117,
  },
  {
    id: 'замок-20',
    model: 'rogue',
    clip: 'Idle',
    at: [-23.125, 2.197, -4.672],
    turn: 0.391,
    height: 0.117,
  },
  {
    id: 'замок-21',
    model: 'knight',
    clip: 'Blocking',
    at: [-22.345, 2.211, -8.246],
    turn: 1.57,
    height: 0.117,
  },
  {
    id: 'замок-22',
    model: 'mage',
    clip: 'Spellcasting',
    at: [-27.803, 2.197, -7.19],
    turn: -0.002,
    height: 0.117,
  },
  {
    id: 'замок-23',
    model: 'barbarian',
    clip: 'Idle',
    at: [-29.862, 2.197, -10.956],
    turn: -0.395,
    height: 0.117,
  },
  {
    id: 'замок-24',
    model: 'knight',
    clip: 'Idle',
    at: [-32.673, 2.197, -8.984],
    turn: 2.749,
    height: 0.117,
  },
  {
    id: 'замок-25',
    model: 'rogue',
    clip: 'Idle',
    at: [-25.526, 2.197, -12.997],
    turn: 0.391,
    height: 0.117,
  },
  {
    id: 'замок-26',
    model: 'knight',
    clip: 'Blocking',
    at: [-32.288, 2.197, -15.831],
    turn: 0.784,
    height: 0.117,
  },
  {
    id: 'замок-27',
    model: 'mage',
    clip: 'Spellcasting',
    at: [-30.114, 2.197, -17.784],
    turn: 0.391,
    height: 0.117,
  },
  {
    id: 'замок-28',
    model: 'barbarian',
    clip: 'Idle',
    at: [-35.025, 3.138, -1.444],
    turn: 3.142,
    height: 0.117,
  },
]);
