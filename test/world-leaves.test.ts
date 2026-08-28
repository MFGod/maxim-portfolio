import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { DAY, DUSK } from '@/lib/world/daylight';
import {
  FALL,
  GLOW_SHARE,
  LEAF_COUNT,
  LEAF_MIN_SCALE,
  LEAF_SIZE,
  LEAF_PERIOD,
  LIFETIME,
  SPREAD_ANGLE,
  SPREAD_SPEED,
  crownsOf,
  treesOf,
} from '@/lib/world/leaves';

describe('стая листьев', () => {
  it('листьев хватает на два десятка крон, но они не застят ландшафт', () => {
    /*
     * Двадцать одна крона по замеру карты, и разлёт в два десятка юнитов от
     * каждой: меньше тысячи на всех — стая читается редкой моросью, больше
     * пяти — золото застит склон. Верхняя граница держится не кадром, а
     * вкусом: пять тысяч точек рисуются одним вызовом и почти ничего не стоят.
     */
    expect(LEAF_COUNT).toBeGreaterThan(1000);
    expect(LEAF_COUNT).toBeLessThan(5000);
  });

  it('крупный лист задаёт верх, мелкие идут вниз от него', () => {
    /*
     * Размер материала — это размер самого крупного листа: множитель в шейдере
     * не превышает единицы. Будь он серединой, часть стаи оказалась бы крупнее
     * подобранного вживую предела и полезла бы в кадр.
     */
    expect(LEAF_MIN_SCALE).toBeGreaterThan(0);
    expect(LEAF_MIN_SCALE).toBeLessThan(1);
  });

  it('мелкий лист остаётся листом, а не искрой', () => {
    /*
     * Нижняя граница — размер лежащего листа (0.0225–0.045): мельче него
     * летящий вырождается в точку, и стая перестаёт читаться листвой того же
     * дерева, что и ковёр под ним.
     */
    expect(LEAF_SIZE * LEAF_MIN_SCALE).toBeGreaterThan(0.03);
  });

  it('крупный лист не больше человеческой фигуры', () => {
    /*
     * Фигура в этом мире 0.117 юнита. Прежние 0.35 давали лист в три роста:
     * на фоне неба сравнить его было не с чем, а у земли стая читалась
     * парящими простынями рядом с мелким ковром.
     */
    const FIGURE = 0.117;

    expect(LEAF_SIZE).toBeLessThanOrEqual(FIGURE + 0.01);
  });

  it('листья расходятся на полный круг', () => {
    /*
     * Крона — источник, а не флюгер: лист уходит в свою сторону, равномерно по
     * всему кругу. Сектор вместо круга означал бы, что дерево сыплет только
     * туда, куда дует ветер, — и с другой стороны выглядело бы облысевшим.
     */
    expect(SPREAD_ANGLE).toBeCloseTo(Math.PI * 2, 6);
  });

  it('лист планирует, а не падает камнем', () => {
    // Снос должен быть одного порядка с падением: отвесное падение читается
    // дождём, а не листопадом.
    expect(FALL).toBeGreaterThan(0);
    expect(SPREAD_SPEED).toBeGreaterThan(FALL * 0.5);
    expect(SPREAD_SPEED).toBeLessThan(FALL * 4);
  });
});

describe('жизнь листа', () => {
  it('за жизнь лист успевает долететь до земли с высокой кроны', () => {
    /*
     * Кроны стоят на высоте от 4 до 20 юнитов — замер живой карты. Лист,
     * исчезающий в воздухе на полпути, читается не листом, а искрой.
     */
    const highestCrown = 20;

    expect(FALL * LIFETIME).toBeGreaterThan(highestCrown * 0.4);
  });

  it('разлёт за жизнь не уносит лист за край мира', () => {
    // Мир 120 юнитов поперёк: круг радиусом в полкарты вокруг каждой из
    // двадцати одной кроны залил бы золотом всё.
    expect(SPREAD_SPEED * LIFETIME).toBeLessThan(60);
  });

  it('период кратен времени жизни', () => {
    /*
     * На стыке круга каждый лист обязан оказаться ровно в начале своей жизни.
     * Иначе раз в десять минут вся стая перерождается разом — заметно, потому
     * что гашение на концах жизни рассчитано на одиночные перерождения.
     */
    expect(LEAF_PERIOD % LIFETIME).toBe(0);
    expect(LEAF_PERIOD / LIFETIME).toBeGreaterThan(10);
  });

  it('круг достаточно длинный, чтобы повтор не читался', () => {
    expect(LEAF_PERIOD).toBeGreaterThanOrEqual(300);
  });
});

describe('свечение листа', () => {
  it('лист светится слабее кроны', () => {
    // Полная эмиссия дерева на спрайте в треть юнита читается искрой, а не
    // листом: у листа нет объёма, которым свет держится.
    expect(GLOW_SHARE).toBeGreaterThan(0);
    expect(GLOW_SHARE).toBeLessThan(1);
  });

  it('лист заходит за порог bloom — иначе ореола нет вовсе', () => {
    /*
     * Красный канал золота `#ffa51d` — единица, и свечение прибавляется к нему
     * целиком. Порог `UnrealBloomPass` в сцене — 1.0: без превышения лист
     * просто чуть светлее, а свечения вокруг него не появится.
     */
    const BLOOM_THRESHOLD = 1;

    expect(1 + DAY.emissive.erdtree * GLOW_SHARE).toBeGreaterThan(BLOOM_THRESHOLD);
  });

  it('в сумерках лист светится ярче, чем днём', () => {
    // Свечение ведёт материал крон: лист поднимается вместе с деревьями, а не
    // живёт своим числом.
    expect(DUSK.emissive.erdtree).toBeGreaterThan(DAY.emissive.erdtree);
  });
});

describe('деревья по кронам', () => {
  /**
   * Меш светящейся листвы: три десятка вершин на квадрат, эмиссия та же, по
   * которой `treesOf` находит кроны на живой карте.
   */
  const foliage = (patches: { x: number; z: number; half: number }[]) => {
    const points: number[] = [];

    for (const patch of patches) {
      for (let x = patch.x - patch.half; x <= patch.x + patch.half; x += 0.25) {
        for (let z = patch.z - patch.half; z <= patch.z + patch.half; z += 0.25) {
          points.push(x, 10, z);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));

    const material = new THREE.MeshStandardMaterial();
    material.emissive = new THREE.Color(0xffa51d);

    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));

    return scene;
  };

  it('ячейки одной кроны собираются в одно дерево', () => {
    /*
     * Сетка рубит листву по шесть юнитов, и крона шире ячейки отдаёт несколько
     * центров. Листьям это на пользу, а пулу источников — нет: три источника
     * уходили в одно дерево, соседнее стояло тёмным.
     */
    const scene = foliage([{ x: 6, z: 4, half: 2.5 }]);

    expect(crownsOf(scene).length).toBeGreaterThan(1);
    expect(treesOf(scene)).toHaveLength(1);
  });

  it('разные деревья остаются разными', () => {
    const scene = foliage([
      { x: 6, z: 4, half: 2.5 },
      { x: 44, z: 6, half: 4 },
    ]);

    expect(treesOf(scene)).toHaveLength(2);
  });

  it('радиус меряет ширину кроны, а не ячейки', () => {
    // То, чем питается сила источника: у широкой кроны радиус больше, и золото
    // под ней ярче.
    const scene = foliage([
      { x: 6, z: 4, half: 2.5 },
      { x: 44, z: 6, half: 4 },
    ]);

    const [big, small] = treesOf(scene);

    expect(big?.radius).toBeCloseTo(4, 1);
    expect(small?.radius).toBeCloseTo(2.5, 1);
  });

  it('без светящейся листвы деревьев нет', () => {
    // Карта ещё не пришла — пул источников обязан пережить это молча.
    expect(treesOf(new THREE.Scene())).toEqual([]);
  });
});
