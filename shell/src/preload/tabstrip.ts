import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tabs', {
  onState(callback: (tabs: unknown) => void) {
    ipcRenderer.on('tabs:state', (_event, tabs) => callback(tabs));
    ipcRenderer.send('tabs:ready');
  },
  activate(id: number) {
    ipcRenderer.send('tabs:activate', id);
  },
  close(id: number) {
    ipcRenderer.send('tabs:close', id);
  },
  newTab() {
    ipcRenderer.send('tabs:new');
  },
});
