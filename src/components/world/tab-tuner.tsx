'use client';

import { useEffect } from 'react';

import { cn } from '@/lib/cn';
import type { BookProbe } from '@/lib/world/book/debug';
import type { TabPose } from '@/lib/world/book/tab';

/**
 * Панель подбора закладки. Живёт только в разработке.
 *
 * Положение язычка на книге подбирается глазами: доля страницы, выступ над
 * головкой и наклон не выводятся ниоткуда, а «красиво» видно только на кадре.
 * Держать этот подбор в правках исходника — по перезагрузке мира на каждое
 * число, а мир поднимается полминуты.
 *
 * Панель висит на проекции самой закладки и едет вместе с книгой: смотреть на
 * язычок, а руками работать в другом конце экрана — тот же подбор вслепую.
 *
 * Подобранное сюда не сохраняется намеренно. Числа показываются готовой
 * строкой, и место им — в `TAB` в `metrics.ts`, а не в памяти вкладки.
 */
type Props = {
  probe: BookProbe;
  /** Текущее положение. `null`, пока ни одного шага не сделано. */
  pose: TabPose | null;
  onNudge: (delta: Partial<TabPose>) => void;
  /** Прочитать положение у книги — на первом кадре панели. */
  onRead: () => void;
};

/**
 * Шаг подбора.
 *
 * Доля страницы, юниты мира и радианы — величины разного порядка, общего шага
 * у них быть не может. Подобраны так, чтобы одно нажатие было заметно глазом,
 * но не перепрыгивало нужное место.
 */
const STEP = { along: 0.02, reach: 0.002, tilt: 0.03 };

const BUTTON =
  'grid size-6 place-items-center rounded-xs bg-black/70 text-white hover:bg-black/90';

export function TabTuner({ probe, pose, onNudge, onRead }: Props) {
  // Первое чтение — у книги: панель не знает начальных значений, они заданы
  // в метриках, а показывать «—» до первого нажатия значило бы подбирать от
  // неизвестного.
  useEffect(() => {
    if (!pose) onRead();
  }, [pose, onRead]);

  const tab = probe.parts.find((part) => part.name === 'tab');
  if (!tab) return null;

  const step = (delta: Partial<TabPose>) => () => onNudge(delta);

  return (
    <div
      className="pointer-events-auto absolute flex flex-col gap-1"
      style={{
        // Правее закладки на её ширину: над ней кнопки перекрыли бы то, что
        // подбирают.
        left: `${(tab.right + (tab.right - tab.left) * 0.4) * 100}%`,
        top: `${tab.top * 100}%`,
      }}
    >
      <div className="flex gap-1">
        <button type="button" className={BUTTON} onClick={step({ along: -STEP.along })}>
          ←
        </button>
        <button type="button" className={BUTTON} onClick={step({ along: STEP.along })}>
          →
        </button>
        <button type="button" className={BUTTON} onClick={step({ reach: STEP.reach })}>
          ↑
        </button>
        <button type="button" className={BUTTON} onClick={step({ reach: -STEP.reach })}>
          ↓
        </button>
        <button type="button" className={BUTTON} onClick={step({ tilt: STEP.tilt })}>
          ⟲
        </button>
        <button type="button" className={BUTTON} onClick={step({ tilt: -STEP.tilt })}>
          ⟳
        </button>
      </div>

      <p
        className={cn(
          'text-2xs rounded-sm bg-black/70 px-2 py-1 font-mono whitespace-nowrap text-white',
        )}
      >
        {pose
          ? `along: ${pose.along.toFixed(3)}, reach: ${pose.reach.toFixed(4)}, tilt: ${pose.tilt.toFixed(3)}`
          : '…'}
      </p>
    </div>
  );
}
