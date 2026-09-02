import { Menu, type MenuItemConstructorOptions } from 'electron';

export interface Commands {
  newTab(): void;
  closeTab(): void;
  nextTab(): void;
  prevTab(): void;
  selectTab(index: number): void;
  home(): void;
  reload(): void;
  back(): void;
  forward(): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  toggleDevTools(): void;
  openInBrowser(): void;
  copyUrl(): void;
}

export function buildMenu(appName: string, c: Commands): Menu {
  const selectTabItems: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    label: `Select Tab ${i + 1}`,
    accelerator: `Cmd+${i + 1}`,
    click: () => c.selectTab(i),
  }));

  const template: MenuItemConstructorOptions[] = [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'Cmd+T', click: c.newTab },
        { label: 'Close Tab', accelerator: 'Cmd+W', click: c.closeTab },
        { type: 'separator' },
        { label: 'Copy URL', accelerator: 'Cmd+Shift+C', click: c.copyUrl },
        { label: 'Open in Browser', accelerator: 'Cmd+Shift+O', click: c.openInBrowser },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'Cmd+R', click: c.reload },
        { label: 'Home', accelerator: 'Cmd+Shift+H', click: c.home },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'Cmd+Plus', click: c.zoomIn },
        { label: 'Zoom Out', accelerator: 'Cmd+-', click: c.zoomOut },
        { label: 'Actual Size', accelerator: 'Cmd+0', click: c.zoomReset },
        { type: 'separator' },
        { label: 'Toggle Developer Tools', accelerator: 'Alt+Cmd+I', click: c.toggleDevTools },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'History',
      submenu: [
        { label: 'Back', accelerator: 'Cmd+[', click: c.back },
        { label: 'Forward', accelerator: 'Cmd+]', click: c.forward },
      ],
    },
    {
      label: 'Window',
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { label: 'Show Previous Tab', accelerator: 'Cmd+Shift+[', click: c.prevTab },
        { label: 'Show Next Tab', accelerator: 'Cmd+Shift+]', click: c.nextTab },
        { type: 'separator' },
        ...selectTabItems,
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}
