import { BaseWindow, WebContentsView, type BrowserWindowConstructorOptions, type WebContents } from 'electron';

export const TAB_STRIP_HEIGHT = 38;

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  active: boolean;
  loading: boolean;
}

export interface TabManagerOptions {
  window: BaseWindow;
  strip: WebContentsView;
  /** Preload for site pages (shell/out/preload/site.js). */
  tabPreload: string;
  onChange(tabs: TabInfo[]): void;
  onTabCreated(webContents: WebContents): void;
  /** Fires before the active tab changes, while the outgoing one is still attached. */
  onBeforeActivate(): void;
  onEmpty(): void;
}

interface Tab {
  id: number;
  view: WebContentsView;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
}

/** Owns one WebContentsView per tab; only the active one is attached to the window. */
export class TabManager {
  private tabs: Tab[] = [];
  private activeId: number | null = null;
  private nextId = 1;
  private readonly onResize = () => this.layout();

  constructor(private readonly opts: TabManagerOptions) {
    opts.window.contentView.addChildView(opts.strip);
    opts.window.on('resize', this.onResize);
    this.layout();
  }

  get activeWebContents(): WebContents | null {
    return this.activeTab()?.view.webContents ?? null;
  }

  list(): TabInfo[] {
    return this.tabs.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      favicon: t.favicon,
      loading: t.loading,
      active: t.id === this.activeId,
    }));
  }

  urls(): string[] {
    return this.tabs.map((t) => t.url);
  }

  activeIndex(): number {
    const i = this.tabs.findIndex((t) => t.id === this.activeId);
    return i === -1 ? 0 : i;
  }

  newTab(url: string, activate = true): number {
    const view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, preload: this.opts.tabPreload },
    });
    const id = this.register(view, url, activate);
    void view.webContents.loadURL(url);
    return id;
  }

  /**
   * Turns a page-initiated window.open into a tab. Called from
   * setWindowOpenHandler's `createWindow`, so `options` carries the child
   * webContents Chromium already created; Chromium navigates it, we do not.
   * The caller's window.open therefore returns a real window proxy.
   */
  adopt(options: BrowserWindowConstructorOptions): WebContents {
    const view = new WebContentsView(options);
    this.register(view, '', true);
    return view.webContents;
  }

  private register(view: WebContentsView, url: string, activate: boolean): number {
    const tab: Tab = { id: this.nextId++, view, title: url || 'Loading…', url, favicon: null, loading: true };
    this.tabs.push(tab);
    this.wire(tab);
    this.opts.onTabCreated(view.webContents);
    if (activate || this.activeId === null) this.activate(tab.id);
    else this.emit();
    return tab.id;
  }

  activate(id: number): void {
    const next = this.tabs.find((t) => t.id === id);
    if (!next || next.id === this.activeId) return;
    this.opts.onBeforeActivate();
    const current = this.activeTab();
    if (current) this.opts.window.contentView.removeChildView(current.view);
    this.activeId = next.id;
    this.opts.window.contentView.addChildView(next.view);
    this.layout();
    next.view.webContents.focus();
    this.emit();
  }

  activateIndex(index: number): void {
    const tab = this.tabs[index];
    if (tab) this.activate(tab.id);
  }

  next(): void {
    if (this.tabs.length) this.activateIndex((this.activeIndex() + 1) % this.tabs.length);
  }

  prev(): void {
    if (this.tabs.length) this.activateIndex((this.activeIndex() - 1 + this.tabs.length) % this.tabs.length);
  }

  close(id: number): void {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return;
    const [tab] = this.tabs.splice(index, 1);
    const wasActive = tab.id === this.activeId;
    if (wasActive) {
      this.opts.onBeforeActivate();
      this.opts.window.contentView.removeChildView(tab.view);
      this.activeId = null;
    }
    tab.view.webContents.close();
    if (this.tabs.length === 0) {
      this.emit();
      this.opts.onEmpty();
      return;
    }
    if (wasActive) this.activateIndex(Math.min(index, this.tabs.length - 1));
    else this.emit();
  }

  closeActive(): void {
    if (this.activeId !== null) this.close(this.activeId);
  }

  layout(): void {
    const [width, height] = this.opts.window.getContentSize();
    this.opts.strip.setBounds({ x: 0, y: 0, width, height: TAB_STRIP_HEIGHT });
    this.activeTab()?.view.setBounds({
      x: 0,
      y: TAB_STRIP_HEIGHT,
      width,
      height: Math.max(0, height - TAB_STRIP_HEIGHT),
    });
  }

  destroy(): void {
    this.opts.window.removeListener('resize', this.onResize);
    for (const tab of this.tabs) tab.view.webContents.close();
    this.tabs = [];
    this.activeId = null;
  }

  private activeTab(): Tab | undefined {
    return this.tabs.find((t) => t.id === this.activeId);
  }

  private wire(tab: Tab): void {
    const wc = tab.view.webContents;
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title;
      this.emit();
    });
    wc.on('did-navigate', (_e, url) => {
      tab.url = url;
      this.emit();
    });
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) {
        tab.url = url;
        this.emit();
      }
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      tab.favicon = favicons[0] ?? null;
      this.emit();
    });
    wc.on('did-start-loading', () => {
      tab.loading = true;
      this.emit();
    });
    wc.on('did-stop-loading', () => {
      tab.loading = false;
      this.emit();
    });
  }

  private emit(): void {
    this.opts.onChange(this.list());
  }
}
