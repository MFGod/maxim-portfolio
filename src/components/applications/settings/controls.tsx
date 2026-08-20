'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Контролы Settings. Каждому типу настройки свой элемент: переключатель для
 * «да/нет», сегменты для взаимоисключающего выбора, ползунок для числа.
 */

export type Option<T extends string> = { value: T; label: string };

export function SettingRow({
  id,
  label,
  description,
  control,
  highlighted = false,
  stacked = false,
}: {
  id: string;
  label: string;
  description?: string;
  control: ReactNode;
  highlighted?: boolean;
  /** Ставить контрол под подписью. Для широких: обои, акценты, ползунок. */
  stacked?: boolean;
}) {
  return (
    <div
      data-setting={id}
      className={cn(
        'border-line-subtle rounded-lg border px-3.5 py-3 transition-colors duration-(--duration-base)',
        highlighted ? 'border-accent bg-accent-wash' : 'bg-surface-1/50',
        stacked
          ? 'space-y-3'
          : 'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 @max-md:flex-col @max-md:items-start',
      )}
    >
      <div className={cn('min-w-0', stacked ? '' : 'flex-1 @max-md:w-full')}>
        <p className="text-ink text-sm font-medium">{label}</p>
        {description ? (
          <p className="text-ink-faint mt-0.5 text-xs">{description}</p>
        ) : null}
      </div>
      <div className={cn(stacked ? '' : 'shrink-0')}>{control}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-(--duration-fast)',
        checked ? 'border-accent bg-accent/35' : 'border-line bg-surface-3',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition-[left,background-color] duration-(--duration-fast)',
          checked ? 'bg-accent left-[calc(100%-1.25rem)]' : 'bg-ink-faint left-1',
        )}
      />
    </button>
  );
}

/**
 * Группа взаимоисключающих значений. Клавиатура как у радиокнопок: в группу
 * ведёт один Tab, дальше стрелки, Home и End.
 */
function RadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  renderOption,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (next: T) => void;
  className?: string;
  renderOption: (option: Option<T>, selected: boolean) => ReactNode;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, current: number) => {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };

    let next: number | null = null;
    if (event.key in steps)
      next = (current + (steps[event.key] ?? 0) + options.length) % options.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = options.length - 1;
    if (next === null) return;

    const option = options[next];
    if (!option) return;

    event.preventDefault();
    onChange(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {renderOption(option, selected)}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <RadioGroup
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      className="border-line-subtle bg-surface-2 inline-flex rounded-md border p-0.5"
      renderOption={(option, selected) => (
        <span
          className={cn(
            'block rounded-sm px-2.5 py-1 text-xs transition-colors duration-(--duration-fast)',
            selected ? 'bg-surface-4 text-ink' : 'text-ink-faint hover:text-ink-muted',
          )}
        >
          {option.label}
        </span>
      )}
    />
  );
}

export function SwatchPicker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <RadioGroup
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      className="flex flex-wrap gap-2"
      renderOption={(option, selected) => (
        <span
          data-accent={option.value}
          title={option.label}
          className={cn(
            'grid size-8 place-items-center rounded-full border transition-colors duration-(--duration-fast)',
            selected ? 'border-ink' : 'border-line',
          )}
        >
          <span
            aria-hidden
            className="size-5 rounded-full"
            style={{ background: 'var(--swatch)' }}
          />
          <span className="sr-only">{option.label}</span>
        </span>
      )}
    />
  );
}

export function TilePicker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <RadioGroup
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      renderOption={(option, selected) => (
        <span className="block">
          <span
            data-wallpaper={option.value}
            aria-hidden
            className={cn(
              'block h-14 w-full rounded-md border bg-cover',
              selected ? 'border-accent' : 'border-line-subtle',
            )}
            style={{ backgroundImage: 'var(--wp-base)' }}
          />
          <span
            className={cn(
              'mt-1.5 block text-center text-xs',
              selected ? 'text-ink' : 'text-ink-faint',
            )}
          >
            {option.label}
          </span>
        </span>
      )}
    />
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-accent h-1 w-40 max-w-full"
      />
      <span className="text-ink-faint w-12 shrink-0 text-right font-mono text-xs tabular-nums">
        {value}
        {unit}
      </span>
    </div>
  );
}

export function SettingsHint({ children }: { children: ReactNode }) {
  return (
    <p className="text-ink-faint border-line-subtle mt-3 border-l-2 pl-3 text-xs">
      {children}
    </p>
  );
}
