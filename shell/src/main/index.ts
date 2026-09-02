import { app, BaseWindow, clipboard, ipcMain, Menu, WebContentsView } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { parseHttpUrl } from '../shared/matcher';
import { restoreTabs } from '../shared/policy';
import { resolveSiteConfig, type SiteConfig } from '../shared/site';
import { buildMenu, type Commands } from './menu';
import { attachNavigationPolicy } from './navigation';
import { createStateStore, type StateStore } from './state';
import { TabManager } from './tabs';
import { chromeUserAgent } from './user-agent';

interface AppWindow {
  window: BaseWindow;
  tabs: TabManager;
  openUrl(url: string): void;
  focus(): void;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main(): void {
  const site = resolveSiteConfig({
    resourcesPath: process.resourcesPath,
    siteId: process.env.WEBAPPS_SITE,
    sitesFile: path.join(app.getAppPath(), 'sites.json'),
  });

  app.setName(site.name);
  // Namespaced so it can never collide with another app's data dir (e.g. GitHub Desktop).
  const dataDir = path.join(app.getPath('appData'), 'webapps', site.name);
  app.setPath('userData', dataDir);
  app.setPath('sessionData', dataDir);
  app.userAgentFallback = chromeUserAgent(process.versions.chrome);

  const store = createStateStore(path.join(dataDir, 'state.json'));
  const pending: string[] = [];
  let appWindow: AppWindow | null = null;

  const openIncoming = (url: string) => {
    if (appWindow) appWindow.openUrl(url);
    else pending.push(url);
  };

  // macOS delivers URLs from the router (or `open -b`) here. Must be registered before 'ready'.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    openIncoming(url);
  });

  app.on('second-instance', (_event, argv) => {
    const urls = argv.filter((arg) => parseHttpUrl(arg) !== null);
    if (urls.length === 0) appWindow?.focus();
    for (const url of urls) openIncoming(url);
  });

  app.on('activate', () => {
    if (!appWindow) {
      appWindow = createAppWindow(site, store, () => {
        appWindow = null;
      });
    }
    appWindow.focus();
  });

  app.on('window-all-closed', () => {
    // Stay in the Dock like a normal macOS app; 'activate' recreates the window.
  });

  void app.whenReady().then(() => {
    appWindow = createAppWindow(site, store, () => {
      appWindow = null;
    });
    Menu.setApplicationMenu(buildMenu(site.name, commandsFor(site, () => appWindow)));
    for (const url of pending.splice(0)) appWindow.openUrl(url);
  });
}

function createAppWindow(site: SiteConfig, store: StateStore, onClosed: () => void): AppWindow {
  const saved = store.load();
  const window = new BaseWindow({
    ...(saved.bounds ?? { width: 1280, height: 860 }),
    minWidth: 600,
    minHeight: 400,
    title: site.name,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 12 },
    show: false,
  });

  const strip = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/tabstrip.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  void strip.webContents.loadFile(path.join(app.getAppPath(), 'shell/ui/tabstrip.html'));

  const persist = () =>
    store.save({ bounds: window.getBounds(), tabs: tabs.urls(), activeIndex: tabs.activeIndex() });

  const tabs: TabManager = new TabManager({
    window,
    strip,
    onChange: (list) => {
      strip.webContents.send('tabs:state', list);
      persist();
    },
    onTabCreated: (wc) => attachNavigationPolicy(wc, site, { openTab: (url) => void tabs.newTab(url, true) }),
    onEmpty: () => window.close(),
  });

  const handlers: Record<string, (...args: never[]) => void> = {
    'tabs:ready': () => strip.webContents.send('tabs:state', tabs.list()),
    'tabs:activate': (_e: never, id: never) => tabs.activate(id as number),
    'tabs:close': (_e: never, id: never) => tabs.close(id as number),
    'tabs:new': () => void tabs.newTab(site.home, true),
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.on(channel, handler as never);

  restoreTabs(site, site.home, saved.tabs).forEach((url, index) => tabs.newTab(url, index === saved.activeIndex));

  window.on('moved', persist);
  window.on('resized', persist);
  window.on('close', () => {
    persist();
    store.flush();
  });
  window.on('closed', () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeAllListeners(channel);
    tabs.destroy();
    onClosed();
  });
  window.show();

  return {
    window,
    tabs,
    openUrl(url) {
      tabs.newTab(url, true);
      this.focus();
    },
    focus() {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      app.focus({ steal: true });
    },
  };
}

function commandsFor(site: SiteConfig, current: () => AppWindow | null): Commands {
  const wc = () => current()?.tabs.activeWebContents ?? null;
  const ensure = (): AppWindow | null => {
    if (!current()) app.emit('activate');
    return current();
  };
  return {
    newTab: () => void ensure()?.tabs.newTab(site.home, true),
    closeTab: () => current()?.tabs.closeActive(),
    nextTab: () => current()?.tabs.next(),
    prevTab: () => current()?.tabs.prev(),
    selectTab: (index) => current()?.tabs.activateIndex(index),
    home: () => void wc()?.loadURL(site.home),
    reload: () => wc()?.reload(),
    back: () => {
      const w = wc();
      if (w?.navigationHistory.canGoBack()) w.navigationHistory.goBack();
    },
    forward: () => {
      const w = wc();
      if (w?.navigationHistory.canGoForward()) w.navigationHistory.goForward();
    },
    zoomIn: () => {
      const w = wc();
      if (w) w.setZoomLevel(w.getZoomLevel() + 0.5);
    },
    zoomOut: () => {
      const w = wc();
      if (w) w.setZoomLevel(w.getZoomLevel() - 0.5);
    },
    zoomReset: () => wc()?.setZoomLevel(0),
    toggleDevTools: () => wc()?.toggleDevTools(),
    openInBrowser: () => {
      const url = wc()?.getURL();
      if (url) execFile('open', ['-b', site.fallbackBrowser, url]);
    },
    copyUrl: () => {
      const url = wc()?.getURL();
      if (url) clipboard.writeText(url);
    },
  };
}
