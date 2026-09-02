// Preload for site pages (sandboxed). Runs before any page script.
//
// Electron ships Chromium without the chrome/ layer, so `window.chrome` is an
// empty object. Google sign-in treats a Chrome UA with an empty `window.chrome`
// as an embedded browser and answers "This browser or app may not be secure".
// The shim fills in the members plain Chromium exposes, in the page's main
// world, via webFrame.executeJavaScript.
//
// Self-contained on purpose: sandboxed preloads cannot require sibling files,
// and installChromeShim is stringified, so it must not touch module scope.
import { webFrame } from 'electron';

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
