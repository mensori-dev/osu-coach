'use strict';

const fs = require('node:fs');

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Loads the first existing .env file, without overriding real env vars. */
function loadEnv(candidates) {
  for (const file of candidates) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      const values = parseEnv(fs.readFileSync(file, 'utf8'));
      for (const [key, value] of Object.entries(values)) {
        if (!(key in process.env)) process.env[key] = value;
      }
      return { file, values };
    } catch {
      /* ignore unreadable env */
    }
  }
  return { file: null, values: {} };
}

module.exports = { loadEnv, parseEnv };
