import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-2xs text-ink-faint font-mono tracking-[0.2em] uppercase">
          Ошибка 404
        </p>
        <h1 className="text-ink mt-3 text-2xl font-semibold">Страница не найдена</h1>
        <p className="text-ink-muted mt-2 text-sm">Такого раздела в системе нет.</p>
        <Link
          href="/"
          className="border-accent-dim bg-accent-wash text-accent hover:border-accent mt-6 inline-block rounded-md border px-4 py-2 text-sm transition-colors duration-(--duration-fast)"
        >
          На рабочий стол
        </Link>
      </div>
    </main>
  );
}
