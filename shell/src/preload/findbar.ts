import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('findBar', {
  onFocus(callback: () => void) {
    ipcRenderer.on('find:focus', () => callback());
  },
  onResult(callback: (label: string) => void) {
    ipcRenderer.on('find:result', (_event, label) => callback(label));
  },
  search(query: string) {
    ipcRenderer.send('find:search', query);
  },
  step(forward: boolean) {
    ipcRenderer.send('find:step', forward);
  },
  close() {
    ipcRenderer.send('find:close');
  },
});
