import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { readInstalledFallback } from './routes-config';

const tmpFile = (content?: string) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'webapps-routes-')), 'routes.json');
  if (content !== undefined) fs.writeFileSync(f, content);
  return f;
};

describe('readInstalledFallback', () => {
  test('returns the fallback bundle id from routes.json', () => {
    expect(readInstalledFallback(tmpFile('{"fallback":"com.example.browser","routes":[]}'))).toBe('com.example.browser');
  });
  test('returns null for a missing, malformed, or fallback-less file', () => {
    expect(readInstalledFallback(tmpFile())).toBeNull();
    expect(readInstalledFallback(tmpFile('{nope'))).toBeNull();
    expect(readInstalledFallback(tmpFile('{"routes":[]}'))).toBeNull();
    expect(readInstalledFallback(tmpFile('{"fallback":""}'))).toBeNull();
  });
});
