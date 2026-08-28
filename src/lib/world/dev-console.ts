/**
 * Инструменты подбора мира: всё, что живёт в консоли и в углу кадра при
 * `next dev`, и чего не должно быть у посетителя.
 *
 * Модуль существует ради границы, а не ради порядка. Пока эти ручки собирались
 * прямо в `scene.ts`, шесть модулей `dev-*` — пометки, снимки, расстановка,
 * заселение, дозоры, стычки — импортировались статически, и сборщик уносил их
 * в прод-бандл целиком: проверка `NODE_ENV` гасила показ, но не сборку. Теперь
 * дев-код собран в одном месте и подключается снаружи (`world.attachDevTools`),
 * а `scene.ts` о нём не знает — в прод-сборке этот файл в граф не входит.
 *
 * Направление зависимости важно и обратно не разворачивается: отсюда можно
 * смотреть в сцену, из сцены сюда — нельзя. Иначе статический импорт вернётся
 * через заднюю дверь и вернёт всё как было.
 */

import * as THREE from 'three';

import type { WorldFigure } from '@/data/world-figures';
import type { WorldPatrol } from '@/data/world-patrols';

import { battleView, type WorldBattle } from './battle';
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
import { figureTools, shotTools } from './dev-tools';
import { traceGround } from './figures';
import type { ShellPocket } from './map-shell';
import { DROP_HEIGHT, type WorldDevContext } from './scene';
import { flightPath, peakFlight } from './shots';

/**
 * Черновики: то, что подбирается прямо сейчас и ещё не лежит в `src/data`.
 *
 * Сцена спрашивает их сама на каждой пересборке расстановки и купола, поэтому
 * они отдаются функциями, а не значениями: между двумя вопросами автор успевает
 * поставить фигуру.
 */
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
    /**
     * Подводит камеру к идущей группе.
     *
     * Дозор не стоит на месте, поэтому целью служит не запись в данных, а тот,
     * кто сейчас идёт первым: место берётся у него из сцены.
     */
    goToPatrol: (id: string) => boolean;
    /**
     * Подводит камеру к стычке — сбоку от фронта, чтобы видеть обе шеренги.
     *
     * Без имени берёт следующую по кругу: стычек три, они разбросаны по карте,
     * и обойти их подряд одной командой удобнее, чем вспоминать имена.
     *
     * @returns имя стычки, к которой поехали, или `null`, если стычек нет
     */
    goToBattle: (id?: string) => string | null;
    /** Ходящие дозоры: маршруты для проверки. */
    patrols: () => readonly WorldPatrol[];
    /** Идущие стычки: их площадки и составы. */
    battles: () => readonly WorldBattle[];
    /** Точка земли под курсором. Координаты — доли канваса от 0 до 1. */
    groundAt: (x: number, y: number) => [number, number, number] | null;
    /** Имя фигуры под курсором. Координаты те же. */
    pickAt: (x: number, y: number) => string | null;
    /**
     * Верхушка препятствия в точке или `null`, если там чисто.
     *
     * Та же карта, что держит камеру от столкновений: 8968 инстансов,
     * огрублённых до сфер. Нужна при прокладке маршрутов — без неё дозор
     * проходит сквозь караван, стоящий на дороге.
     */
    blockedAt: (x: number, z: number) => number | null;
    /**
     * Точная высота земли в точке — лучом по геометрии карты.
     *
     * Сетка оболочки для этого не годится: по замеру автора она висит над
     * рельефом (медиана 0,65), и фигура по её высоте идёт по воздуху. Луч
     * стоит около 110 мс, поэтому он только для расстановки и запекания
     * маршрутов, но не для кадра.
     */
    dropAt: (
      x: number,
      z: number,
      onto?: 'ground' | 'props' | 'road' | 'top',
    ) => number | null;
    /**
     * Все высоты ленты дороги в точке, сверху вниз.
     *
     * На мостах лента лежит в два-три слоя, и один ответ здесь врёт: маршрут
     * должен выбирать тот слой, по которому шёл до этого. Выбор — за тем, кто
     * печёт маршрут; здесь только замер.
     */
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
  /** Черновики для сцены: она спрашивает их сама. */
  drafts: WorldDevDrafts;
  /** Снимает горячие клавиши и разбирает пометки. Зовёт `world.dispose`. */
  dispose: () => void;
};

/** Направление замера: луч всегда идёт сверху вниз. */
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Собирает инструменты вокруг живого мира.
 *
 * Зовётся один раз на мир и только в разработке — из `world-dev-overlay`,
 * который сам подключается динамическим импортом.
 */
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

  /**
   * Подводит камеру к стычке. Без имени — к следующей по кругу.
   *
   * Камеру надо сперва забрать у рига: он держит взгляд на станции и каждый
   * кадр возвращает его туда. Без этого камера доезжает до боя и тут же
   * уплывает обратно.
   */
  function goToBattle(id?: string): string | null {
    const list = figures.battles();
    if (list.length === 0) return null;

    const battle = id
      ? list.find((item) => item.id === id)
      : list[((++battleCursor % list.length) + list.length) % list.length];
    if (!battle) return null;

    const view = battleView(battle);

    /*
     * Купол не пускает камеру вниз: он висит над рельефом примерно на 0,6
     * юнита, и поставленная под него камера тут же выталкивается вверх вместе
     * со своей целью — взгляд сохраняется, а бой уезжает под нижний край
     * кадра. Поэтому камера сразу ставится над куполом, а не под ним.
     */
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

  /**
   * Горячие клавиши подбора: Shift+S — снимок, Shift+E — выгрузка всех.
   * Руки при подборе заняты мышью, а лезть в консоль на каждый кадр долго.
   */
  const onDevKey = (event: KeyboardEvent) => {
    if (!event.shiftKey) return;

    /*
     * Обход стычек живёт под флагом расстановки, а не под подбором ракурсов:
     * стычки — часть населения мира, и смотрят их тогда же, когда правят
     * фигур. Своя проверка флага нужна потому, что подбор ракурсов обычно
     * выключен, а посмотреть бой хочется.
     */
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
      // Нажатие клавиши — жест пользователя, буфер обмена в этот момент открыт.
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

        // Ветка к вершине идёт своим цветом: она не часть маршрута карьеры.
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
        // Точка по умолчанию — куда смотрит камера: подводишь вид и ставишь.
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
      goToPatrol: (id: string) => {
        const patrol = figures.patrols().find((item) => item.id === id);
        const lead = figures.object.getObjectByName(`${id}-1`);
        if (!patrol || !lead) return false;

        lead.updateWorldMatrix(true, false);
        const place = lead.getWorldPosition(new THREE.Vector3());

        // Дракона видно и издалека, человека — нет: отступ считаем от роста.
        const away = Math.max(patrol.height * 4, 0.35);
        rig.cancel();
        rig.setStationLook(false);
        rig.setControlMode('orbit');

        camera.position.set(place.x + away, place.y + away * 0.7, place.z + away);
        controls.target.set(place.x, place.y + patrol.height / 2, place.z);
        controls.update();
        return true;
      },
      goToBattle,
      battles: figures.battles,
      goTo: (id: string) => {
        const figure = figures.placed().find((item) => item.id === id);
        if (!figure) return false;

        const [x, y, z] = figure.at;
        // Смотрим с трёх ростов сбоку и чуть сверху: видно и фигуру, и землю
        // под ней — а по земле и правят.
        const away = figure.height * 3;

        /*
         * Камеру надо сперва забрать у рига: он держит взгляд на станции и
         * каждый кадр возвращает его туда. Без этого камера доезжает до фигуры
         * и тут же уплывает обратно.
         */
        rig.cancel();
        rig.setStationLook(false);
        rig.setControlMode('orbit');

        camera.position.set(x + away, y + away * 0.6, z + away);
        controls.target.set(x, y + figure.height / 2, z);
        controls.update();
        return true;
      },
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

        // Место под курсором ищем по сетке оболочки: ответ за микросекунды,
        // а при перетаскивании его спрашивают на каждое движение мыши.
        const point = traceGround(
          raycaster.ray.origin,
          raycaster.ray.direction,
          (px, pz) => {
            const ceiling = shellHeightAt(px, pz);
            return ceiling === null ? null : ceiling - shellPadding();
          },
        );
        if (!point) return null;

        /*
         * А высоту берём лучом по видимой поверхности. Сетка висит над рельефом
         * и у террас указывает на соседний ярус: по её высоте фигура вставала
         * на три юнита ниже земли — по плечи в склоне.
         */
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
    /*
     * Собирается при первом обращении, а не при создании мира: инстансы
     * приходят асинхронно, и след объектов, снятый сразу, был бы пустым.
     */
    get crowd() {
      return crowd();
    },
    /*
     * Тоже лениво: индекс ленты собирается по геометрии карты, а она приходит
     * загрузкой. Собранный при создании мира индекс был бы пустым.
     */
    get patrols() {
      patrolTools ??= createPatrolTools({
        scene,
        // След инстансов у заселения: иначе центровка загоняет дозор в куст,
        // который прежний маршрут обходил стороной.
        blocked: (x, z) => crowd().blocking(x, z),
      });
      return patrolTools;
    },
    /* Тоже лениво и по той же причине: земля приходит загрузкой карты. */
    get battles() {
      battleTools ??= createBattleTools({
        scene,
        blocked: (x, z) => crowd().blocking(x, z),
        // Видимая поверхность, а не земля: под стенами Лейндела земля есть, но
        // стоять там нельзя — сверху ярус террасы.
        surfaceAt: (x, z) => surfaceAt(x, z, 'top'),
      });
      return battleTools;
    },
    shots: {
      save: (name?: string) => {
        const shot = saveShot(camera, controls.target, name);
        // Ракурс объявляет себя проходимым сам: иначе следующий кадр вытолкнет
        // камеру из вида, который только что сохранили.
        applyPockets();
        return shot;
      },
      list: listShots,
      go: (name: string) => {
        const shot = applyShot(name, camera, controls.target);
        // Без `update` контрол вернёт камеру в свои прежние координаты.
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
      /*
       * Несохранённые снимки пробивают купол только при включённом инструменте:
       * иначе чужой `localStorage` дырявил бы оболочку у случайного посетителя.
       */
      pockets: () => (shotTools ? pocketsFromShots() : []),
    },
    dispose: () => {
      window.removeEventListener('keydown', onDevKey);
      // Пометки держат свои текстуры: общий обход сцены их не разберёт.
      clearMarks(scene);
      clearRoute(scene);
      clearRoute(scene, '__dev_peak');
    },
  };
}
