'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  scan: () => ipcRenderer.invoke('scan'),
  replayLatest: () => ipcRenderer.invoke('replay:latest'),
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
    full: () => ipcRenderer.send('win:full'),
    close: () => ipcRenderer.send('win:close'),
    onFull: (callback) => {
      const handler = (_event, on) => callback(on);
      ipcRenderer.on('win:fullstate', handler);
      return () => ipcRenderer.removeListener('win:fullstate', handler);
    },
    onFrame: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on('win:frame', handler);
      return () => ipcRenderer.removeListener('win:frame', handler);
    },
  },
});
