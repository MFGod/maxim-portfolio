import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

import { figuresFileBody, isFigure } from '@/lib/world/dev-figures';

/** Запись расстановки фигур обратно в `src/data/world-figures.ts`. */

/** Единственный файл, который эта ручка вправе трогать. */
const TARGET = 'src/data/world-figures.ts';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new Response('Not Found', { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'тело запроса не разобралось' }, { status: 400 });
  }

  if (!Array.isArray(payload) || !payload.every(isFigure)) {
    return Response.json({ error: 'ожидался список фигур' }, { status: 400 });
  }

  const ids = new Set(payload.map((figure) => figure.id));
  if (ids.size !== payload.length) {
    return Response.json({ error: 'имена фигур повторяются' }, { status: 400 });
  }

  const file = path.join(process.cwd(), TARGET);

  try {
    const current = await readFile(file, 'utf8');
    await writeFile(file, figuresFileBody(current, payload), 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'неизвестная причина';
    return Response.json({ error: `не записалось: ${reason}` }, { status: 500 });
  }

  return Response.json({ saved: payload.length, file: TARGET });
}
