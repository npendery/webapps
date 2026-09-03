import { shell, type BrowserWindowConstructorOptions, type WebContents } from 'electron';
import { decideNavigation, decideWindowOpen } from '../shared/policy';
import type { SiteConfig } from '../shared/site';

export interface NavigationHooks {
  /**
   * Wraps a window.open child in a tab and returns its webContents
   * (setWindowOpenHandler `createWindow` contract).
   */
  adoptTab(options: BrowserWindowConstructorOptions): WebContents;
  /** Preload for popup windows, same as for tabs. */
  tabPreload: string;
  /** Defaults to shell.openExternal, i.e. the system default browser (the router). */
  openExternal?(url: string): void;
}

/** Keep in-scope navigation inside the app; hand everything else to the system default browser. */
export function attachNavigationPolicy(wc: WebContents, site: SiteConfig, hooks: NavigationHooks): void {
  const openExternal = hooks.openExternal ?? ((url: string) => void shell.openExternal(url));

  wc.on('will-navigate', (event, url) => {
    const decision = decideNavigation(site, url);
    if (decision.action === 'external') {
      event.preventDefault();
      openExternal(decision.url);
    }
  });

  wc.setWindowOpenHandler(({ url }) => {
    const decision = decideWindowOpen(site, url);
    switch (decision.action) {
      case 'tab':
        // Not 'deny' + our own tab: that makes window.open return null and
        // sites (Gmail notifications) report a blocked pop-up.
        // Child web preferences come from this override, not from the opener,
        // so the preload (chrome shim) must be passed explicitly.
        return {
          action: 'allow',
          outlivesOpener: true,
          overrideBrowserWindowOptions: {
            webPreferences: { preload: hooks.tabPreload, sandbox: true, contextIsolation: true },
          },
          createWindow: (options) => hooks.adoptTab(options),
        };
      case 'external':
        openExternal(decision.url);
        return { action: 'deny' };
      case 'popup':
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            webPreferences: { preload: hooks.tabPreload, sandbox: true, contextIsolation: true },
          },
        };
    }
  });

  // Popups created with action: 'allow' get the same policy.
  wc.on('did-create-window', (child) => {
    attachNavigationPolicy(child.webContents, site, hooks);
  });
}
