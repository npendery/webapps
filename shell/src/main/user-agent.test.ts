import { expect, test } from 'vitest';
import { chromeUserAgent } from './user-agent';

test('builds a Chrome UA with major version only and no Electron token', () => {
  const ua = chromeUserAgent('132.0.6834.83');
  expect(ua).toBe(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  );
  expect(ua).not.toMatch(/Electron/);
});
