/** Какой разворот попадает на какую видимую грань книги. */

/** Состояние книги, от которого зависит раскладка. */
export type FacesState = {
  /** Индекс текущего разворота. */
  spread: number;
  turning: boolean;
  /** Куда идёт переворот: вперёд или назад. */
  direction: 1 | -1;
};

/** Индексы разворотов по граням. У листа — `null`, пока он не в перевороте. */
export type BookFaces = {
  /** Разворот, чья **левая** страница лежит на левой половине. */
  left: number;
  /** Разворот, чья **правая** страница лежит на правой половине. */
  right: number;
  /** Разворот, чья **правая** страница уехала на лицо листа. */
  sheetFront: number | null;
  /** Разворот, чья **левая** страница пришла на изнанку листа. */
  sheetBack: number | null;
};

/** Раскладывает развороты по граням. */
export function spreadFaces({ spread, turning, direction }: FacesState): BookFaces {
  if (!turning) {
    return { left: spread, right: spread, sheetFront: null, sheetBack: null };
  }

  const base = direction === -1 ? spread - 1 : spread;
  return { left: base, right: base + 1, sheetFront: base, sheetBack: base + 1 };
}
