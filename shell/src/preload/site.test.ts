import { describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  webFrame: { executeJavaScript: vi.fn(() => Promise.resolve()) },
  ipcRenderer: { send: vi.fn() },
}));

import { webFrame } from 'electron';
import {
  absorbsHorizontalScroll,
  CHROME_SHIM_SOURCE,
  installChromeShim,
  NO_SWIPE,
  stepSwipe,
  SWIPE_IDLE_MS,
  SWIPE_THRESHOLD,
  type ScrollBox,
  type SwipeAction,
  type SwipeGesture,
} from './site';

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

/** Feeds a run of equal wheel deltas, 16ms apart, and reports what fired. */
function swipe(deltas: number[], deltaY = 0, start: SwipeGesture = NO_SWIPE) {
  let gesture = start;
  const actions: SwipeAction[] = [];
  deltas.forEach((deltaX, i) => {
    const step = stepSwipe(gesture, { deltaX, deltaY, at: start.at + 16 * (i + 1) });
    gesture = step.gesture;
    if (step.action) actions.push(step.action);
  });
  return { gesture, actions };
}

const box = (overrides: Partial<ScrollBox> = {}): ScrollBox => ({
  scrollLeft: 0,
  scrollWidth: 100,
  clientWidth: 100,
  overflowX: 'auto',
  ...overrides,
});

describe('stepSwipe', () => {
  test('goes back once a rightward swipe passes the threshold', () => {
    expect(swipe([-60, -60, -60, -60]).actions).toEqual(['back']);
  });

  test('goes forward on a leftward swipe', () => {
    expect(swipe([60, 60, 60, 60]).actions).toEqual(['forward']);
  });

  test('does not fire below the threshold', () => {
    expect(swipe([-SWIPE_THRESHOLD + 1]).actions).toEqual([]);
  });

  test('navigates once per gesture, whatever the momentum tail does', () => {
    expect(swipe([-100, -100, -100, -100, -100, -100]).actions).toEqual(['back']);
  });

  test('a vertical component cancels the gesture instead of accumulating', () => {
    expect(swipe([-100, -100, -100], 400).actions).toEqual([]);
  });

  test('a diagonal scroll cannot creep past the threshold after cancelling', () => {
    const stalled = stepSwipe(NO_SWIPE, { deltaX: -20, deltaY: -80, at: 100 }).gesture;
    expect(swipe([-100, -100], 0, stalled).actions).toEqual([]);
  });

  test('an idle gap starts a fresh gesture', () => {
    const spent = swipe([-100, -100]).gesture;
    const next = stepSwipe(spent, { deltaX: -200, deltaY: 0, at: spent.at + SWIPE_IDLE_MS + 1 });
    expect(next.action).toBe('back');
  });

  test('travel below the threshold does not carry into the next gesture', () => {
    const partial = swipe([-100]).gesture;
    const next = stepSwipe(partial, { deltaX: -100, deltaY: 0, at: partial.at + SWIPE_IDLE_MS + 1 });
    expect(next.action).toBe(null);
  });
});

describe('absorbsHorizontalScroll', () => {
  test('lets the page keep a wheel it can still scroll with', () => {
    expect(absorbsHorizontalScroll([box({ scrollWidth: 500, scrollLeft: 100 })], -50)).toBe(true);
    expect(absorbsHorizontalScroll([box({ scrollWidth: 500, scrollLeft: 100 })], 50)).toBe(true);
  });

  test('releases the wheel at either edge', () => {
    expect(absorbsHorizontalScroll([box({ scrollWidth: 500, scrollLeft: 0 })], -50)).toBe(false);
    expect(absorbsHorizontalScroll([box({ scrollWidth: 500, scrollLeft: 400 })], 50)).toBe(false);
  });

  test('ignores elements with nothing to scroll', () => {
    expect(absorbsHorizontalScroll([box(), box(), box()], -50)).toBe(false);
  });

  test('ignores overflow the wheel cannot drive', () => {
    for (const overflowX of ['visible', 'hidden']) {
      expect(absorbsHorizontalScroll([box({ overflowX, scrollWidth: 500, scrollLeft: 100 })], -50)).toBe(false);
    }
  });

  test('an ancestor further up the path can absorb it', () => {
    const boxes = [box(), box({ scrollWidth: 500, scrollLeft: 100 })];
    expect(absorbsHorizontalScroll(boxes, -50)).toBe(true);
  });
});
