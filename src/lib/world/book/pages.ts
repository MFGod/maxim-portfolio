/**
 * Пул холстов и текстур страниц.
 *
 * Это не оптимизация, а конструкция. Наивный вариант «текстура на страницу»
 * при восемнадцати разворотах даёт 36 текстур по 5.7 МиБ — 200 МиБ с мипами,
 * притом что вся текстурная память сцены сейчас 4.8 МиБ (`envmap.png`, больше
 * в мире текстур нет вовсе).
 *
 * Четырёх слотов достаточно, и это считается, а не берётся с запасом. В покое
 * видны две страницы разворота. Во время переворота нужны четыре: левая
 * текущего разворота остаётся на месте, правая уходит лицом поднявшегося
 * листа, изнанка того же листа — левая следующего разворота, и под ним
 * открывается правая следующего. Пятой одновременно видимой страницы нет.
 *
 * Слоты рождаются при первом обращении: посетитель, не раскрывший книгу, не
 * платит ни байта. Обратно они не освобождаются — закрыть и открыть книгу
 * можно часто, а каждое освобождение стоило бы новой заливки в видеопамять.
 */

import * as THREE from 'three';

import type { PageHotspot } from './draw';

/** Пропорция A4. Держимая книга занимает около 55% ширины кадра. */
export const PAGE_WIDTH_PX = 1024;
export const PAGE_HEIGHT_PX = 1448;

/** Столько страниц одновременно видно в самый плотный момент — переворот. */
const SLOTS = 4;

/**
 * Анизотропия: в середине переворота лист стоит к камере почти ребром, и без
 * неё строки в этот момент расплываются. Восьми хватает, потолок железа обычно
 * 16 — берём меньшее.
 */
const ANISOTROPY = 8;

type Slot = {
  /** Что сейчас нарисовано. `null` — слот ещё не занимали. */
  key: string | null;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  /** Места ссылок последней отрисовки: они живут ровно столько же, что и она. */
  hotspots: PageHotspot[];
  /** Когда слот трогали в последний раз: вытесняем самый давний. */
  used: number;
};

/** Нарисованная страница: текстура и места её ссылок. */
export type PageSlot = {
  texture: THREE.Texture;
  hotspots: readonly PageHotspot[];
};

export type PagePool = {
  /**
   * Страница с этим ключом. Если она уже нарисована — та же текстура без
   * перерисовки, иначе вытесняется самый давно не нужный слот.
   */
  acquire: (
    key: string,
    paint: (context: CanvasRenderingContext2D) => PageHotspot[],
  ) => PageSlot;
  /** Сколько слотов реально создано. Для замера в приёмке. */
  readonly size: number;
  dispose: () => void;
};

export function createPagePool(renderer: THREE.WebGLRenderer): PagePool {
  const slots: Slot[] = [];
  let tick = 0;

  const anisotropy = Math.min(ANISOTROPY, renderer.capabilities.getMaxAnisotropy());

  const addSlot = (): Slot => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_WIDTH_PX;
    canvas.height = PAGE_HEIGHT_PX;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('книга: холст страницы не дал двумерный контекст');

    const texture = new THREE.CanvasTexture(canvas);
    // Без этого канвас, нарисованный в sRGB, уедет в тёмное: рендерер считает
    // в линейном пространстве и обязан знать, что ему дали.
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;

    const slot: Slot = { key: null, canvas, context, texture, hotspots: [], used: 0 };
    slots.push(slot);
    return slot;
  };

  const acquire = (
    key: string,
    paint: (context: CanvasRenderingContext2D) => PageHotspot[],
  ): PageSlot => {
    tick += 1;

    const hit = slots.find((slot) => slot.key === key);
    if (hit) {
      hit.used = tick;
      return { texture: hit.texture, hotspots: hit.hotspots };
    }

    const slot =
      slots.length < SLOTS
        ? addSlot()
        : slots.reduce((oldest, next) => (next.used < oldest.used ? next : oldest));

    slot.key = key;
    slot.used = tick;
    slot.context.clearRect(0, 0, PAGE_WIDTH_PX, PAGE_HEIGHT_PX);
    slot.hotspots = paint(slot.context);
    slot.texture.needsUpdate = true;

    /*
     * Заливка в видеопамять — 5.7 МиБ целиком: частичного обновления у
     * `CanvasTexture` нет. Если её не позвать здесь, она случится в первом
     * кадре, где текстура понадобится, — то есть ровно в начале переворота.
     * `initTexture` переносит её сюда, в момент подготовки.
     */
    renderer.initTexture(slot.texture);
    return { texture: slot.texture, hotspots: slot.hotspots };
  };

  return {
    acquire,
    get size() {
      return slots.length;
    },
    dispose: () => {
      for (const slot of slots) {
        slot.texture.dispose();
        slot.canvas.width = 0;
        slot.canvas.height = 0;
      }
      slots.length = 0;
    },
  };
}
