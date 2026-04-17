const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('livenat', {
  getState: () => ipcRenderer.invoke('get-state'),
  onUpdate: (fn) => {
    if (typeof fn !== 'function') return () => {};
    const listener = (_e, data) => fn(data);
    ipcRenderer.on('state-update', listener);
    return () => ipcRenderer.removeListener('state-update', listener);
  }
});
