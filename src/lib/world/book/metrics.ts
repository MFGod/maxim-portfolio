/** Размеры, позы, длительности и цвета книги — всё, что подбирается. */

import * as THREE from 'three';

/**
 * Угол обзора мира. Позы книги подобраны под него, и от него же считается
 * вынос под длинный объектив (`BOOK_DOLLY`).
 */
const WORLD_FOV = 65;

/** Ширина страницы от корешка к внешнему краю, в юнитах мира. */
export const PAGE_W = 0.2;
export const PAGE_H = 0.28;

/** Толщина переплёта и бумажного блока одной половины. */
export const BOARD_T = 0.008;
export const BLOCK_T = 0.026;

/** Зазоры по глубине. Каждый слой книги обязан стоять строго выше предыдущего. */
export const PAGE_LIFT = 0.0006;

/** Насколько бумага проваливается в жёлоб у корешка. */
export const GUTTER_DIP = 0.016;

/** Насколько поднята к зрителю каждая половина раскрытой книги, в радианах. */
export const OPEN_TILT = 0.12;

/** Ширина жёлоба по корешку: на неё расступаются стопки и бумага. */
export const SEAM_WIDTH = 0.005;

/** Отступ бумаги от корешка: половина жёлоба. */
export const PAGE_INSET = SEAM_WIDTH / 2;

/** Просвет листающегося листа над лежащей бумагой. */
export const SHEET_CLEARANCE = 0.0015;

/** Насколько бумажный блок шире страницы. */
export const BLOCK_OVERSIZE = 1.012;

/** Насколько переплёт свисает за блок, как у настоящего тома. */
export const COVER_MARGIN = 0.014;

/** Насколько дно жёлоба утоплено ниже верхней грани блока. */
export const SEAM_DEPTH = 0.001;

/** Тень в жёлобе, куда не достаёт свет. */
export const SEAM_COLOR = '#241f18';

/** Нитки переплёта: единственное, что видно на дне жёлоба. */
export const THREAD_COLOR = '#8d7c62';

/** Высота бумаги у внешнего края. Общая для страниц и листающегося листа. */
export const PAPER_LIFT = PAGE_LIFT + GUTTER_DIP;

/** Угол обзора камеры книги. Длинный объектив. */
export const BOOK_FOV = 7;

/** Во сколько раз том дальше от камеры книги, чем был бы на угле обзора мира. */
export const BOOK_DOLLY =
  Math.tan((WORLD_FOV * Math.PI) / 360) / Math.tan((BOOK_FOV * Math.PI) / 360);

/** Поза чтения. */
export const READING = {
  position: new THREE.Vector3(0, -0.05, -0.44 * BOOK_DOLLY),
  rotation: new THREE.Euler(-0.34, 0, 0),
};

/** Запас между книгой в позе чтения и кромкой кадра, в долях NDC. */
export const READING_MARGIN = 0.05;

/** Торцы переплёта: кожа без золота. */
export const COVER_EDGE_COLOR = 0x201a10;

/** Торец бумажного блока: та же бумага, что и страница, чуть темнее. */
export const PAPER_COLOR = '#d8d0bb';

/** Линии между листами на торце блока. */
export const SHEET_INK = '#a2967c';

/** Убранная поза: закрытая книга в правом нижнем углу кадра. */
export const STOWED = {
  position: new THREE.Vector3(0.6, -0.34, -0.9 * BOOK_DOLLY),
};

/** Просвет между силуэтом убранной книги и правой кромкой кадра, пикселей. */
export const STOWED_MARGIN_SIDE = 20;

/** Просвет между силуэтом убранной книги и нижней кромкой кадра, пикселей. */
export const STOWED_MARGIN_BOTTOM = 40;

/** Размер убранного тома против его натуральной величины. */
export const STOWED_SCALE = 0.75;

/** Толщина убранного тома против его натуральной. */
export const STOWED_FLATTEN = 0.5;

/** Размер раскрытой книги против натуральной величины. */
export const READING_SCALE = 1.2;

/** Длительности переходов, в секундах. */
export const OPEN_SECONDS = 0.8;
export const FLIP_SECONDS = 1.25;

/** Сколько идёт пролистывание пачкой — дорога до заложенной страницы целиком. */
export const RIFFLE_SECONDS = 1.6;

/** Короче этого один переворот в пачке не идёт. */
export const RIFFLE_MIN = 0.09;

/** Во сколько раз последний переворот пачки длиннее прочих. */
export const RIFFLE_SETTLE = 2.5;

/** Сколько книга едет из угла кадра в позу чтения, не раскрываясь. */
export const CARRY_SECONDS = 0.7;

/** Пауза между приездом и раскрытием. */
export const COVER_HOLD = 0.5;

/** Во сколько раз короче идут переходы при просьбе о покое. */
export const CALM_FACTOR = 0.3;

/** Короче этого переход перестаёт читаться и становится скачком. */
export const CALM_FLOOR = 0.12;
