/**
 * Фон рабочего стола: шесть слоёв, содержимое которых задаётся переменными
 * `--wp-*`. Вариант обоев и тема меняют только переменные, структура та же.
 *
 * Движется один слой — туман, и только трансформом: остальные статичны, чтобы
 * фон не стоил кадров. При просьбе о покое туман замирает (правило
 * `[data-ambient]` в globals.css).
 */

/** Зерно плёнки: тюрбулентность вместо картинки — ассет не нужен. */
const NOISE_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function Wallpaper() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: 'var(--wp-base)' }} />

      <div className="absolute inset-0" style={{ backgroundImage: 'var(--wp-rays)' }} />

      <div
        className="absolute inset-0"
        style={{
          opacity: 'var(--wp-grid-opacity)',
          backgroundImage:
            'linear-gradient(to right, var(--wp-grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--wp-grid-color) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(120% 80% at 50% 30%, #000 0%, transparent 78%)',
        }}
      />

      <div
        data-ambient
        className="absolute -inset-x-1/4 -inset-y-8 will-change-transform"
        style={{
          opacity: 'var(--wp-fog-opacity)',
          backgroundImage: 'var(--wp-fog)',
          animation: 'fog-drift 46s var(--ease-in-out-soft) infinite',
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{ backgroundImage: 'var(--wp-glow)' }}
      />

      <div
        className="absolute inset-0 mix-blend-overlay"
        style={{
          opacity: 'var(--wp-noise-opacity)',
          backgroundImage: NOISE_URL,
          backgroundSize: '160px 160px',
        }}
      />

      <div
        className="absolute inset-0"
        style={{ backgroundImage: 'var(--wp-vignette)' }}
      />
    </div>
  );
}
