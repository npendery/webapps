import { BaseWindow, WebContentsView, type Result, type WebContents } from 'electron';
import { matchLabel } from '../shared/find';
import { TAB_STRIP_HEIGHT } from './tabs';

const WIDTH = 380;
const HEIGHT = 44;
const MARGIN_RIGHT = 16;

/**
 * Find-in-page bar. Lives in its own view, not the page, so typing in it never
 * reaches the site's key handlers and findInPage cannot steal its focus.
 */
export class FindBar {
  readonly view: WebContentsView;
  private visible = false;
  private query = '';
  private target: WebContents | null = null;
  private readonly onResult = (_event: unknown, result: Result) => {
    if (result.finalUpdate) this.send('find:result', matchLabel(this.query, result));
  };
  private readonly onResize = () => this.layout();

  constructor(
    private readonly window: BaseWindow,
    preload: string,
    html: string,
    private readonly activeWebContents: () => WebContents | null,
  ) {
    this.view = new WebContentsView({ webPreferences: { preload, contextIsolation: true, sandbox: true } });
    this.view.setBackgroundColor('#00000000');
    void this.view.webContents.loadFile(html);
    window.on('resize', this.onResize);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /** Shows the bar (on top of the active tab) and focuses its field with the last query selected. */
  show(): void {
    this.retarget(this.activeWebContents());
    this.window.contentView.addChildView(this.view);
    this.visible = true;
    this.layout();
    this.view.webContents.focus();
    this.send('find:focus');
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.window.contentView.removeChildView(this.view);
    const target = this.target;
    this.retarget(null);
    if (target && !target.isDestroyed()) {
      target.stopFindInPage('keepSelection');
      target.focus();
    }
  }

  /** New query from the field: starts a fresh search session, or clears highlights when empty. */
  search(query: string): void {
    this.query = query;
    const target = this.liveTarget();
    if (!target) return;
    if (!query) {
      target.stopFindInPage('clearSelection');
      this.send('find:result', '');
      return;
    }
    target.findInPage(query, { findNext: true });
  }

  /** Enter / Cmd+G (forward) and Shift+Enter / Cmd+Shift+G (backward). */
  step(forward: boolean): void {
    if (!this.visible) this.show();
    const target = this.liveTarget();
    if (target && this.query) target.findInPage(this.query, { forward, findNext: false });
  }

  layout(): void {
    const [width] = this.window.getContentSize();
    this.view.setBounds({
      x: Math.max(0, width - WIDTH - MARGIN_RIGHT),
      y: TAB_STRIP_HEIGHT,
      width: Math.min(WIDTH, width),
      height: HEIGHT,
    });
  }

  destroy(): void {
    this.window.removeListener('resize', this.onResize);
    this.retarget(null);
    this.view.webContents.close();
  }

  private liveTarget(): WebContents | null {
    return this.target && !this.target.isDestroyed() ? this.target : null;
  }

  private retarget(next: WebContents | null): void {
    if (next === this.target) return;
    if (this.target && !this.target.isDestroyed()) this.target.removeListener('found-in-page', this.onResult);
    this.target = next;
    next?.on('found-in-page', this.onResult);
  }

  private send(channel: string, ...args: unknown[]): void {
    if (!this.view.webContents.isDestroyed()) this.view.webContents.send(channel, ...args);
  }
}
