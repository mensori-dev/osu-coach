const fs = require('node:fs');
const { parseOsuDb, parseScoresDb, pickStars } = require('../src/main/stable.cjs');

const dir = process.env.LOCALAPPDATA + '/osu!';
const db = parseOsuDb(fs.readFileSync(dir + '/osu!.db'));
const byMd5 = new Map(db.maps.map((m) => [m.md5.toLowerCase(), m]));
const scores = parseScoresDb(fs.readFileSync(dir + '/scores.db')).scores;
const plays = scores
  .filter((s) => s.mode === 0)
  .map((s) => ({ ...s, map: byMd5.get(s.key.toLowerCase()) }))
  .filter((p) => p.map && pickStars(p.map, p.mods));

function q(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i];
}

const med = (arr) => q(arr, 0.5);
const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
const accs = plays.map((p) => p.acc);

const bpmP = q(plays.map((p) => p.map.bpm), 0.7);
const lenP = q(plays.map((p) => p.map.drainTime), 0.7);
const arP = q(plays.map((p) => p.map.ar), 0.7);
const csP = q(plays.map((p) => p.map.cs), 0.7);
const odP = q(plays.map((p) => p.map.od), 0.7);

const seg = (name, filter) => {
  const s = plays.filter(filter);
  if (s.length < 5) return console.log(name.padEnd(16), 'n=' + s.length, 'too few');
  console.log(
    name.padEnd(16),
    'n=' + String(s.length).padEnd(4),
    'mean=' + mean(s.map((p) => p.acc)).toFixed(1),
    'med=' + med(s.map((p) => p.acc)).toFixed(1),
  );
};

console.log('overall', 'n=' + plays.length, 'mean=' + mean(accs).toFixed(1), 'med=' + med(accs).toFixed(1));
console.log('bpmP70', bpmP, 'lenP70', lenP, 'arP70', arP, 'csP70', csP, 'odP70', odP);
seg('fast bpm>=', (p) => p.map.bpm >= bpmP);
seg('slow bpm<', (p) => p.map.bpm < bpmP);
seg('long drain>=', (p) => p.map.drainTime >= lenP);
seg('short drain<', (p) => p.map.drainTime < lenP);
seg('high AR>=', (p) => p.map.ar >= arP);
seg('low AR<', (p) => p.map.ar < arP);
seg('high CS>=', (p) => p.map.cs >= csP);
seg('low CS<', (p) => p.map.cs < csP);
seg('high OD>=', (p) => p.map.od >= odP);
seg('low OD<', (p) => p.map.od < odP);
seg('HD/FL', (p) => p.modsArray.some((m) => m === 'HD' || m === 'FL'));
seg('HR', (p) => p.modsArray.includes('HR'));

const missRate = plays.map((p) => p.miss / Math.max(1, p.c300 + p.c100 + p.c50 + p.miss));
console.log('avg missRate', (mean(missRate) * 100).toFixed(2) + '%', 'zero-miss share', (plays.filter((p) => p.miss === 0).length / plays.length * 100).toFixed(1) + '%');

const buckets = new Map();
for (const p of plays) {
  const b = Math.round(pickStars(p.map, p.mods) * 2) / 2;
  const e = buckets.get(b) || [];
  e.push(p.acc);
  buckets.set(b, e);
}
let gapSum = 0;
let gapN = 0;
for (const [b, list] of [...buckets].sort((a, b) => a[0] - b[0])) {
  gapSum += Math.max(...list) - med(list);
  gapN++;
}
console.log('avg best-median gap', (gapSum / gapN).toFixed(1));

const durations = plays.map((p) => p.map.drainTime);
console.log('drain min/med/max', Math.min(...durations), med(durations), Math.max(...durations));
