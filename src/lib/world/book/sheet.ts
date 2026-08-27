/**
 * Листающийся лист книги: плоскость на цепочке костей.
 *
 * Вынесен из сборки книги отдельным файлом ради одного: он единственный узел,
 * где ошибка не видна ни типам, ни глазу на статичном кадре. Здесь она уже была
 * — и стоила всей анимации переворота.
 *
 * `new THREE.Skeleton(bones)` без готовых обратных матриц зовёт
 * `calculateInverses()`, а тот копирует `bones[i].matrixWorld` и обращает его.
 * Если мировые матрицы костей ещё не считались, они единичные — и поза привязки
 * объявляет все кости стоящими в начале координат, хотя каждая сдвинута на шаг.
 * Лист от этого растягивался почти вдвое в покое и комкался вчетверо в середине
 * переворота: анимация шла, но читать в ней было нечего.
 *
 * Поэтому `updateMatrixWorld` до создания скелета — не предосторожность, а
 * условие работы. Тест сторожит ширину листа в покое и в движении.
 */

import * as THREE from 'three';

import { requireAttribute } from './attributes';
import { pageProfile } from './profile';
import { BONES, SEGMENTS, flipRotations, pageSkin } from './skin';

export type SheetOptions = {
  /** Ширина листа от корешка к внешнему краю. */
  width: number;
  height: number;
  /** Высота лежащей страницы у внешнего края — та же, что у половин книги. */
  lift: number;
  /** Провал бумаги в жёлоб у корешка — тот же, что у лежащих страниц. */
  dip: number;
  /**
   * Отступ бумаги от корешка — тот же, что у лежащих страниц.
   *
   * Без него лист шире страницы и накрывает половину жёлоба вместе со швом.
   * В конце переворота лист пропадает, и эта полоска разом меняется с бумаги на
   * тёмный шов — правый край левой страницы дёргается.
   */
  inset: number;
  /**
   * Просвет над лежащей бумагой: насколько лист идёт выше страницы под ним.
   *
   * Приходит снаружи, как и остальная геометрия: величина подобрана и живёт
   * среди прочих подобранных в `metrics.ts`, а лист собирается из того, что
   * ему дали.
   */
  clearance: number;
  /** Наклон половины раскрытой книги. Лист садится на наклонную стопку. */
  tilt: number;
  /** Материалы лица и изнанки. Изнанка получит геометрию с зеркальными UV. */
  front: THREE.Material;
  back: THREE.Material;
};

export type Sheet = {
  /** Узел листа. Добавляется в книгу; корешок в его начале координат. */
  root: THREE.Object3D;
  front: THREE.SkinnedMesh;
  back: THREE.SkinnedMesh;
  /** Раскладывает долю переворота от 0 до 1 по костям. */
  setProgress: (progress: number) => void;
  setVisible: (visible: boolean) => void;
  /**
   * Пересчитывает сферы отсечения по текущей позе.
   *
   * `SkinnedMesh.raycast` отбраковывает по `boundingSphere`, а её считают один
   * раз по позе привязки. Пока лист гнётся, она устаревает, и луч перестаёт в
   * него попадать ровно в середине переворота.
   */
  refreshBounds: () => void;
  dispose: () => void;
};

export function createSheet({
  width,
  height,
  lift,
  dip,
  inset,
  clearance,
  tilt,
  front,
  back,
}: SheetOptions): Sheet {
  const root = new THREE.Object3D();

  /*
   * Бумага занимает не всю ширину: у корешка она начинается с `inset`, как и
   * лежащие страницы. Шарнир при этом остаётся в нуле — кости считают от
   * корешка, а не от края бумаги.
   */
  const paperWidth = width - inset;
  const geometry = new THREE.PlaneGeometry(paperWidth, height, SEGMENTS, 1);
  geometry.translate(inset + paperWidth / 2, 0, 0);

  /*
   * Привязку считаем по расстоянию от корешка, а не от центра плоскости:
   * `vertexBinding` ждёт координату от середины пролёта шириной `width`, и
   * вершина с абсолютной координатой `x` отвечает середине при `x − width / 2`.
   */
  const placed = requireAttribute(geometry, 'position').array;
  const fromHinge = new Float32Array(placed.length);
  for (let index = 0; index < placed.length; index += 3) {
    fromHinge[index] = (placed[index] ?? 0) - width / 2;
  }
  const skin = pageSkin(fromHinge, width, BONES);
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skin.index, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skin.weight, 4));

  /*
   * Геометрия изнанки: та же, но с зеркальными UV. На изнанку смотрят с −Z, и
   * локальная ось x идёт оттуда влево — с теми же UV текст выходил зеркальным.
   */
  const backGeometry = geometry.clone();
  const backUv = requireAttribute(backGeometry, 'uv');
  for (let index = 0; index < backUv.count; index++) {
    backUv.setX(index, 1 - backUv.getX(index));
  }
  backUv.needsUpdate = true;

  const bones: THREE.Bone[] = [];
  for (let index = 0; index < BONES; index++) {
    const bone = new THREE.Bone();
    if (index === 0) root.add(bone);
    else {
      bone.position.x = width / BONES;
      bones[index - 1]!.add(bone);
    }
    bones.push(bone);
  }

  // Обязательно до `Skeleton`: иначе обратные матрицы считаются по единичным
  // мировым, и поза привязки оказывается ложной. См. заголовок файла.
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  const attach = (source: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.SkinnedMesh(source, material);
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton);
    return mesh;
  };

  const frontMesh = attach(geometry, front);
  const backMesh = attach(backGeometry, back);

  /**
   * Кладёт лист по профилю той стопки, на которой он сейчас.
   *
   * Плоский лист садился на страницу, у которой бумага провалена в жёлоб, и в
   * момент подмены разворота она проваливалась разом — переворот заканчивался
   * рывком. Профиль тот же, что у лежащей страницы: полный подъём у внешнего
   * края, `lift − dip` у корешка.
   *
   * Множитель `1 − 2·доля` держит оба конца точно. Поворот на −π обращает знак
   * локальной z, а расстояние до корешка `|x|` при этом сохраняется — значит
   * профиль, взятый со знаком минус, после поворота ложится ровно тем же
   * профилем на вторую стопку. Посередине лист стоит вертикально, и его
   * собственная высота там равна нулю: смещать нечего.
   */
  function applyProfile(progress: number) {
    /*
     * Знак просвета следует за шарниром, а не за долей.
     *
     * Из-за выгиба приспинная часть листа поворачивается много позже остальной:
     * на доле 0.6 шарнир повёрнут всего на 12°, и лист там ещё висит над
     * правой стопкой. Переключение знака по доле на половине пути опускало его
     * под неё, и оттуда торчал чужой текст.
     */
    const hinge = flipRotations(progress, BONES)[0] ?? 0;

    /*
     * Наклон шарнира, а не доля переворота.
     *
     * Прежний множитель `1 − 2·доля` обращался в ноль ровно на середине, и
     * профиль листа схлопывался в плоскость — тогда как лежащая страница
     * сохраняла провал в жёлоб на все 0.016. Лист проваливался под неё, и
     * оттуда торчал чужой текст: окно 0.44…0.62, симметричное относительно 0.5.
     *
     * Косинус угла шарнира ведёт себя иначе: из-за выгиба шарнир к середине
     * переворота повёрнут всего на 11°, и множитель там остаётся 0.98 — профиль
     * почти полный. На концах он даёт ровно ±1, как и требуется: поворот на −π
     * обращает знак локальной z, и профиль ложится тем же на вторую стопку.
     */
    const lean = Math.cos(hinge);
    /*
     * Множитель обращает знак вместе с поворотом листа, и просвет обязан
     * умножаться на него наравне с профилем.
     *
     * Прибавлять просвет **после** множителя нельзя: поворот на −π меняет знак
     * локальной z, и во второй половине переворота просвет выходил
     * отрицательным — лист не приподнимался над левой стопкой, а вдавливался в
     * неё тем глубже, чем ближе к концу.
     */

    for (const target of [geometry, backGeometry]) {
      const position = requireAttribute(target, 'position');

      for (let index = 0; index < position.count; index++) {
        const fromSpine = Math.abs(position.getX(index)) / width;
        /*
         * Просвет прибавляется **после** множителя и лишь заимствует его знак.
         *
         * Умножать его на `scale` нельзя: к середине переворота множитель
         * стремится к нулю и просвет схлопывается вместе с ним, а высота
         * лежащей страницы ничем не масштабируется. У корешка, где поворот
         * подъёма не даёт, лист от этого проваливался под страницу.
         */
        position.setZ(index, (pageProfile(fromSpine, lift, dip) + clearance) * lean);
      }

      position.needsUpdate = true;
    }
  }

  applyProfile(0);

  return {
    root,
    front: frontMesh,
    back: backMesh,
    setProgress: (progress) => {
      const angles = flipRotations(progress, BONES);
      for (let index = 0; index < bones.length; index++) {
        bones[index]!.rotation.y = angles[index] ?? 0;
      }

      applyProfile(progress);

      /*
       * Половины раскрытой книги подняты к зрителю на `tilt` каждая — книга
       * стоит пологой дугой, а не плашмя. Лист обязан приходить на ту же
       * наклонную плоскость, иначе он воткнётся в страницу углом: слева его
       * ждёт наклон `+tilt`, справа `−tilt`.
       */
      root.rotation.y = tilt * (2 * progress - 1);
    },
    setVisible: (visible) => {
      frontMesh.visible = visible;
      backMesh.visible = visible;
    },
    refreshBounds: () => {
      frontMesh.computeBoundingSphere();
      backMesh.computeBoundingSphere();
    },
    dispose: () => {
      skeleton.dispose();
      geometry.dispose();
      backGeometry.dispose();
    },
  };
}
