'use client';

import { FIGURE_CLIPS, type FigureClip, type WorldFigure } from '@/data/world-figures';
import { cn } from '@/lib/cn';

/**
 * Панель расстановки фигур. Текст без словаря намеренно: она не часть продукта
 * и уедет вместе с `dev-figures.ts`, когда расстановка ляжет в данные.
 */
type Props = {
  figures: WorldFigure[];
  selected: string | null;
  /** Режим постановки: щелчок по земле ставит новую фигуру. */
  placing: boolean;
  copied: boolean;
  onPlacing: (next: boolean) => void;
  onSelect: (id: string | null) => void;
  onTweak: (patch: { clip?: FigureClip; height?: number; turn?: number }) => void;
  onRemove: () => void;
  /** Подвести камеру к выбранной фигуре. */
  onGoTo: () => void;
  /** Идущие группы: дозоры и драконы. */
  patrols: { id: string; height: number }[];
  /** Подвести камеру к группе. */
  onGoToPatrol: (id: string) => void;
  /** Стычки: где живые дерутся с нежитью. */
  battles: { id: string }[];
  /** Подвести камеру к стычке. */
  onGoToBattle: (id: string) => void;
  /** Шаг по списку: −1 назад, +1 вперёд. Камера едет следом. */
  onStep: (delta: number) => void;
  onCopy: () => void;
  onSave: () => void;
  /** Выйти из режима правки. */
  onExit: () => void;
  /** Что с сохранением сейчас: ждём, сохранили или не вышло. */
  saving: 'ждём' | 'идёт' | 'готово' | 'ошибка';
  onClear: () => void;
};

/** Шаги подбора. Рост — доля от текущего, поворот — восьмушка оборота. */
const HEIGHT_STEP = 1.25;
const TURN_STEP = Math.PI / 8;

export function FigureTuner({
  figures,
  selected,
  placing,
  copied,
  onPlacing,
  onSelect,
  onTweak,
  onRemove,
  onGoTo,
  patrols,
  onGoToPatrol,
  battles,
  onGoToBattle,
  onStep,
  onCopy,
  onSave,
  onExit,
  saving,
  onClear,
}: Props) {
  const current = figures.find((figure) => figure.id === selected) ?? null;

  return (
    <div className="border-line-subtle bg-surface-1/85 absolute right-3 bottom-3 w-56 rounded-sm border p-2 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExit}
            className="border-line-subtle text-2xs text-ink-faint hover:text-ink rounded-xs border px-1"
            title="Выйти из правки"
          >
            ✕
          </button>
          <p className="text-2xs text-ink-muted font-mono">Фигуры · {figures.length}</p>
          <button
            type="button"
            onClick={() => onStep(-1)}
            disabled={figures.length === 0}
            className="border-line-subtle text-2xs text-ink-muted hover:text-ink rounded-xs border px-1 disabled:opacity-40"
            title="Предыдущая фигура"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            disabled={figures.length === 0}
            className="border-line-subtle text-2xs text-ink-muted hover:text-ink rounded-xs border px-1 disabled:opacity-40"
            title="Следующая фигура"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={() => onPlacing(!placing)}
          className={cn(
            'text-2xs rounded-xs px-2 py-1',
            placing ? 'bg-accent-wash text-accent' : 'text-ink-muted hover:text-ink',
          )}
        >
          {placing ? 'Ставлю щелчком' : 'Поставить'}
        </button>
      </div>

      <p className="text-2xs text-ink-faint mt-1 font-mono leading-snug">
        {placing
          ? 'Щелчок по земле — новая фигура'
          : 'Тяни фигуру мышью · Q E поворот · , . рост'}
      </p>

      {patrols.length > 0 ? (
        <div className="border-line-subtle mt-2 border-t pt-1">
          <p className="text-2xs text-ink-faint font-mono">Идущие</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {patrols.map((patrol) => (
              <button
                key={patrol.id}
                type="button"
                onClick={() => onGoToPatrol(patrol.id)}
                title={patrol.id}
                className="border-line-subtle text-2xs text-ink-muted hover:text-ink rounded-xs border px-1.5 py-0.5 font-mono"
              >
                {patrol.id.replace('дозор-', '№').replace('дракон-', '')}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {battles.length > 0 ? (
        <div className="border-line-subtle mt-2 border-t pt-1">
          <p className="text-2xs text-ink-faint font-mono">Стычки</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {battles.map((battle) => (
              <button
                key={battle.id}
                type="button"
                onClick={() => onGoToBattle(battle.id)}
                title={battle.id}
                className="border-line-subtle text-2xs text-ink-muted hover:text-ink rounded-xs border px-1.5 py-0.5 font-mono"
              >
                {battle.id.replace('стычка-', '')}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {figures.length > 0 ? (
        <ul className="border-line-subtle mt-2 max-h-32 overflow-y-auto border-t pt-1">
          {figures.map((figure) => (
            <li key={figure.id}>
              <button
                type="button"
                onClick={() => onSelect(figure.id === selected ? null : figure.id)}
                className={cn(
                  'text-2xs w-full truncate rounded-xs px-1.5 py-1 text-left font-mono',
                  figure.id === selected
                    ? 'bg-accent-wash text-accent'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {figure.id} · {figure.clip}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {current ? (
        <div className="border-line-subtle mt-2 space-y-1 border-t pt-2">
          <label className="text-2xs text-ink-muted flex items-center gap-1 font-mono">
            клип
            <select
              value={current.clip}
              onChange={(event) => onTweak({ clip: event.target.value as FigureClip })}
              className="border-line-subtle bg-surface-2 text-2xs min-w-0 flex-1 rounded-xs border px-1 py-0.5 font-mono"
            >
              {FIGURE_CLIPS.map((clip) => (
                <option key={clip} value={clip}>
                  {clip}
                </option>
              ))}
            </select>
          </label>

          <div className="text-2xs text-ink-muted flex items-center gap-1 font-mono">
            рост
            <button
              type="button"
              onClick={() => onTweak({ height: current.height / HEIGHT_STEP })}
              className="border-line-subtle hover:text-ink rounded-xs border px-1.5"
            >
              −
            </button>
            <span className="text-ink w-12 text-center">
              {current.height.toFixed(3)}
            </span>
            <button
              type="button"
              onClick={() => onTweak({ height: current.height * HEIGHT_STEP })}
              className="border-line-subtle hover:text-ink rounded-xs border px-1.5"
            >
              +
            </button>
          </div>

          <div className="text-2xs text-ink-muted flex items-center gap-1 font-mono">
            поворот
            <button
              type="button"
              onClick={() => onTweak({ turn: current.turn - TURN_STEP })}
              className="border-line-subtle hover:text-ink rounded-xs border px-1.5"
            >
              ↺
            </button>
            <span className="text-ink w-12 text-center">{current.turn.toFixed(2)}</span>
            <button
              type="button"
              onClick={() => onTweak({ turn: current.turn + TURN_STEP })}
              className="border-line-subtle hover:text-ink rounded-xs border px-1.5"
            >
              ↻
            </button>
          </div>

          <p className="text-2xs text-ink-faint font-mono">
            {current.at.map((value) => value.toFixed(2)).join(' · ')}
          </p>

          <button
            type="button"
            onClick={onRemove}
            className="text-2xs text-ink-faint hover:text-ink rounded-xs px-1 py-0.5"
          >
            Удалить
          </button>
          <button
            type="button"
            onClick={onGoTo}
            className="border-line-subtle text-2xs text-ink-muted hover:text-ink ml-auto rounded-xs border px-1.5 py-0.5"
          >
            К фигуре
          </button>
        </div>
      ) : null}

      <div className="border-line-subtle mt-2 flex items-center gap-1 border-t pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={figures.length === 0 || saving === 'идёт'}
          className={cn(
            'text-2xs rounded-xs px-2 py-1 disabled:opacity-40',
            saving === 'ошибка'
              ? 'text-danger'
              : saving === 'готово'
                ? 'text-accent'
                : 'bg-accent-wash text-accent',
          )}
        >
          {
            {
              ждём: 'Сохранить',
              идёт: 'Сохраняю…',
              готово: 'Сохранено',
              ошибка: 'Не вышло',
            }[saving]
          }
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={figures.length === 0}
          className="text-2xs text-ink-muted hover:text-ink rounded-xs px-2 py-1 disabled:opacity-40"
        >
          {copied ? 'Скопировано' : 'Копия'}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={figures.length === 0}
          className="text-2xs text-ink-faint hover:text-ink rounded-xs px-2 py-1 disabled:opacity-40"
        >
          Очистить
        </button>
      </div>
    </div>
  );
}
