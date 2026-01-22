const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('latencyOverlay', {
  requestInitial: () => ipcRenderer.invoke('latency:get-initial'),
  onUpdate: (callback) => {
    if (typeof callback !== 'function') {
      return () => undefined;
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('latency:update', listener);

    return () => {
      ipcRenderer.removeListener('latency:update', listener);
    };
  },
  setMiniMode: (mini) => ipcRenderer.invoke('overlay:set-mini', Boolean(mini))
});
