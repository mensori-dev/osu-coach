'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

/**
 * Updates come from the same GitHub release the app is downloaded from:
 * electron-builder writes app-update.yml into resources and latest.yml next to
 * the installer, so the only thing this module does is ask, wait for a click,
 * and hand the installer back to electron-updater.
 *
 * Nothing downloads until the person presses «обновить» — a 120 MB file
 * appearing in the background without a word is rude.
 */

const CHECK_EVERY = 3 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY = 9000;

let state = {
  status: 'idle', // idle | dev | checking | current | available | downloading | ready | error
  version: '',
  percent: 0,
  error: '',
  checkedAt: 0,
  manual: false,
};

let send = () => {};
let autoUpdater = null;
let timer = null;
let logFile = null;

function log(line) {
  try {
    if (!logFile) return;
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // logging is a convenience, never a reason to fail an update
  }
}

function publish(patch) {
  state = { ...state, ...patch };
  send(state);
}

function loadUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    log(`electron-updater is not available: ${err.message || err}`);
    return null;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (msg) => log(`info ${msg}`),
    warn: (msg) => log(`warn ${msg}`),
    error: (msg) => log(`error ${msg}`),
    debug: () => {},
  };

  autoUpdater.on('checking-for-update', () => publish({ status: 'checking', error: '' }));
  autoUpdater.on('update-available', (info) => {
    publish({ status: 'available', version: info?.version || '', error: '' });
  });
  autoUpdater.on('update-not-available', () => {
    publish({ status: 'current', version: app.getVersion(), error: '', checkedAt: Date.now() });
  });
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress?.percent || 0)));
    publish({ status: 'downloading', percent });
  });
  autoUpdater.on('update-downloaded', (info) => {
    publish({ status: 'ready', version: info?.version || state.version, percent: 100 });
  });
  autoUpdater.on('error', (err) => {
    const message = String(err?.message || err || 'update failed');
    log(`updater error: ${message}`);
    publish({ status: 'error', error: message.slice(0, 300) });
  });

  return autoUpdater;
}

async function check(manual = false) {
  if (!app.isPackaged) {
    if (manual) publish({ status: 'dev', error: '', checkedAt: Date.now(), manual: true });
    return state;
  }
  const updater = loadUpdater();
  if (!updater) {
    if (manual) publish({ status: 'error', error: 'updater module missing', manual: true });
    return state;
  }

  if (state.status === 'downloading' || state.status === 'ready') return state;

  publish({ status: 'checking', error: '', manual });
  try {
    await updater.checkForUpdates();
  } catch (err) {
    // Offline is normal, not an emergency: the banner stays quiet unless the
    // person asked for a check themselves.
    publish({
      status: 'error',
      error: String(err?.message || err).slice(0, 300),
      checkedAt: Date.now(),
      manual,
    });
  }
  return state;
}

async function download() {
  if (state.status !== 'available') return state;
  const updater = loadUpdater();
  if (!updater) return state;
  publish({ status: 'downloading', percent: 0, error: '' });
  try {
    await updater.downloadUpdate();
  } catch (err) {
    publish({ status: 'error', error: String(err?.message || err).slice(0, 300) });
  }
  return state;
}

function install() {
  if (state.status !== 'ready') return false;
  log('quitAndInstall');
  const updater = loadUpdater();
  if (!updater) return false;
  // Silent, and start the fresh version right away.
  setImmediate(() => updater.quitAndInstall(true, true));
  return true;
}

function init({ dataDir, onState }) {
  send = typeof onState === 'function' ? onState : () => {};
  logFile = path.join(dataDir, 'updater.log');
  if (!app.isPackaged) {
    publish({ status: 'dev' });
    return;
  }

  setTimeout(() => void check(false), FIRST_CHECK_DELAY);
  timer = setInterval(() => void check(false), CHECK_EVERY);
  if (timer.unref) timer.unref();
}

function current() {
  return state;
}

module.exports = { init, check, download, install, current };
