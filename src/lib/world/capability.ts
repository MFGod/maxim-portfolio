/** Может ли эта машина показать трёхмерный мир. */

export const WORLD_BLOCK_REASONS = [
  'ready',
  'motion-off',
  'small-screen',
  'no-webgl',
  'low-memory',
] as const;

export type WorldSupport = (typeof WORLD_BLOCK_REASONS)[number];

export type WorldEnvironment = {
  /** Ширина вьюпорта. `null` — до гидратации, решения ещё нет. */
  viewportWidth: number | null;
  /** Уровень движения из настроек. */
  animations: 'full' | 'reduced' | 'off';
  /** Есть ли WebGL2. */
  webgl2: boolean;
  /** `navigator.deviceMemory` в гигабайтах, если браузер его сообщает. */
  deviceMemory: number | null;
  /** Палец, а не мышь. Определяет уровень отрисовки, но не доступность мира. */
  coarsePointer: boolean;
};

/** Ниже этой ширины мир не поднимаем. */
export const WORLD_MIN_WIDTH = 320;

/** Меньше этого объёма памяти сцена не переживёт: 27 МБ геометрии плюс текстуры. */
export const WORLD_MIN_MEMORY_GB = 4;

/** Уровень отрисовки. */
export type WorldQuality = 'full' | 'light';

/** Ширина, ниже которой отрисовка идёт по облегчённому уровню. */
export const WORLD_LIGHT_WIDTH = 1024;

/**
 * Уровень отрисовки по машине. Отдельно от `worldSupport`: тот отвечает
 * «показывать ли вообще», этот — «чем платить за кадр».
 */
export function worldQuality(environment: WorldEnvironment): WorldQuality {
  if (environment.deviceMemory !== null && environment.deviceMemory <= 4) {
    return 'light';
  }

  if (
    environment.coarsePointer &&
    environment.viewportWidth !== null &&
    environment.viewportWidth < WORLD_LIGHT_WIDTH
  ) {
    return 'light';
  }

  return 'full';
}

/**
 * Порядок проверок — от самого дешёвого и самого частого к редкому, чтобы
 * причина в интерфейсе была той, которую посетитель может исправить сам.
 */
export function worldSupport(environment: WorldEnvironment): WorldSupport {
  if (environment.animations === 'off') return 'motion-off';

  if (
    environment.viewportWidth !== null &&
    environment.viewportWidth < WORLD_MIN_WIDTH
  ) {
    return 'small-screen';
  }

  if (!environment.webgl2) return 'no-webgl';

  if (
    environment.deviceMemory !== null &&
    environment.deviceMemory < WORLD_MIN_MEMORY_GB
  ) {
    return 'low-memory';
  }

  return 'ready';
}

/** Проверка WebGL2 без создания сцены: контекст сразу освобождается. */
export function detectWebgl2(): boolean {
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;

    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
