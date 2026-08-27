'use client';

import { cn } from '@/lib/cn';

import { RadioGroup, type Option } from './controls';

/**
 * Контролы выбора с наглядным образцом: цвет акцента, обои, размер значка.
 * Отличаются от сегментов тем, что показывают не подпись, а сам результат.
 */

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
