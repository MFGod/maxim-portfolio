/** Выключатель инструментов подбора. */
export const SHOT_TOOLS = false;

/**
 * Расстановка фигур: панель в углу, постановка щелчком по земле, перетаскивание
 * и выгрузка в `src/data/world-figures.ts`. Включена, пока расстановки нет —
 * гасить её надо тем же способом, что и подбор ракурсов, когда мир населён.
 */
export const FIGURE_TOOLS = true;

/** Инструменты живут только в разработке. */
export const DEV_TOOLS = process.env.NODE_ENV === 'development';

/** Подбор ракурсов: флаг поверх общего выключателя. */
export const shotTools = DEV_TOOLS && SHOT_TOOLS;

/** Расстановка фигур: флаг поверх общего выключателя. */
export const figureTools = DEV_TOOLS && FIGURE_TOOLS;
