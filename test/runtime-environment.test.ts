import { describe, expect, it } from 'vitest';

import {
  deviceType,
  loadDuration,
  parseBrowser,
  toMegabytes,
} from '@/lib/runtime/environment';

const UA = {
  chrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  firefox:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
};

describe('parseBrowser', () => {
  it('различает Chrome и Safari, хотя оба зовут себя Safari', () => {
    expect(parseBrowser(UA.chrome)).toBe('Chrome 141');
    expect(parseBrowser(UA.safari)).toBe('Safari 18');
  });

  it('Edge не выдаёт себя за Chrome', () => {
    expect(parseBrowser(UA.edge)).toBe('Edge 141');
  });

  it('Firefox определяется', () => {
    expect(parseBrowser(UA.firefox)).toBe('Firefox 133');
  });

  it('незнакомый движок остаётся неизвестным, а не подставляется наугад', () => {
    expect(parseBrowser('SomeCrawler/1.0')).toBeNull();
  });
});

describe('deviceType', () => {
  it('точный указатель — всегда десктоп, даже в узком окне', () => {
    expect(deviceType(600, false)).toBe('desktop');
  });

  it('сенсорный ввод делится по ширине', () => {
    expect(deviceType(390, true)).toBe('phone');
    expect(deviceType(1024, true)).toBe('tablet');
  });
});

describe('loadDuration', () => {
  it('незакрытая запись не превращается в ноль миллисекунд', () => {
    expect(loadDuration(undefined)).toBeNull();
    expect(
      loadDuration({ loadEventEnd: 0, startTime: 0 } as PerformanceNavigationTiming),
    ).toBeNull();
  });

  it('считает время от начала навигации', () => {
    expect(
      loadDuration({
        loadEventEnd: 1240.6,
        startTime: 40.2,
      } as PerformanceNavigationTiming),
    ).toBe(1200);
  });
});

describe('toMegabytes', () => {
  it('округляет до десятых', () => {
    expect(toMegabytes(1024 * 1024 * 12.34)).toBe(12.3);
  });
});
