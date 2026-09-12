import { describe, expect, test, vi } from 'vitest';
import { contextMenuTemplate, type ContextCommands, type ContextTarget } from './context-menu';

const target = (overrides: Partial<ContextTarget> = {}): ContextTarget => ({
  canGoBack: true,
  canGoForward: true,
  linkUrl: '',
  isEditable: false,
  selectionText: '',
  ...overrides,
});

const commands = (): ContextCommands => ({
  back: vi.fn(),
  forward: vi.fn(),
  reload: vi.fn(),
  openLinkInNewTab: vi.fn(),
  copyLink: vi.fn(),
});

const labels = (items: { label?: string; role?: string }[]) => items.map((i) => i.label ?? i.role);

describe('contextMenuTemplate', () => {
  test('offers history navigation on a bare page', () => {
    expect(labels(contextMenuTemplate(target(), commands()))).toEqual(['Back', 'Forward', 'Reload']);
  });

  test('disables Back and Forward at the ends of history', () => {
    const items = contextMenuTemplate(target({ canGoBack: false, canGoForward: false }), commands());
    expect(items.map((i) => i.enabled)).toEqual([false, false, undefined]);
  });

  test('Back, Forward and Reload invoke their commands', () => {
    const c = commands();
    const [back, forward, reload] = contextMenuTemplate(target(), c);
    back.click?.(null as never, undefined, null as never);
    forward.click?.(null as never, undefined, null as never);
    reload.click?.(null as never, undefined, null as never);
    expect(c.back).toHaveBeenCalledOnce();
    expect(c.forward).toHaveBeenCalledOnce();
    expect(c.reload).toHaveBeenCalledOnce();
  });

  test('never registers its accelerators, so the app menu keeps the bindings', () => {
    const items = contextMenuTemplate(target(), commands());
    expect(items.every((i) => i.registerAccelerator === false)).toBe(true);
  });

  test('replaces the page menu with link actions over a link', () => {
    const c = commands();
    const items = contextMenuTemplate(target({ linkUrl: 'https://example.com/a' }), c);
    expect(labels(items)).toEqual(['Open Link in New Tab', 'Copy Link']);
    items[0].click?.(null as never, undefined, null as never);
    items[1].click?.(null as never, undefined, null as never);
    expect(c.openLinkInNewTab).toHaveBeenCalledWith('https://example.com/a');
    expect(c.copyLink).toHaveBeenCalledWith('https://example.com/a');
  });

  test('replaces the page menu with edit roles in an editable field', () => {
    const items = contextMenuTemplate(target({ isEditable: true, selectionText: 'hi' }), commands());
    expect(labels(items)).toEqual(['undo', 'redo', undefined, 'cut', 'copy', 'paste', undefined, 'selectAll']);
  });

  test('prefers the edit menu over the link menu inside an editable field', () => {
    const items = contextMenuTemplate(target({ isEditable: true, linkUrl: 'https://example.com/a' }), commands());
    expect(labels(items)).toContain('paste');
  });

  test('offers Copy for a selection outside an editable field', () => {
    expect(labels(contextMenuTemplate(target({ selectionText: 'hello' }), commands()))).toEqual(['copy']);
  });
});
