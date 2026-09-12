import type { MenuItemConstructorOptions } from 'electron';

/**
 * The subset of Electron's `ContextMenuParams` the menu reacts to, plus the
 * history state of the tab it was opened on. Narrow on purpose so the template
 * builder stays pure and testable without an Electron runtime.
 */
export interface ContextTarget {
  canGoBack: boolean;
  canGoForward: boolean;
  /** `params.linkURL`, already filtered to http(s); '' when not over a link. */
  linkUrl: string;
  /** `params.isEditable`: a text input, textarea or contenteditable. */
  isEditable: boolean;
  /** `params.selectionText`. */
  selectionText: string;
}

export interface ContextCommands {
  back(): void;
  forward(): void;
  reload(): void;
  openLinkInNewTab(url: string): void;
  copyLink(url: string): void;
}

/**
 * Browsers make the page menu mode-exclusive: a right-click over an editable
 * field, a link, or a selection replaces the Back/Forward/Reload menu rather
 * than extending it. Mirrored here so the muscle memory carries over.
 *
 * Accelerators are display-only (`registerAccelerator: false`) — the real
 * bindings live in the application menu, which is already active.
 */
export function contextMenuTemplate(target: ContextTarget, c: ContextCommands): MenuItemConstructorOptions[] {
  if (target.isEditable) {
    return [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' },
    ];
  }
  if (target.linkUrl) {
    const url = target.linkUrl;
    return [
      { label: 'Open Link in New Tab', click: () => c.openLinkInNewTab(url) },
      { label: 'Copy Link', click: () => c.copyLink(url) },
    ];
  }
  if (target.selectionText) {
    return [{ role: 'copy' }];
  }
  return [
    { label: 'Back', accelerator: 'Cmd+[', registerAccelerator: false, enabled: target.canGoBack, click: c.back },
    {
      label: 'Forward',
      accelerator: 'Cmd+]',
      registerAccelerator: false,
      enabled: target.canGoForward,
      click: c.forward,
    },
    { label: 'Reload', accelerator: 'Cmd+R', registerAccelerator: false, click: c.reload },
  ];
}
