import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SIGIL_COUNT, sigilNameKey } from '@/components/applications/arcade/sigils';
import { TILE_KINDS } from '@/lib/arcade/match3';
import { en } from '@/lib/i18n/en';
import { ru } from '@/lib/i18n/ru';

/**
 * Грань поля описана в четырёх местах: правила знают их число, представление —
 * форму, дизайн-система — тон, словари — название. Тест держит их в согласии:
 * добавленная форма без тона рисовалась бы цветом родителя, а лишняя грань в
 * правилах молча падала бы на первую форму.
 */
describe('грани игрового поля', () => {
  it('форм столько же, сколько граней в правилах', () => {
    expect(SIGIL_COUNT).toBe(TILE_KINDS);
  });

  it('у каждой грани есть свой тон в дизайн-системе', () => {
    const styles = [
      readFileSync('src/app/globals.css', 'utf8'),
      ...readdirSync('src/app/styles')
        .filter((name) => name.endsWith('.css'))
        .map((name) => readFileSync(`src/app/styles/${name}`, 'utf8')),
    ].join('\n');
    for (let kind = 1; kind <= TILE_KINDS; kind += 1) {
      expect(styles, `--color-sigil-${kind}`).toContain(`--color-sigil-${kind}:`);
    }
    expect(styles).not.toContain(`--color-sigil-${TILE_KINDS + 1}:`);
  });

  it('у каждой грани есть название в обоих словарях', () => {
    for (let kind = 0; kind < TILE_KINDS; kind += 1) {
      const key = sigilNameKey(kind);
      expect(key, `грань ${kind}`).toBe(`arcade.sigil.${kind + 1}`);
      expect(ru[key].trim()).not.toBe('');
      expect(en[key].trim()).not.toBe('');
    }
  });
});
