'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  scan: () => ipcRenderer.invoke('scan'),
  replayLatest: () => ipcRenderer.invoke('replay:latest'),
  replayAnalyze: (filePath) => ipcRenderer.invoke('replay:analyze', filePath),
  replayPick: () => ipcRenderer.invoke('replay:pick'),
  replayOpenFolder: () => ipcRenderer.invoke('replay:open-folder'),
  refreshApi: () => ipcRenderer.invoke('api:refresh'),
  searchMaps: (params) => ipcRenderer.invoke('maps:search', params),
  quickSearch: (params) => ipcRenderer.invoke('maps:quick', params),
  installedSets: () => ipcRenderer.invoke('maps:installed'),
  openMap: (target) => ipcRenderer.invoke('osu:open-map', target),
  coverData: (url) => ipcRenderer.invoke('cover:data', url),
  downloadMap: (setId) => ipcRenderer.invoke('maps:download', setId),
  launchTosu: () => ipcRenderer.invoke('tosu:launch'),
  pickTosu: () => ipcRenderer.invoke('tosu:pick'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  updates: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onState: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on('update', handler);
      return () => ipcRenderer.removeListener('update', handler);
    },
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  campaignPlan: () => ipcRenderer.invoke('campaign:plan'),
  campaignReset: () => ipcRenderer.invoke('campaign:reset'),
  campaignState: () => ipcRenderer.invoke('campaign:state'),
  onRecord: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('record', handler);
    return () => ipcRenderer.removeListener('record', handler);
  },
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
