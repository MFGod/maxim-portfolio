/**
 * Может ли эта машина показать трёхмерный мир.
 *
 * Решение принимается до того, как загружен хоть один байт сцены: мир весит
 * 27 МБ, и платить ими за посетителя, которому мы всё равно покажем плоский
 * план, нельзя. Функция чистая — гейты проверяются тестом, без браузера.
 */

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
};

/** Ниже этой ширины мир не поднимаем: там своя оболочка и нет оконного менеджера. */
export const WORLD_MIN_WIDTH = 1024;

/** Меньше этого объёма памяти сцена не переживёт: 27 МБ геометрии плюс текстуры. */
export const WORLD_MIN_MEMORY_GB = 4;

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

    // Контекстов WebGL у браузера конечное число: пробный обязан их вернуть.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
