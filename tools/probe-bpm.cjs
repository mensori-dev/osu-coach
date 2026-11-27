const fs = require('node:fs');
const { parseOsuDb } = require('../src/main/stable.cjs');
const db = parseOsuDb(fs.readFileSync(process.env.LOCALAPPDATA + '/osu!/osu!.db'));
const maps = db.maps.filter((m) => m.mode === 0 && m.stars);
const bpms = maps.map((m) => m.bpm).sort((a, b) => a - b);
const q = (p) => bpms[Math.floor((bpms.length - 1) * p)];
console.log('n', maps.length, 'p10', q(0.1), 'p50', q(0.5), 'p70', q(0.7), 'p90', q(0.9), 'p99', q(0.99), 'max', bpms[bpms.length - 1]);
console.log('\ntop bpm:');
maps
  .slice()
  .sort((a, b) => b.bpm - a.bpm)
  .slice(0, 10)
  .forEach((m) => console.log(m.bpm.toFixed(1), '|', m.title, '[' + m.diff + ']', m.stars.toFixed(2) + '*'));
console.log('\nzero bpm count', maps.filter((m) => !m.bpm).length);
