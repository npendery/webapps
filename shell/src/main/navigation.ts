import { shell, type WebContents } from 'electron';
import { decideNavigation, decideWindowOpen } from '../shared/policy';
import type { SiteConfig } from '../shared/site';

export interface NavigationHooks {
  openTab(url: string): void;
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
        hooks.openTab(decision.url);
        return { action: 'deny' };
      case 'external':
        openExternal(decision.url);
        return { action: 'deny' };
      case 'popup':
        return { action: 'allow' };
    }
  });

  // Popups created with action: 'allow' get the same policy.
  wc.on('did-create-window', (child) => {
    attachNavigationPolicy(child.webContents, site, hooks);
  });
}
