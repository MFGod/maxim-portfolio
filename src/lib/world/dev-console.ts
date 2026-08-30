/**
 * Инструменты подбора мира: всё, что живёт в консоли и в углу кадра при
 * `next dev`, и чего не должно быть у посетителя.
 */

import * as THREE from 'three';

import type { WorldFigure } from '@/data/world-figures';
import type { WorldPatrol } from '@/data/world-patrols';

import { battleView, type WorldBattle } from './battle';
import { aliveStops, stepAlive, type AliveVisit } from './dev-alive';
import { createBattleTools, type BattleTools } from './dev-battles';
import { createCrowdTools, type CrowdTools } from './dev-crowd';
import {
  adoptFigure,
  clearFigures,
  droppedFigures,
  formatFigures,
  listFigures,
  placeFigure,
  removeFigure,
  tweakFigure,
  type FigurePatch,
} from './dev-figures';
import {
  clearMarks,
  clearRoute,
  markInstances,
  markRoute,
  type MarkedInstance,
} from './dev-markers';
import { createPatrolTools, type PatrolTools } from './dev-patrols';
import {
  applyShot,
  clearShots,
  exportShots,
  listShots,
  pocketsFromShots,
  removeShot,
  saveShot,
  type CameraShot,
} from './dev-shots';
import { createSolidTools, type SolidTools } from './dev-solid';
import { figureTools, shotTools } from './dev-tools';
import { traceGround } from './figures';
import type { ShellPocket } from './map-shell';
import { DROP_HEIGHT, type WorldDevContext } from './scene';
import { flightPath, peakFlight } from './shots';

/** Черновики: то, что подбирается прямо сейчас и ещё не лежит в `src/data`. */
export type WorldDevDrafts = {
  /** Черновая расстановка: перебивает данные по `id`. */
  figures: () => readonly WorldFigure[];
  /** Что из данных убрано черновиком. */
  dropped: () => readonly string[];
  /** Карманы купола от несохранённых ракурсов. */
  pockets: () => ShellPocket[];
};

export type WorldDevTools = {
  /** Номера над инстансами: инструмент подбора точек. */
  marks: {
    show: (name: string) => MarkedInstance[];
    clear: () => void;
    /** Схема пролёта: линия, стрелки и подписи остановок. */
    route: () => number;
    clearRoute: () => void;
  };
  /**
   * Расстановка фигур: поставить, поправить, выгрузить в данные. Живёт рядом с
   * `shots` и работает так же — черновик в `localStorage`, итог в `src/data`.
   */
  figures: {
    place: (patch?: FigurePatch) => WorldFigure;
    tweak: (id: string, patch: FigurePatch) => WorldFigure | null;
    list: () => WorldFigure[];
    remove: (id: string) => boolean;
    clear: () => void;
    export: () => string;
    /** Сколько фигур стоит в сцене сейчас. */
    count: () => number;
    /** Всё, что стоит в мире: утверждённое и черновое. */
    placed: () => readonly WorldFigure[];
    /** Фигура по имени: из данных или из черновика. */
    find: (id: string) => WorldFigure | null;
    /** Переносит фигуру из данных в черновик, чтобы её можно было править. */
    adopt: (id: string) => WorldFigure | null;
    /** Подводит камеру к фигуре: со ста двадцати семи иначе её не найти. */
    goTo: (id: string) => boolean;
    /** Подводит камеру к идущей группе. */
    goToPatrol: (id: string) => boolean;
    /**
     * Подводит камеру к стычке — сбоку от фронта, чтобы видеть обе шеренги.
     * @returns имя стычки, к которой поехали, или `null`, если стычек нет
     */
    goToBattle: (id?: string) => string | null;
    /**
     * Везёт камеру к следующему живому: дозоры, стычки, одиночки по кругу.
     * @param step шаг по кругу; отрицательный ведёт назад
     * @returns куда приехали, или `null`, если живого нет и ехать некуда
     */
    goToAlive: (step?: number) => AliveVisit | null;
    /** Ходящие дозоры: маршруты для проверки. */
    patrols: () => readonly WorldPatrol[];
    /** Идущие стычки: их площадки и составы. */
    battles: () => readonly WorldBattle[];
    /** Точка земли под курсором. Координаты — доли канваса от 0 до 1. */
    groundAt: (x: number, y: number) => [number, number, number] | null;
    /** Имя фигуры под курсором. Координаты те же. */
    pickAt: (x: number, y: number) => string | null;
    /** Верхушка препятствия в точке или `null`, если там чисто. */
    blockedAt: (x: number, z: number) => number | null;
    /** Точная высота земли в точке — лучом по геометрии карты. */
    dropAt: (
      x: number,
      z: number,
      onto?: 'ground' | 'props' | 'road' | 'top',
    ) => number | null;
    /** Все высоты ленты дороги в точке, сверху вниз. */
    dropAll: (x: number, z: number) => number[];
  };
  /**
   * Заселение: замеры и поиск мест под сотни фигур. Им пекут содержимое
   * `src/data/world-figures.ts`.
   */
  readonly crowd: CrowdTools;
  /**
   * Маршруты дозоров: замер по ленте дороги и перепекание. Инструмент того же
   * рода, что и `crowd`, — им пекут `src/data/world-patrols.ts`.
   */
  readonly patrols: PatrolTools;
  /**
   * Площадки стычек: замер поляны и проверка того, что лежит в данных.
   * Им пекут `src/data/world-battles.ts`.
   */
  readonly battles: BattleTools;
  /** Сохранённые ракурсы: подбор вживую, выгрузка в данные. */
  shots: {
    save: (name?: string) => CameraShot;
    list: () => CameraShot[];
    go: (name: string) => CameraShot | null;
    remove: (name: string) => boolean;
    clear: () => void;
    export: () => string;
  };
  /** Занято ли место: след инстансов, уточнённый телом и стоящими жителями. */
  occupied: (x: number, z: number, low?: number, high?: number) => string | null;
  /** Замер тела по настоящей геометрии инстансов. Ленивый, как и заселение. */
  readonly solid: SolidTools;
  /** Черновики для сцены: она спрашивает их сама. */
  drafts: WorldDevDrafts;
  /** Снимает горячие клавиши и разбирает пометки. Зовёт `world.dispose`. */
  dispose: () => void;
};

/** Направление замера: луч всегда идёт сверху вниз. */
const DOWN = new THREE.Vector3(0, -1, 0);

/** Собирает инструменты вокруг живого мира. */
export function createDevConsole(context: WorldDevContext): WorldDevTools {
  const {
    scene,
    camera,
    controls,
    rig,
    figures,
    raycaster,
    aimAt,
    surfaceAt,
    shellHeightAt,
    shellPadding,
    obstacleHeightAt,
    refreshFigures,
    applyPockets,
  } = context;

  /** Какую стычку показали прошлый раз: `goToBattle()` без имени идёт дальше. */
  let battleCursor = -1;

  /** Инструменты заселения. Ленивые: см. ниже, где они отдаются наружу. */
  let crowdTools: CrowdTools | null = null;
  const crowd = (): CrowdTools =>
    (crowdTools ??= createCrowdTools({ scene, surfaceAt }));
  let patrolTools: PatrolTools | null = null;
  let battleTools: BattleTools | null = null;
  let solidTools: SolidTools | null = null;
  const solid = (): SolidTools => (solidTools ??= createSolidTools(scene));

  /** Занято ли место — след на земле, уточнённый телом и жителями. */
  const occupied = (
    x: number,
    z: number,
    low?: number,
    high?: number,
  ): string | null => {
    const resident = standingAt(x, z, low, high);
    if (resident) return resident;

    const trace = crowd().blocking(x, z);
    if (trace === null) return null;
    if (low === undefined || high === undefined) return trace;

    return solid().at(x, z, low, high);
  };

  /** Кто из стоящих жителей занимает точку. */
  const standingAt = (
    x: number,
    z: number,
    low?: number,
    high?: number,
  ): string | null => {
    for (const figure of figures.placed()) {
      const [fx, fy, fz] = figure.at;
      const half = figure.height * 0.2;
      if (Math.abs(x - fx) > half || Math.abs(z - fz) > half) continue;
      if (low !== undefined && high !== undefined) {
        if (fy + figure.height < low || fy > high) continue;
      }
      return figure.id;
    }
    return null;
  };

  /** Подводит камеру к стычке. Без имени — к следующей по кругу. */
  function goToBattle(id?: string): string | null {
    const list = figures.battles();
    if (list.length === 0) return null;

    const battle = id
      ? list.find((item) => item.id === id)
      : list[((++battleCursor % list.length) + list.length) % list.length];
    if (!battle) return null;

    const view = battleView(battle);

    const ceiling = shellHeightAt(view.at[0], view.at[2]);
    const y = ceiling === null ? view.at[1] : Math.max(view.at[1], ceiling + 0.01);

    rig.cancel();
    rig.setStationLook(false);
    rig.setControlMode('orbit');

    camera.position.set(view.at[0], y, view.at[2]);
    controls.target.set(view.look[0], view.look[1], view.look[2]);
    controls.update();
    return battle.id;
  }

  /** Подводит камеру к идущей группе. */
  function goToPatrol(id: string): boolean {
    const patrol = figures.patrols().find((item) => item.id === id);
    const lead = figures.object.getObjectByName(`${id}-1`);
    if (!patrol || !lead) return false;

    lead.updateWorldMatrix(true, false);
    const place = lead.getWorldPosition(new THREE.Vector3());

    const away = Math.max(patrol.height * 4, 0.35);
    rig.cancel();
    rig.setStationLook(false);
    rig.setControlMode('orbit');

    camera.position.set(place.x + away, place.y + away * 0.7, place.z + away);
    controls.target.set(place.x, place.y + patrol.height / 2, place.z);
    controls.update();
    return true;
  }

  /** Подводит камеру к фигуре: со ста двадцати семи иначе её не найти. */
  function goToFigure(id: string): boolean {
    const figure = figures.placed().find((item) => item.id === id);
    if (!figure) return false;

    const [x, y, z] = figure.at;
    const away = figure.height * 3;

    rig.cancel();
    rig.setStationLook(false);
    rig.setControlMode('orbit');

    camera.position.set(x + away, y + away * 0.6, z + away);
    controls.target.set(x, y + figure.height / 2, z);
    controls.update();
    return true;
  }

  /** Где стоит обход живого. `-1` — ещё нигде, первый шаг ведёт к началу. */
  let aliveCursor = -1;

  /** Везёт камеру к следующему живому по кругу. */
  function goToAlive(step = 1): AliveVisit | null {
    const stops = aliveStops(figures.patrols(), figures.battles(), figures.placed());
    if (stops.length === 0) return null;

    for (let tries = 0; tries < stops.length; tries++) {
      aliveCursor = stepAlive(stops.length, aliveCursor, step);
      const stop = stops[aliveCursor]!;

      const arrived =
        stop.kind === 'patrol'
          ? goToPatrol(stop.id)
          : stop.kind === 'battle'
            ? goToBattle(stop.id) !== null
            : goToFigure(stop.id);

      if (arrived) return { stop, index: aliveCursor, total: stops.length };
    }

    return null;
  }

  /**
   * Горячие клавиши подбора: Shift+S — снимок, Shift+E — выгрузка всех.
   * Руки при подборе заняты мышью, а лезть в консоль на каждый кадр долго.
   */
  const onDevKey = (event: KeyboardEvent) => {
    if (!event.shiftKey) return;

    if (event.code === 'KeyB' && figureTools) {
      const id = goToBattle();
      console.info(id ? `стычка «${id}»` : 'стычек в мире нет');
      return;
    }

    if (!shotTools) return;

    if (event.code === 'KeyS') {
      const shot = saveShot(camera, controls.target);
      applyPockets();
      console.info(`снимок «${shot.name}»`, shot.at, '→', shot.look);
      return;
    }

    if (event.code === 'KeyE') {
      const list = listShots();
      if (!list.length) {
        console.info('снимков пока нет');
        return;
      }

      const text = exportShots();
      console.info(`\n${text}`);
      navigator.clipboard
        .writeText(text)
        .then(() => console.info(`скопировано в буфер: ${list.length} шт.`))
        .catch(() => console.info('в буфер не отдалось — копируй из вывода выше'));
    }
  };

  window.addEventListener('keydown', onDevKey);

  return {
    marks: {
      show: (name: string) => markInstances(scene, name),
      clear: () => clearMarks(scene),
      route: () => {
        const main = flightPath().map((point) => ({
          label: point.label,
          at: point.shot.at,
        }));
        const peak = peakFlight().map((point) => ({
          label: point.label,
          at: point.shot.at,
        }));

        const drawn = markRoute(scene, main, { color: 0x7ef7ff });
        return drawn + markRoute(scene, peak, { color: 0xffb45e, name: '__dev_peak' });
      },
      clearRoute: () => {
        clearRoute(scene);
        clearRoute(scene, '__dev_peak');
      },
    },
    figures: {
      place: (patch?: FigurePatch) => {
        const target = controls.target;
        const figure = placeFigure([target.x, target.y, target.z], patch);
        void refreshFigures();
        return figure;
      },
      tweak: (id: string, patch: FigurePatch) => {
        const figure = tweakFigure(id, patch);
        if (figure) void refreshFigures();
        return figure;
      },
      list: listFigures,
      placed: figures.placed,
      /** Фигура по имени — хоть из данных, хоть из черновика. */
      find: (id: string) => figures.placed().find((figure) => figure.id === id) ?? null,
      /**
       * Берёт фигуру из данных в черновик, чтобы её можно было двигать.
       * Уже черновую возвращает как есть.
       */
      adopt: (id: string) => {
        const figure = figures.placed().find((item) => item.id === id);
        return figure ? adoptFigure(figure) : null;
      },
      goToPatrol,
      goToBattle,
      goToAlive,
      battles: figures.battles,
      goTo: goToFigure,
      remove: (id: string) => {
        const removed = removeFigure(id);
        if (removed) void refreshFigures();
        return removed;
      },
      clear: () => {
        clearFigures();
        void refreshFigures();
      },
      /**
       * Весь мир целиком, а не только правки: вставляется в `world-figures.ts`
       * на место массива. Иначе, поправив пять фигур из ста шести, автор
       * потерял бы остальные сто одну.
       */
      export: () => formatFigures(figures.placed()),
      count: figures.count,
      patrols: figures.patrols,
      groundAt: (x: number, y: number) => {
        aimAt(x, y);

        const point = traceGround(
          raycaster.ray.origin,
          raycaster.ray.direction,
          (px, pz) => {
            const ceiling = shellHeightAt(px, pz);
            return ceiling === null ? null : ceiling - shellPadding();
          },
        );
        if (!point) return null;

        const top = surfaceAt(point.x, point.z, 'top');

        return [+point.x.toFixed(3), +(top ?? point.y).toFixed(3), +point.z.toFixed(3)];
      },
      pickAt: (x: number, y: number) => {
        aimAt(x, y);
        return figures.pick(raycaster);
      },
      blockedAt: obstacleHeightAt,
      dropAll: (x: number, z: number) => {
        raycaster.set(new THREE.Vector3(x, DROP_HEIGHT, z), DOWN);
        const targets = scene.children.filter(
          (child) =>
            !child.name.startsWith('__') &&
            child !== figures.object &&
            child.userData.notSurface !== true &&
            !(child as THREE.InstancedMesh).isInstancedMesh,
        );

        return raycaster
          .intersectObjects(targets, true)
          .filter((hit) => {
            const material = (hit.object as THREE.Mesh).material as
              THREE.Material | THREE.Material[] | undefined;
            const name = Array.isArray(material) ? material[0]?.name : material?.name;
            return name === 'Path';
          })
          .map((hit) => +hit.point.y.toFixed(3));
      },
      dropAt: surfaceAt,
    },
    get crowd() {
      return crowd();
    },
    occupied,
    get solid() {
      return solid();
    },
    get patrols() {
      patrolTools ??= createPatrolTools({
        scene,
        blocked: occupied,
      });
      return patrolTools;
    },
    get battles() {
      battleTools ??= createBattleTools({
        scene,
        blocked: (x, z) => crowd().blocking(x, z),
        surfaceAt: (x, z) => surfaceAt(x, z, 'top'),
      });
      return battleTools;
    },
    shots: {
      save: (name?: string) => {
        const shot = saveShot(camera, controls.target, name);
        applyPockets();
        return shot;
      },
      list: listShots,
      go: (name: string) => {
        const shot = applyShot(name, camera, controls.target);
        if (shot) controls.update();
        return shot;
      },
      remove: (name: string) => {
        const removed = removeShot(name);
        if (removed) applyPockets();
        return removed;
      },
      clear: () => {
        clearShots();
        applyPockets();
      },
      export: exportShots,
    },
    drafts: {
      figures: listFigures,
      dropped: droppedFigures,
      pockets: () => (shotTools ? pocketsFromShots() : []),
    },
    dispose: () => {
      window.removeEventListener('keydown', onDevKey);
      clearMarks(scene);
      clearRoute(scene);
      clearRoute(scene, '__dev_peak');
    },
  };
}
