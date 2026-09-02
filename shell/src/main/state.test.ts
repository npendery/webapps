import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { createStateStore, EMPTY_STATE, readState, writeState } from './state';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'webapps-state-')), 'nested', 'state.json');

describe('readState', () => {
  test('returns EMPTY_STATE for a missing file', () => {
    expect(readState(tmpFile())).toEqual(EMPTY_STATE);
  });
  test('returns EMPTY_STATE for malformed JSON', () => {
    const f = tmpFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '{nope');
    expect(readState(f)).toEqual(EMPTY_STATE);
  });
  test('sanitizes partial or wrong-typed content', () => {
    const f = tmpFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ tabs: ['https://a.com/', 42, 'ftp://x'], activeIndex: 9, bounds: { x: 1 } }));
    expect(readState(f)).toEqual({ bounds: null, tabs: ['https://a.com/'], activeIndex: 0 });
  });
});

describe('writeState/readState round trip', () => {
  test('creates parent dirs and round-trips', () => {
    const f = tmpFile();
    const state = {
      bounds: { x: 10, y: 20, width: 800, height: 600 },
      tabs: ['https://a.com/', 'https://b.com/'],
      activeIndex: 1,
    };
    writeState(f, state);
    expect(readState(f)).toEqual(state);
  });
});

describe('createStateStore', () => {
  test('debounces saves and flush writes synchronously', () => {
    vi.useFakeTimers();
    const f = tmpFile();
    const store = createStateStore(f, 500);
    store.save({ bounds: null, tabs: ['https://one/'], activeIndex: 0 });
    store.save({ bounds: null, tabs: ['https://two/'], activeIndex: 0 });
    expect(fs.existsSync(f)).toBe(false);
    vi.advanceTimersByTime(500);
    expect(readState(f).tabs).toEqual(['https://two/']);
    store.save({ bounds: null, tabs: ['https://three/'], activeIndex: 0 });
    store.flush();
    expect(readState(f).tabs).toEqual(['https://three/']);
    vi.useRealTimers();
  });
});
