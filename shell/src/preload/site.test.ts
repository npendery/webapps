import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({ webFrame: { executeJavaScript: vi.fn(() => Promise.resolve()) } }));

import { webFrame } from 'electron';
import { CHROME_SHIM_SOURCE, installChromeShim } from './site';

type Win = { chrome?: Record<string, any>; performance?: { now(): number } };

describe('site preload', () => {
  test('runs the shim in the main world on load', () => {
    expect(webFrame.executeJavaScript).toHaveBeenCalledWith(CHROME_SHIM_SOURCE);
  });

  test('fills in the members plain Chromium exposes', () => {
    const w: Win = { chrome: {}, performance: { now: () => 42 } };
    installChromeShim(w);
    expect(Object.keys(w.chrome!).sort()).toEqual(['app', 'csi', 'loadTimes', 'runtime']);
    expect(w.chrome!.csi().pageT).toBe(42);
    expect(w.chrome!.loadTimes().navigationType).toBe('Other');
    expect(w.chrome!.app.getIsInstalled()).toBe(false);
  });

  test('creates window.chrome when absent', () => {
    const w: Win = {};
    installChromeShim(w);
    expect(typeof w.chrome!.loadTimes).toBe('function');
  });

  test('does not clobber existing members', () => {
    const runtime = { id: 'real' };
    const w: Win = { chrome: { runtime } };
    installChromeShim(w);
    expect(w.chrome!.runtime).toBe(runtime);
    expect(typeof w.chrome!.app).toBe('object');
  });

  test('stringified source is self-contained (no module-scope references)', () => {
    const w: Win = {};
    new Function('window', CHROME_SHIM_SOURCE)(w);
    expect(Object.keys(w.chrome!).sort()).toEqual(['app', 'csi', 'loadTimes', 'runtime']);
  });
});
