// Preload for site pages (sandboxed). Runs before any page script.
//
// Electron ships Chromium without the chrome/ layer, so `window.chrome` is an
// empty object. Google sign-in treats a Chrome UA with an empty `window.chrome`
// as an embedded browser and answers "This browser or app may not be secure".
// The shim fills in the members plain Chromium exposes, in the page's main
// world, via webFrame.executeJavaScript.
//
// Self-contained on purpose: sandboxed preloads cannot require sibling files,
// and installChromeShim is stringified, so it must not touch module scope. The
// history-swipe handler at the bottom of this file is here for the same reason.
import { ipcRenderer, webFrame } from 'electron';

export function installChromeShim(target: {
  chrome?: Record<string, unknown>;
  performance?: { now(): number };
}): void {
  const chrome = (target.chrome ??= {});
  const seconds = () => Date.now() / 1000;
  if (!('app' in chrome)) {
    chrome.app = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getDetails: () => null,
      getIsInstalled: () => false,
      runningState: () => 'cannot_run',
    };
  }
  if (!('csi' in chrome)) {
    chrome.csi = () => ({
      startE: Date.now(),
      onloadT: Date.now(),
      pageT: target.performance ? target.performance.now() : 0,
      tran: 15,
    });
  }
  if (!('loadTimes' in chrome)) {
    chrome.loadTimes = () => ({
      requestTime: seconds(),
      startLoadTime: seconds(),
      commitLoadTime: seconds(),
      finishDocumentLoadTime: seconds(),
      finishLoadTime: seconds(),
      firstPaintTime: seconds(),
      firstPaintAfterLoadTime: 0,
      navigationType: 'Other',
      wasFetchedViaSpdy: true,
      wasNpnNegotiated: true,
      npnNegotiatedProtocol: 'h2',
      wasAlternateProtocolAvailable: false,
      connectionInfo: 'h2',
    });
  }
  if (!('runtime' in chrome)) {
    chrome.runtime = { id: undefined, connect: () => undefined, sendMessage: () => undefined };
  }
}

/** JavaScript source that applies the shim to the page's `window`. */
export const CHROME_SHIM_SOURCE = `(${installChromeShim.toString()})(window);`;

if (typeof webFrame?.executeJavaScript === 'function') {
  void webFrame.executeJavaScript(CHROME_SHIM_SOURCE);
}

// --- History swipe ----------------------------------------------------------
//
// Chromium's two-finger swipe-back lives in chrome/browser (HistorySwiper),
// which Electron does not ship, and BaseWindow's `swipe` event only fires when
// the trackpad is set to "Swipe with two or three fingers" — not the macOS
// default. So the gesture is reconstructed here from wheel events, the way the
// page itself would see them.

/** Horizontal travel, in CSS pixels, that commits the gesture. */
export const SWIPE_THRESHOLD = 180;
/** A gap this long between wheel events starts a new gesture. */
export const SWIPE_IDLE_MS = 200;

export type SwipeAction = 'back' | 'forward' | null;

export interface SwipeGesture {
  /** Signed horizontal travel so far. Negative is a rightward swipe. */
  offset: number;
  /** Timestamp of the last wheel event folded in. */
  at: number;
  /** True once this gesture has navigated, or been cancelled by a vertical scroll. */
  spent: boolean;
}

export const NO_SWIPE: SwipeGesture = { offset: 0, at: 0, spent: false };

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  at: number;
}

/**
 * Folds one wheel event into the gesture and reports whether it commits.
 *
 * A gesture navigates at most once — momentum events keep arriving after the
 * fingers lift, and a vertical component cancels outright, so a diagonal scroll
 * cannot creep past the threshold.
 */
export function stepSwipe(prev: SwipeGesture, sample: WheelSample): { gesture: SwipeGesture; action: SwipeAction } {
  const fresh = sample.at - prev.at > SWIPE_IDLE_MS;
  const base = fresh ? NO_SWIPE : prev;
  if (Math.abs(sample.deltaY) >= Math.abs(sample.deltaX)) {
    return { gesture: { offset: 0, at: sample.at, spent: true }, action: null };
  }
  const offset = base.offset + sample.deltaX;
  const gesture = { offset, at: sample.at, spent: base.spent };
  if (base.spent || Math.abs(offset) < SWIPE_THRESHOLD) return { gesture, action: null };
  // Natural scrolling: swiping the fingers right reports a negative deltaX.
  return { gesture: { ...gesture, spent: true }, action: offset < 0 ? 'back' : 'forward' };
}

/** The scroll geometry of one element on the wheel event's path. */
export interface ScrollBox {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
}

/**
 * True when something under the cursor still has room to scroll the way the
 * wheel is pushing. The page wins in that case — only an overscroll navigates,
 * which is what a browser does.
 */
export function absorbsHorizontalScroll(boxes: ScrollBox[], deltaX: number): boolean {
  for (const box of boxes) {
    if (box.overflowX === 'visible' || box.overflowX === 'hidden') continue;
    const room = box.scrollWidth - box.clientWidth;
    if (room <= 1) continue;
    if (deltaX < 0 && box.scrollLeft > 1) return true;
    if (deltaX > 0 && box.scrollLeft < room - 1) return true;
  }
  return false;
}

function scrollBoxes(path: EventTarget[]): ScrollBox[] {
  const boxes: ScrollBox[] = [];
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    boxes.push({
      scrollLeft: node.scrollLeft,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflowX: getComputedStyle(node).overflowX,
    });
  }
  return boxes;
}

if (typeof document !== 'undefined' && typeof ipcRenderer?.send === 'function') {
  let gesture = NO_SWIPE;
  document.addEventListener(
    'wheel',
    (event) => {
      if (absorbsHorizontalScroll(scrollBoxes(event.composedPath()), event.deltaX)) {
        gesture = { offset: 0, at: event.timeStamp, spent: true };
        return;
      }
      const step = stepSwipe(gesture, { deltaX: event.deltaX, deltaY: event.deltaY, at: event.timeStamp });
      gesture = step.gesture;
      if (step.action) ipcRenderer.send('nav:history', step.action);
    },
    { capture: true, passive: true },
  );
}
