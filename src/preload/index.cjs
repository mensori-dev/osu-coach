'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  scan: () => ipcRenderer.invoke('scan'),
  refreshApi: () => ipcRenderer.invoke('api:refresh'),
  searchMaps: (params) => ipcRenderer.invoke('maps:search', params),
  installedSets: () => ipcRenderer.invoke('maps:installed'),
  openMap: (target) => ipcRenderer.invoke('osu:open-map', target),
  coverData: (url) => ipcRenderer.invoke('cover:data', url),
  downloadMap: (setId) => ipcRenderer.invoke('maps:download', setId),
  launchTosu: () => ipcRenderer.invoke('tosu:launch'),
  pickTosu: () => ipcRenderer.invoke('tosu:pick'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onLive: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('live', handler);
    return () => ipcRenderer.removeListener('live', handler);
  },
  onData: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('data', handler);
    return () => ipcRenderer.removeListener('data', handler);
  },
  win: {
    min: () => ipcRenderer.send('win:min'),
    max: () => ipcRenderer.send('win:max'),
    close: () => ipcRenderer.send('win:close'),
  },
});
