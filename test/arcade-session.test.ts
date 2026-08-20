import { describe, expect, it } from 'vitest';

import { issueToken, verifyToken } from '@/lib/arcade/session';

const NOW = 1_700_000_000_000;

describe('токен запуска', () => {
  it('проверяется и отдаёт игру со временем старта', () => {
    const token = issueToken('memory', NOW);
    expect(verifyToken(token, NOW + 5_000)).toMatchObject({
      game: 'memory',
      issuedAt: NOW,
    });
  });

  it('выдаёт разные запуски: одноразовость держится на nonce', () => {
    expect(issueToken('memory', NOW)).not.toBe(issueToken('memory', NOW));
  });

  it('отклоняет подделанную подпись', () => {
    const token = issueToken('memory', NOW);
    const parts = token.split('.');
    parts[3] = 'a'.repeat(parts[3]?.length ?? 43);
    expect(verifyToken(parts.join('.'), NOW)).toBeNull();
  });

  it('отклоняет подменённую игру и подменённое время', () => {
    const [, nonce, issued, signature] = issueToken('memory', NOW).split('.');
    expect(
      verifyToken(`tower-builder.${nonce}.${issued}.${signature}`, NOW),
    ).toBeNull();
    expect(verifyToken(`memory.${nonce}.${NOW - 60_000}.${signature}`, NOW)).toBeNull();
  });

  it('отклоняет просроченный и пришедший из будущего', () => {
    const token = issueToken('memory', NOW);
    expect(verifyToken(token, NOW + 21 * 60_000)).toBeNull();
    expect(verifyToken(token, NOW - 1_000)).toBeNull();
  });

  it('отклоняет мусор вместо токена', () => {
    expect(verifyToken(null, NOW)).toBeNull();
    expect(verifyToken('', NOW)).toBeNull();
    expect(verifyToken('memory.nonce.123', NOW)).toBeNull();
  });
});
