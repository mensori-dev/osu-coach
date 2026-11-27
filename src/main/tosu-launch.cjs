'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const EXE = 'tosu.exe';

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function looksLikeTosu(file) {
  const stat = safeStat(file);
  return Boolean(stat && stat.isFile());
}

/** Roots worth scanning for a tosu install. */
function searchRoots({ desktop, downloads, rootDir, execDir }) {
  const home = os.homedir();
  return [
    desktop,
    downloads,
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'OneDrive', 'Рабочий стол'),
    'C:\\tosu',
    'C:\\tools\\tosu',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'tosu') : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'tosu') : null,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'tosu') : null,
    execDir,
    rootDir,
  ].filter(Boolean);
}

/**
 * Look for tosu.exe: saved path first, then common folders,
 * including `tosu-windows-vX.Y.Z` style subfolders.
 */
function findTosu(savedPath, options = {}) {
  if (savedPath && looksLikeTosu(savedPath)) return savedPath;

  const found = [];
  for (const root of searchRoots(options)) {
    const direct = path.join(root, EXE);
    if (looksLikeTosu(direct)) found.push(direct);

    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/^tosu/i.test(entry.name)) continue;
      const nested = path.join(root, entry.name, EXE);
      if (looksLikeTosu(nested)) found.push(nested);
    }
  }

  if (!found.length) return null;

  found.sort((a, b) => (safeStat(b)?.mtimeMs || 0) - (safeStat(a)?.mtimeMs || 0));
  return found[0];
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Start tosu elevated. Windows shows the UAC prompt; we wait for it.
 */
function launchElevated(exe) {
  return new Promise((resolve) => {
    const dir = path.dirname(exe);
    const command = `Start-Process -FilePath ${quotePowerShell(exe)} -WorkingDirectory ${quotePowerShell(dir)} -Verb RunAs`;

    let stderr = '';
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      const text = stderr.trim();
      const cancelled = /canceled|cancelled|отменено/i.test(text);
      resolve({
        ok: false,
        cancelled,
        error: cancelled ? 'UAC отменён' : text || `powershell exit ${code}`,
      });
    });
  });
}

async function portAnswers(port, timeoutMs = 900) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/v2`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function waitForPort(port, timeoutMs = 25_000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (await portAnswers(port)) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 700);
    };
    tick();
  });
}

/**
 * Full flow: already running -> reuse, otherwise find + launch + wait.
 */
async function startTosu({ savedPath, port, desktop, downloads, rootDir, execDir }) {
  if (await portAnswers(port)) {
    return { ok: true, already: true, path: savedPath || null };
  }

  const exe = findTosu(savedPath, { desktop, downloads, rootDir, execDir });
  if (!exe) {
    return {
      ok: false,
      notFound: true,
      error: 'tosu.exe не найден',
    };
  }

  const launched = await launchElevated(exe);
  if (!launched.ok) {
    return { ok: false, cancelled: launched.cancelled, path: exe, error: launched.error };
  }

  const up = await waitForPort(port);
  return { ok: true, path: exe, up };
}

module.exports = { findTosu, startTosu, launchElevated, waitForPort, portAnswers };
