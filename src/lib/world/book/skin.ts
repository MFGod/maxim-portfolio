/** Математика листающегося листа: привязка вершин к костям и углы костей. */

/** Костей в цепочке листа. Восьми хватает на дугу без огранки. */
export const BONES = 8;

/** Делений плоскости вдоль листа. Вершин выходит `(SEGMENTS + 1) * 2`. */
export const SEGMENTS = 20;

/** Насколько лист выгибается дугой в середине переворота, от 0 до 1. */
const BOW = 1;

/** Привязка одной вершины: две кости и их доли. Доли всегда дают в сумме 1. */
export type VertexBinding = {
  index: [number, number];
  weight: [number, number];
};

/**
 * К каким костям привязана вершина с координатой `x`.
 * @param x координата вершины вдоль листа, в локальных единицах меша
 * @param width ширина листа
 * @param bones длина цепочки костей
 */
export function vertexBinding(x: number, width: number, bones: number): VertexBinding {
  if (bones <= 1) return { index: [0, 0], weight: [1, 0] };

  const step = width / bones;
  const along = (x + width / 2) / step;

  const slot = Math.floor(along);
  if (slot >= bones - 1) return { index: [bones - 1, bones - 1], weight: [1, 0] };
  if (slot < 0) return { index: [0, 0], weight: [1, 0] };

  const fraction = along - slot;
  return { index: [slot, slot + 1], weight: [1 - fraction, fraction] };
}

/** Готовые атрибуты скиннинга: по четыре числа на вершину, как ждёт three. */
export type PageSkin = {
  index: Uint16Array;
  weight: Float32Array;
};

/**
 * Строит атрибуты `skinIndex` и `skinWeight` для плоскости листа.
 * @param positions позиции вершин подряд: x, y, z, x, y, z…
 * @param width ширина листа
 * @param bones длина цепочки костей
 */
export function pageSkin(
  positions: ArrayLike<number>,
  width: number,
  bones: number,
): PageSkin {
  const count = Math.floor(positions.length / 3);
  const index = new Uint16Array(count * 4);
  const weight = new Float32Array(count * 4);

  for (let vertex = 0; vertex < count; vertex++) {
    const binding = vertexBinding(positions[vertex * 3] ?? 0, width, bones);

    index[vertex * 4] = binding.index[0];
    index[vertex * 4 + 1] = binding.index[1];
    weight[vertex * 4] = binding.weight[0];
    weight[vertex * 4 + 1] = binding.weight[1];
  }

  return { index, weight };
}

/**
 * Углы костей на заданной доле переворота.
 * @param progress доля переворота от 0 до 1
 * @param bones длина цепочки костей
 */
export function flipRotations(progress: number, bones: number): number[] {
  if (bones <= 0) return [];

  const clamped = Math.min(Math.max(progress, 0), 1);
  const turn = -Math.PI * clamped;

  if (bones === 1) return [turn];

  const bow = BOW * Math.sin(Math.PI * clamped);
  const share = turn / bones;
  const rotations: number[] = [];

  for (let bone = 0; bone < bones; bone++) {
    rotations.push(bone === 0 ? turn - bow * (turn - share) : bow * share);
  }

  return rotations;
}
