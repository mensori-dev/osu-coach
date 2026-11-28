'use strict';

const { app, BrowserWindow, ipcMain, shell, screen, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn, execFile } = require('node:child_process');
const { loadEnv } = require('./env.cjs');
const { readJson, writeJson } = require('./store.cjs');
const { scanStable, findBeatmapByHash } = require('./stable.cjs');
const { OsuApi } = require('./api.cjs');
const { TosuBridge } = require('./tosu.cjs');
const { normalizeTosu, idlePayload } = require('./live.cjs');
const { Demo } = require('./demo.cjs');
const { startTosu } = require('./tosu-launch.cjs');
const replay = require('./replay.cjs');
const updater = require('./updater.cjs');
const { CampaignStore, build: buildCampaign, sync: syncCampaign, view: viewCampaign } = require('./campaign.cjs');

const rootDir = app.getAppPath();
loadEnv([
  path.join(process.cwd(), '.env'),
  path.join(rootDir, '.env'),
  path.join(path.dirname(process.execPath), '.env'),
]);

const dataDir = path.join(app.getPath('userData'), 'data');
const settingsFile = path.join(dataDir, 'settings.json');
const scanFile = path.join(dataDir, 'scan.json');
const apiCacheFile = path.join(dataDir, 'api-cache.json');
const profileFile = path.join(dataDir, 'profile.json');
const campaignStore = new CampaignStore(path.join(dataDir, 'campaign.json'));
const defaults = {
  user: process.env.OSU_USER || '',
  demo: false,
  tosuPort: 24050,
  tosuPath: '',
  osuDir: '',
  apiClientId: process.env.OSU_CLIENT_ID || '',
  apiClientSecret: process.env.OSU_CLIENT_SECRET || '',
  onboarded: false,
  tutorialSeen: false,
  device: 'unknown',
  tapping: 'unknown',
  goal: 'accuracy',
  dailyMinutes: 60,
  style: 'mixed',
  modPref: 'nm',
  music: '',
  annoy: 'unknown',
  theme: 'cover',
  overlay: false,
  overlayPos: 'tl',
};

let settings = { ...defaults, ...readJson(settingsFile, {}) };
let scan = readJson(scanFile, null);
let profile = readJson(profileFile, { facts: [] });
let tosuStatus = { connected: false, port: settings.tosuPort };
let lastPayload = idlePayload(false, settings.tosuPort);
let win = null;
let overlay = null;
let demo = new Demo();
let demoLast = 0;

const api = new OsuApi({
  clientId: settings.apiClientId || process.env.OSU_CLIENT_ID,
  clientSecret: settings.apiClientSecret || process.env.OSU_CLIENT_SECRET,
  user: settings.user,
  cacheFile: apiCacheFile,
});

const tosu = new TosuBridge({
  port: settings.tosuPort,
  onStatus: (status) => {
    tosuStatus = status;
  },
});

const osuDir = path.join(process.env.LOCALAPPDATA || '', 'osu!');

function activeOsuDir() {
  return settings.osuDir || osuDir;
}

function saveSettings() {
  writeJson(settingsFile, settings);
}

function recordFacts(result) {
  if (!result?.ok) return;
  const facts = Array.isArray(profile.facts) ? profile.facts : [];
  const last = facts[facts.length - 1];
  const snapshot = {
    at: Date.now(),
    playsTotal: result.playsTotal,
    avgAcc: Math.round(result.avgAcc * 10) / 10,
    medianAcc: Math.round(result.medianAcc * 10) / 10,
    comfortStar: result.comfortStar,
    comfortAcc: Math.round((result.comfortAcc ?? 0) * 10) / 10,
    hardStar: result.hardStar,
    hardAcc: Math.round((result.hardAcc ?? 0) * 10) / 10,
    pp: api.snapshot()?.profile?.pp ?? last?.pp ?? null,
  };
  const changed = !last || snapshot.playsTotal !== last.playsTotal || Math.abs(snapshot.avgAcc - last.avgAcc) >= 0.5;
  if (last && Date.now() - last.at < 3 * 60 * 60 * 1000 && !changed) return;
  facts.push(snapshot);
  profile = { facts: facts.slice(-120) };
  writeJson(profileFile, profile);
}

let installedCache = { at: 0, ids: [] };
const coverCache = new Map();

/**
 * osu! writes scores.db when it leaves the results screen. Watching the game
 * folder means the app can rescan and push fresh numbers to the renderer by
 * itself — no button, no tab switch, no waiting for a poll.
 */
let osuWatch = null;
let osuWatchTimer = null;

function watchOsuDir() {
  if (osuWatch) {
    try {
      osuWatch.close();
    } catch {
      // already closed
    }
    osuWatch = null;
  }
  if (osuWatchTimer) {
    clearTimeout(osuWatchTimer);
    osuWatchTimer = null;
  }

  const dir = activeOsuDir();
  if (!dir) return;

  try {
    osuWatch = fs.watch(dir, { persistent: false }, (_event, filename) => {
      const name = String(filename || '').toLowerCase();
      if (name !== 'scores.db' && name !== 'osu!.db') return;
      if (osuWatchTimer) clearTimeout(osuWatchTimer);
      osuWatchTimer = setTimeout(() => {
        osuWatchTimer = null;
        installedCache = { at: 0, ids: [] };
        rescan();
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send('data', bootstrap());
        }
      }, 1200);
    });
  } catch {
    // Folder watching is a bonus; manual rescans still work without it.
  }
}

function rescan() {
  const dir = activeOsuDir();
  try {
    scan = scanStable(dir);
    writeJson(scanFile, scan);
    recordFacts(scan);
    installedCache = { at: 0, ids: [] };
    syncCampaignState();
  } catch (err) {
    scan = { ok: false, error: String(err.message || err), scannedAt: Date.now() };
  }
  return scan;
}

/**
 * The campaign reads the same scores.db as everything else: a new play either
 * checks a stage off or sets a personal record, and the renderer hears about it
 * right away instead of on the next tab switch.
 */
function syncCampaignState() {
  const state = campaignStore.load();
  if (!state || !scan?.ok) return;
  const result = syncCampaign(state, scan);
  if (result.changed) campaignStore.save(state);
  if (result.records.length) {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('record', result.records);
    }
  }
}

/**
 * Beatmapset ids actually present in osu!/Songs.
 * Ground truth for "this map is already installed", independent of a stale db scan.
 */
function installedSetIds() {
  if (Date.now() - installedCache.at < 60_000) return installedCache.ids;
  const songs = path.join(activeOsuDir(), 'Songs');
  const ids = [];
  try {
    for (const name of fs.readdirSync(songs)) {
      const match = /^(\d+)\s/.exec(name);
      if (match) ids.push(Number(match[1]));
    }
  } catch {
    // No Songs folder — treat as nothing installed.
  }
  installedCache = { at: Date.now(), ids };
  return ids;
}

function broadcast(payload) {
  lastPayload = payload;
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('live', payload);
  }
}

function tick() {
  const now = Date.now();
  const dt = Math.min(120, demoLast ? now - demoLast : 50);
  demoLast = now;

  if (settings.demo) {
    demo.step(dt);
    broadcast(demo.payload());
    return;
  }

  broadcast(
    tosu.connected
      ? normalizeTosu(tosu.state, tosu.hitErrors, tosu.keys, settings.tosuPort)
      : idlePayload(false, settings.tosuPort),
  );
}

function loadRenderer(target, hash) {
  if (process.env.VITE_DEV_SERVER_URL) {
    target.loadURL(process.env.VITE_DEV_SERVER_URL + (hash ? '#' + hash : ''));
  } else {
    const file = path.join(rootDir, 'dist', 'renderer', 'index.html');
    if (hash) target.loadFile(file, { hash });
    else target.loadFile(file);
  }
}

function overlayBounds(pos) {
  const area = screen.getPrimaryDisplay().workArea;
  const width = 400;
  const height = 184;
  const margin = 18;
  const right = pos === 'tr' || pos === 'br';
  const bottom = pos === 'bl' || pos === 'br';
  return {
    width,
    height,
    x: right ? area.x + area.width - width - margin : area.x + margin,
    y: bottom ? area.y + area.height - height - margin : area.y + margin,
  };
}

function createOverlay() {
  if (overlay && !overlay.isDestroyed()) return;
  overlay = new BrowserWindow({
    ...overlayBounds(settings.overlayPos),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    fullscreenable: false,
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  overlay.setIgnoreMouseEvents(true);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadRenderer(overlay, 'overlay');
  overlay.once('ready-to-show', () => overlay?.showInactive());
  overlay.on('closed', () => {
    overlay = null;
  });
}

function destroyOverlay() {
  if (overlay && !overlay.isDestroyed()) overlay.close();
  overlay = null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    hasShadow: false,
    icon: path.join(rootDir, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
    setTimeout(sendFrame, 80);
  });
  loadRenderer(win);

  const sendFrame = () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('win:frame', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() });
  };
  win.on('maximize', sendFrame);
  win.on('unmaximize', sendFrame);
  win.on('enter-full-screen', () => {
    win?.webContents.send('win:fullstate', true);
    sendFrame();
  });
  win.on('leave-full-screen', () => {
    win?.webContents.send('win:fullstate', false);
    sendFrame();
  });

  win.on('closed', () => {
    win = null;
    destroyOverlay();
  });
}

/** Settings as the renderer sees them: never the API secret. */
function publicSettings() {
  return { ...settings, apiClientSecret: '' };
}

function bootstrap() {
  return {
    settings: publicSettings(),
    live: lastPayload,
    scan,
    api: api.snapshot(),
    tosu: tosuStatus,
    history: Array.isArray(profile.facts) ? profile.facts : [],
    paths: { osuDir: activeOsuDir(), dataDir, envFile: path.join(rootDir, '.env') },
    version: app.getVersion(),
    updates: updater.current(),
    campaign: viewCampaign(campaignStore.load()),
  };
}

ipcMain.handle('bootstrap', () => bootstrap());

ipcMain.handle('update:state', () => updater.current());
ipcMain.handle('update:check', () => updater.check(true));
ipcMain.handle('update:download', () => updater.download());
ipcMain.handle('update:install', () => updater.install());

/** One taste-matched map for the last stage; null when there is no network. */
async function findFinalMap() {
  if (!scan?.ok) return null;
  const comfort = scan.comfortStar ?? 3.5;
  const base = {
    minStars: Math.max(1, Math.round((comfort + 0.4) * 10) / 10),
    maxStars: Math.round((comfort + 1.2) * 10) / 10,
    target: Math.round((comfort + 0.75) * 10) / 10,
    limit: 12,
    excludeSetIds: installedSetIds(),
  };

  // First try the player's own artists and mappers. If every map they already
  // own is excluded, that pool can run dry — then widen to the taste-filtered
  // general rating instead of silently handing out a library map.
  const attempts = [
    { ...base, preferences: scan.preferences || null, music: settings.music || '' },
    { ...base, preferences: null, music: settings.music || '' },
  ];

  for (const params of attempts) {
    try {
      const result = await api.searchMaps(params);
      if (!result.ok) continue;
      const pick = result.maps.find(
        (map) =>
          map.drainTime >= 55 && map.drainTime <= 210 && map.stars >= comfort + 0.35 && map.stars <= comfort + 1.3,
      );
      if (pick) return pick;
    } catch {
      // try the next pool
    }
  }
  return null;
}

ipcMain.handle('campaign:plan', async () => {
  const existing = campaignStore.load();
  if (existing?.stages?.length) {
    syncCampaignState();
    return { ok: true, campaign: viewCampaign(existing) };
  }
  if (!scan?.ok) return { ok: false, error: 'no-scan', campaign: null };

  const finalMap = await findFinalMap();
  const state = buildCampaign(scan, finalMap);
  state.newMapSource = finalMap ? 'osu' : 'library';
  campaignStore.save(state);
  return { ok: true, campaign: viewCampaign(state) };
});

ipcMain.handle('campaign:reset', () => {
  campaignStore.reset();
  return { ok: true, campaign: null };
});

ipcMain.handle('campaign:state', () => viewCampaign(campaignStore.load()));

ipcMain.handle('scan', () => rescan());

ipcMain.handle('replay:latest', () => enrichReplay(replay.latest(activeOsuDir())));

function readLocalOsu(entry) {
  const dir = path.join(activeOsuDir(), 'Songs', entry.folder || '');
  let files;
  try {
    files = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.osu'));
  } catch {
    return null;
  }
  const want = new RegExp(`BeatmapID\\s*:\\s*${entry.id}\\b`);
  for (const file of files) {
    try {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      if (want.test(text)) return text;
    } catch {
      // unreadable file, keep looking
    }
  }
  return files.length === 1 ? fs.readFileSync(path.join(dir, files[0]), 'utf8') : null;
}

/**
 * Adds the per-moment breakdown to a basic analysis. The beatmap is located
 * through osu!.db (it stores every beatmap's MD5), so no API keys are needed.
 */
function enrichReplay(result) {
  if (!result?.ok || !result.analysis || !result.file || !result.path) return result;
  try {
    const full = path.join(result.path, result.file);
    const parsed = replay.parseOsr(fs.readFileSync(full));
    const entry = findBeatmapByHash(activeOsuDir(), parsed.beatmapHash);
    if (!entry) {
      result.analysis.detailNote = 'map-not-found';
      return result;
    }
    result.analysis.map = {
      id: entry.id,
      setId: entry.setId,
      artist: entry.artist,
      title: entry.title,
      version: entry.diff,
      stars: entry.stars,
      od: entry.od,
      bpm: entry.bpm,
      objects: entry.objects,
    };
    const text = readLocalOsu(entry);
    if (text)
      result.analysis.detail = replay.analyzeDetail(
        parsed.frames,
        parsed,
        replay.parseBeatmap(text),
        result.analysis.map,
      );
    else result.analysis.detailNote = 'osu-missing';
  } catch {
    result.analysis.detailNote = 'error';
  }
  return result;
}

ipcMain.handle('replay:analyze', (event, filePath) => {
  if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.osr')) {
    return { ok: false, error: 'bad-file', path: '', analysis: null };
  }
  try {
    return enrichReplay(replay.analyzeFile(filePath));
  } catch (err) {
    return { ok: false, error: 'parse-failed', detail: String(err.message || err), path: '', analysis: null };
  }
});

ipcMain.handle('replay:pick', async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: 'Выбери реплей osu!',
    filters: [{ name: 'osu! replay', extensions: ['osr'] }],
    properties: ['openFile'],
  });
  if (picked.canceled || !picked.filePaths?.length) return { ok: false, error: 'cancelled', path: '', analysis: null };
  try {
    return enrichReplay(replay.analyzeFile(picked.filePaths[0]));
  } catch (err) {
    return { ok: false, error: 'parse-failed', detail: String(err.message || err), path: '', analysis: null };
  }
});

ipcMain.handle('replay:open-folder', () => {
  const dir = path.join(activeOsuDir(), 'Replays');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* already there */
  }
  void shell.openPath(dir);
  return dir;
});

ipcMain.handle('api:refresh', async () => {
  const result = await api.load(true);
  return result;
});

ipcMain.handle('maps:installed', () => installedSetIds());

ipcMain.handle('maps:search', async (event, params) => {
  try {
    return await api.searchMaps({ ...params, preferences: scan?.preferences || null, music: settings.music || '' });
  } catch (err) {
    return { ok: false, error: String(err.message || err), total: 0, maps: [], next: null };
  }
});

ipcMain.handle('maps:quick', async (event, params) => {
  try {
    return await api.quickSearch(params?.text, {
      limit: Math.max(1, Math.min(30, Number(params?.limit) || 20)),
      target: Number(params?.target) || 0,
      excludeSetIds: Array.isArray(params?.excludeSetIds) ? params.excludeSetIds : [],
    });
  } catch (err) {
    return { ok: false, error: String(err.message || err), total: 0, maps: [] };
  }
});

ipcMain.handle('maps:download', async (event, setId) => {
  const id = Number(setId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'bad beatmapset id' };
  try {
    const res = await fetch(`https://osu.direct/api/d/${id}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return { ok: false, error: `зеркало ответило ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10_000) return { ok: false, error: 'файл пустой' };
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) return { ok: false, error: 'зеркало прислало не архив' };

    const disposition = res.headers.get('content-disposition') || '';
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    const rawName = match ? match[1] : `${id}.osz`;
    const safeName = Array.from(rawName)
      .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char))
      .join('')
      .slice(0, 120);
    const file = path.join(app.getPath('downloads'), safeName.endsWith('.osz') ? safeName : `${safeName}.osz`);
    fs.writeFileSync(file, buf);

    const imported = await importIntoOsu(file);
    installedCache = { at: 0, ids: [] };
    return { ok: true, path: file, opened: imported.opened, method: imported.method, error: imported.error };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('settings:set', (event, patch) => {
  const before = { ...settings };
  settings = { ...settings, ...patch };
  saveSettings();

  if (patch?.user && patch.user !== before.user) {
    api.user = patch.user;
    api.cache = null;
    api.load(true).catch(() => {});
  }
  if (patch?.apiClientId != null || patch?.apiClientSecret != null) {
    api.clientId = settings.apiClientId || process.env.OSU_CLIENT_ID || '';
    api.clientSecret = settings.apiClientSecret || process.env.OSU_CLIENT_SECRET || '';
    api.token = null;
    api.tokenExpires = 0;
    api.cache = null;
    api.load(true).catch(() => {});
  }
  if (patch?.tosuPort && patch.tosuPort !== before.tosuPort) {
    tosu.stop();
    tosu.port = patch.tosuPort;
    tosu.start();
  }
  if (patch?.osuDir != null && patch.osuDir !== before.osuDir) {
    protocolState = null;
    protocolEnsured = false;
    rescan();
    watchOsuDir();
  }
  if (typeof patch?.demo === 'boolean') {
    demo = new Demo();
    demoLast = 0;
  }
  if (typeof patch?.overlay === 'boolean' && patch.overlay !== before.overlay) {
    if (patch.overlay) createOverlay();
    else destroyOverlay();
  }
  if (patch?.overlayPos && patch.overlayPos !== before.overlayPos && overlay && !overlay.isDestroyed()) {
    overlay.setBounds(overlayBounds(settings.overlayPos));
  }
  return publicSettings();
});

ipcMain.handle('cover:data', async (event, url) => {
  const allowed = /^http:\/\/127\.0\.0\.1:\d+\//.test(url) || url.startsWith('https://assets.ppy.sh/');
  if (typeof url !== 'string' || !allowed) return null;
  const cached = coverCache.get(url);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 8_000_000) return null;
    const type = res.headers.get('content-type') || 'image/jpeg';
    const data = `data:${type};base64,${buf.toString('base64')}`;
    coverCache.set(url, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
});

function runReg(args) {
  return new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true }, (err) => resolve(!err));
  });
}

/**
 * osu! stable normally registers this key itself, but on some installs the key is
 * left half-empty and osu:// links go nowhere. HKCU needs no admin rights.
 */
async function ensureOsuProtocol(exe) {
  await runReg(['add', 'HKCU\\Software\\Classes\\osu', '/ve', '/d', 'URL:osu!', '/f']);
  await runReg(['add', 'HKCU\\Software\\Classes\\osu', '/v', 'URL Protocol', '/d', '', '/f']);
  await runReg(['add', 'HKCU\\Software\\Classes\\osu\\shell\\open\\command', '/ve', '/d', `"${exe}" "%1"`, '/f']);
}

async function tosuBeatmapId() {
  try {
    const port = Number(settings.tosuPort) || 24050;
    const res = await fetch(`http://127.0.0.1:${port}/json/v2`, { signal: AbortSignal.timeout(500) });
    if (!res.ok) return null;
    const data = await res.json();
    const id = data?.beatmap?.id;
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function osuExePath() {
  const dir = activeOsuDir();
  return [path.join(dir, 'osu!.exe'), path.join(dir, 'osu.exe')].find((candidate) => fs.existsSync(candidate)) || null;
}

/**
 * spawn() reports a missing executable asynchronously through the 'error' event,
 * not as a throw. Without this wrapper the app would claim a successful launch
 * that never happened.
 */
function spawnDetached(exe, args) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child;
    try {
      child = spawn(exe, args, { detached: true, stdio: 'ignore' });
    } catch (err) {
      finish({ ok: false, error: String(err.message || err) });
      return;
    }

    child.once('error', (err) => finish({ ok: false, error: String(err.message || err) }));
    child.once('spawn', () => {
      child.unref();
      finish({ ok: true });
    });
    setTimeout(() => finish({ ok: true }), 1200);
  });
}

async function osuRunning() {
  const script = "$p = Get-Process 'osu!' -ErrorAction SilentlyContinue; if ($p) { 'yes' }";
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true },
      (err, stdout) => {
        resolve(!err && String(stdout).includes('yes'));
      },
    );
  });
}

/**
 * Hand a .osz straight to osu!.exe: it accepts file paths as arguments and imports
 * them. Going through shell.openPath depends on the .osz file association, which
 * on some installs is missing or hijacked, and Windows shows a "open with" dialog.
 */
async function importIntoOsu(file) {
  const exe = osuExePath();
  if (exe) {
    const spawned = await spawnDetached(exe, [file]);
    if (spawned.ok) return { opened: true, method: 'spawn' };
  }
  const error = await shell.openPath(file);
  return { opened: !error, method: 'shell', error: error || undefined };
}

async function focusOsu() {
  const script =
    "$p = Get-Process 'osu!' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; " +
    'if ($p) { $w = New-Object -ComObject WScript.Shell; $null = $w.AppActivate($p.Id) }';
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true }, () =>
      resolve(),
    );
  });
}

async function waitForBeatmap(id, deadline) {
  if (Date.now() >= deadline) return false;
  await pause(250);
  if ((await tosuBeatmapId()) === id) return true;
  return waitForBeatmap(id, deadline);
}

// Stable currently ignores osu:// links. Remember what actually worked so the
// next click does not wait for the same dead end again.
let protocolState = null; // null | 'protocol' | 'spawn' | false
let protocolEnsured = false;

const OPEN_BUDGET_MS = 3600;

ipcMain.handle('osu:open-map', async (event, payload) => {
  const id = Number(typeof payload === 'object' && payload !== null ? payload.id : payload);
  const title = typeof payload === 'object' && payload !== null ? String(payload.title || '') : '';
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'некорректный id карты' };

  const exe = osuExePath();
  if (!exe) return { ok: false, error: 'osu!.exe не найден — проверь папку игры в настройках' };

  const deadline = Date.now() + OPEN_BUDGET_MS;
  const before = await tosuBeatmapId();
  if (before === id) {
    await focusOsu();
    return { ok: true, method: 'already' };
  }

  if (protocolState !== false) {
    if (!protocolEnsured) {
      await ensureOsuProtocol(exe);
      protocolEnsured = true;
    }

    if (protocolState !== 'spawn') {
      try {
        await shell.openExternal(`osu://b/${id}`);
      } catch {
        // the direct call below is the fallback
      }

      if (before !== null && (await waitForBeatmap(id, deadline))) {
        protocolState = 'protocol';
        return { ok: true, method: 'protocol' };
      }
    }

    if (before !== null) {
      // The protocol did not reach the client: hand the link straight to osu!.exe.
      const spawned = await spawnDetached(exe, [`osu://b/${id}`]);
      if (spawned.ok && (await waitForBeatmap(id, deadline))) {
        protocolState = 'spawn';
        return { ok: true, method: 'spawn' };
      }
      protocolState = false;
    }
  }

  const running = await osuRunning();
  const copied = Boolean(title);
  if (copied) clipboard.writeText(title);

  if (!running) {
    // Starting the game is useful on its own, but the map link is not going to be
    // picked up by a client that is still booting. Say exactly that.
    const started = await spawnDetached(exe, []);
    return {
      ok: false,
      method: 'manual',
      reason: 'not-running',
      started: started.ok,
      osuRunning: false,
      title,
      copied,
    };
  }

  await focusOsu();
  return {
    ok: false,
    method: 'manual',
    reason: before === null ? 'no-tosu' : 'stable-ignored',
    osuRunning: true,
    title,
    copied,
  };
});

ipcMain.handle('open-external', (event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('osu://'))) {
    return shell.openExternal(url);
  }
  return false;
});

ipcMain.handle('tosu:launch', async () => {
  const result = await startTosu({
    savedPath: settings.tosuPath,
    port: settings.tosuPort,
    desktop: app.getPath('desktop'),
    downloads: app.getPath('downloads'),
    rootDir,
    execDir: path.dirname(process.execPath),
  });

  if (result.path && result.path !== settings.tosuPath) {
    settings = { ...settings, tosuPath: result.path };
    saveSettings();
  }

  if (result.ok) {
    tosu.stop();
    tosu.start();
  }

  return result;
});

ipcMain.handle('tosu:pick', async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: 'Где лежит tosu.exe',
    properties: ['openFile'],
    filters: [{ name: 'tosu', extensions: ['exe'] }],
  });
  const file = picked.filePaths?.[0];
  if (picked.canceled || !file) return { ok: false, cancelled: true };

  settings = { ...settings, tosuPath: file };
  saveSettings();
  return { ok: true, path: file };
});

ipcMain.on('win:min', () => win?.minimize());
ipcMain.on('win:max', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('win:full', () => {
  if (!win) return;
  win.setFullScreen(!win.isFullScreen());
});
ipcMain.on('win:close', () => win?.close());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.mens0ri.osucoach');
    createWindow();
    if (settings.overlay) createOverlay();

    updater.init({
      dataDir,
      onState: (state) => {
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send('update', state);
        }
      },
    });

    if (!scan || Date.now() - (scan.scannedAt || 0) > 5 * 60 * 1000) rescan();
    watchOsuDir();
    api.load(false).catch(() => {});

    tosu.start();
    setInterval(tick, 50);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    tosu.stop();
    app.quit();
  });
}

process.on('uncaughtException', (err) => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.appendFileSync(path.join(dataDir, 'main.log'), `${new Date().toISOString()} ${err.stack}\n`);
});
