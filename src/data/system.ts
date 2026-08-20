import pkg from '../../package.json';
import { deepFreeze } from '@/lib/freeze';

/**
 * Сведения о системе для одноимённого окна. Всё берётся из `package.json`:
 * выдуманных характеристик здесь быть не должно.
 */

function version(range: string | undefined): string {
  return range ? range.replace(/^[\^~]/, '') : '—';
}

const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

export const systemInfo = deepFreeze({
  name: 'MaximOS',
  tagline: 'Portfolio Environment',
  version: pkg.version,
  stack: [
    { name: 'Next.js', version: version(deps['next']) },
    { name: 'React', version: version(deps['react']) },
    { name: 'TypeScript', version: version(deps['typescript']) },
    { name: 'Tailwind CSS', version: version(deps['tailwindcss']) },
    { name: 'Motion', version: version(deps['motion']) },
    { name: 'Lucide', version: version(deps['lucide-react']) },
  ],
} as const);
