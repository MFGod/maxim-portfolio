/**
 * Снимки камеры — инструмент подбора ракурсов.
 *
 * Точка входа, планы глав и облёт задаются шестью числами: где камера и куда
 * смотрит. Подбираются они вживую, а живут потом в `src/data/world-shots.ts`,
 * поэтому между подбором и данными нужен мост: сохранить текущий вид под
 * именем, вернуться к нему, а в конце выгрузить всё готовым куском кода.
 *
 * Снимки лежат в `localStorage`: перезагрузка страницы при подборе неизбежна,
 * а терять час работы из-за неё нельзя. Хранилище чужое и ненадёжное — его
 * может не быть вовсе (приватный режим), в нём может лежать мусор от прошлых
 * версий, запись может упереться в квоту. Поэтому читаем с проверкой каждой
 * записи, а пишем так, чтобы отказ хранилища не ронял обработчик клика.
 *
 * Включается флагом `SHOT_TOOLS` из `dev-tools.ts`; сам модуль работает всегда
 * и проверяется тестами, чтобы не сгнить к моменту, когда снова понадобится.
 */

import * as THREE from 'three';

import type { ShellPocket } from './map-shell';
import { pocketOf } from './shots';

const STORE = 'world.dev.shots';

/** Приставка автоматических имён. Номер после неё продолжает нумерацию. */
const AUTO_PREFIX = 'снимок';

const AUTO_NAME = new RegExp(`^${AUTO_PREFIX}-(\\d+)$`);

/**
 * На сколько юнитов вперёд отодвигается точка взгляда, если камера смотрит
 * почти в себя. В режиме «от первого лица» цель прижата к камере на 0.01, и
 * после округления до сотых от направления не осталось бы ничего.
 */
const MIN_LOOK_DISTANCE = 20;

export type CameraShot = {
  name: string;
  at: readonly [number, number, number];
  look: readonly [number, number, number];
};

const round = (value: number): number => +value.toFixed(2);

function isPoint(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

/**
 * Годится ли запись из хранилища.
 *
 * Проверяется каждая: в `localStorage` мог остаться снимок от прежней версии
 * формата, и одна порченая запись иначе роняет весь подбор при первом же
 * обращении к её координатам.
 */
function isShot(value: unknown): value is CameraShot {
  if (typeof value !== 'object' || value === null) return false;
  const shot = value as Partial<CameraShot>;

  return typeof shot.name === 'string' && isPoint(shot.at) && isPoint(shot.look);
}

function read(): CameraShot[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORE);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isShot) : [];
  } catch {
    // Испорченный ключ не должен ронять подбор: начинаем с пустого списка.
    return [];
  }
}

/**
 * Пишет список снимков.
 *
 * @returns удалось ли сохранить. Отказ хранилища — не повод падать посреди
 *   обработчика клика: снимок всё равно вернётся вызвавшему, просто не
 *   переживёт перезагрузку.
 */
function write(shots: CameraShot[]): boolean {
  if (typeof localStorage === 'undefined') return false;

  try {
    localStorage.setItem(STORE, JSON.stringify(shots));
    return true;
  } catch {
    console.warn('Снимок не сохранён: хранилище недоступно или переполнено');
    return false;
  }
}

/** Следующий свободный номер автоматического имени. */
function nextAutoNumber(shots: CameraShot[]): number {
  const used = shots
    .map((shot) => AUTO_NAME.exec(shot.name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .filter(Number.isFinite);

  // Номер по длине списка переиспользовался после удалений и молча затирал
  // прежний снимок. Считаем от наибольшего занятого.
  return (used.length ? Math.max(...used) : 0) + 1;
}

/** Сохраняет текущий вид. Имя без аргумента — по счётчику. */
export function saveShot(
  camera: THREE.Camera,
  target: THREE.Vector3,
  name?: string,
): CameraShot {
  const shots = read();

  // Направление берём у самой камеры, а не из разницы с целью: оно верно в
  // любом режиме и не зависит от того, где OrbitControls держит точку взгляда.
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const distance = Math.max(camera.position.distanceTo(target), MIN_LOOK_DISTANCE);
  const look = camera.position.clone().addScaledVector(forward, distance);

  const shot: CameraShot = {
    name: name ?? `${AUTO_PREFIX}-${nextAutoNumber(shots)}`,
    at: [round(camera.position.x), round(camera.position.y), round(camera.position.z)],
    look: [round(look.x), round(look.y), round(look.z)],
  };

  // Снимок с тем же именем заменяется: подбор — это уточнение одного ракурса.
  write([...shots.filter((item) => item.name !== shot.name), shot]);

  return shot;
}

export function listShots(): CameraShot[] {
  return read();
}

/** Ставит камеру в сохранённый вид. */
export function applyShot(
  name: string,
  camera: THREE.Camera,
  target: THREE.Vector3,
): CameraShot | null {
  const shot = read().find((item) => item.name === name);
  if (!shot) return null;

  camera.position.set(shot.at[0], shot.at[1], shot.at[2]);
  target.set(shot.look[0], shot.look[1], shot.look[2]);
  return shot;
}

/** @returns был ли такой снимок. */
export function removeShot(name: string): boolean {
  const shots = read();
  const next = shots.filter((item) => item.name !== name);
  if (next.length === shots.length) return false;

  write(next);
  return true;
}

/** Забывает все снимки разом. */
export function clearShots(): void {
  write([]);
}

/**
 * Карманы оболочки из ещё не утверждённых снимков.
 *
 * Правило и размеры те же, что у мировых ракурсов (`shots.ts`) — иначе кадр,
 * подобранный на стенде, поехал бы после переноса в данные.
 */
export function pocketsFromShots(shots: CameraShot[] = read()): ShellPocket[] {
  return shots.map((shot) => pocketOf({ id: shot.name, at: shot.at, look: shot.look }));
}

/** Готовый кусок для `src/data/world-shots.ts`: остаётся вставить и назвать. */
export function exportShots(): string {
  return read()
    .map((shot) => {
      // Имя задаёт человек, и апостроф в нём порвал бы строковый литерал.
      const id = shot.name.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
      return `  { id: '${id}', at: [${shot.at.join(', ')}], look: [${shot.look.join(', ')}] },`;
    })
    .join('\n');
}
