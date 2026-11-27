'use strict';

const fs = require('node:fs');
const path = require('node:path');

let lzma = null;
try {
  lzma = require('@napi-rs/lzma').lzma;
} catch {
  lzma = null;
}

const MODS = [
  [1, 'NF'],
  [2, 'EZ'],
  [8, 'HD'],
  [16, 'HR'],
  [32, 'SD'],
  [64, 'DT'],
  [128, 'RX'],
  [256, 'HT'],
  [512, 'NC'],
  [1024, 'FL'],
  [2048, 'AT'],
  [4096, 'SO'],
  [8192, 'AP'],
  [16384, 'PF'],
  [1 << 16, 'V2'],
];

function decodeMods(bits) {
  const out = [];
  let rest = bits | 0;
  for (const [bit, name] of MODS) {
    if (rest & bit) {
      rest &= ~bit;
      out.push(name);
    }
  }
  if (rest & 64 || rest & 512) out.push('DT');
  return [...new Set(out)];
}

/** Reader for osu!'s little binary format (7-bit length strings, LE numbers). */
class Reader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }
  u8() {
    return this.buf[this.pos++];
  }
  u16() {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  i32() {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  i64() {
    const v = this.buf.readBigInt64LE(this.pos);
    this.pos += 8;
    return v;
  }
  str() {
    const present = this.u8();
    if (present === 0x00) return '';
    if (present !== 0x0b) throw new Error('bad string marker ' + present);
    let len = 0;
    let shift = 0;
    let byte;
    do {
      byte = this.u8();
      len |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    const value = this.buf.toString('utf8', this.pos, this.pos + len);
    this.pos += len;
    return value;
  }
}

function parseOsr(buf) {
  const r = new Reader(buf);
  const mode = r.u8();
  const version = r.i32();
  const beatmapHash = r.str();
  const player = r.str();
  r.str(); // replay hash, unused
  const count300 = r.u16();
  const count100 = r.u16();
  const count50 = r.u16();
  r.u16(); // geki
  r.u16(); // katu
  const miss = r.u16();
  const score = r.i32();
  const maxCombo = r.u16();
  const perfect = r.u8();
  const mods = r.i32();
  r.str(); // life bar graph, unused
  const timestamp = r.i64();
  const length = r.i32();
  const compressed = buf.subarray(r.pos, r.pos + length);
  const onlineId = r.pos + length + 8 <= buf.length ? undefined : undefined;

  if (!lzma) throw new Error('lzma module unavailable');
  const raw = lzma.decompressSync(Buffer.from(compressed));

  return {
    mode,
    version,
    beatmapHash,
    player,
    count300,
    count100,
    count50,
    miss,
    score,
    maxCombo,
    perfect: Boolean(perfect),
    mods: decodeMods(mods),
    modsBits: mods,
    at: Number(timestamp) / 10000 - 62135596800000, // .NET ticks → epoch ms
    frames: parseFrames(raw),
    onlineId,
  };
}

/** Replay frames: `dt|x|y|keys` separated by commas. Coordinates in osu! px. */
function parseFrames(raw) {
  const text = raw.toString('latin1');
  const frames = [];
  let t = 0;
  for (const chunk of text.split(',')) {
    if (!chunk) continue;
    const parts = chunk.split('|');
    if (parts.length < 4) continue;
    const dt = Number.parseInt(parts[0], 10);
    const x = Number.parseFloat(parts[1]);
    const y = Number.parseFloat(parts[2]);
    const key = Number.parseInt(parts[3], 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    t += Number.isFinite(dt) ? dt : 0;
    frames.push({ t, x, y, key: Number.isFinite(key) ? key : 0 });
  }
  return frames;
}

/** Everything the UI needs, all deterministic arithmetic — no guesswork. */
function analyze(frames, meta) {
  const taps = [];
  let prev = 0;
  for (const f of frames) {
    const down = f.key & 3;
    const rising = down & ~prev;
    if (rising & 1) taps.push({ t: f.t, k: 0 });
    if (rising & 2) taps.push({ t: f.t, k: 1 });
    prev = down;
  }

  const intervals = [];
  for (let i = 1; i < taps.length; i++) intervals.push(taps[i].t - taps[i - 1].t);
  const sorted = intervals.filter((v) => v > 0).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const tapBpm = median > 0 ? Math.round(60000 / median) : 0;

  let alt = 0;
  for (let i = 1; i < taps.length; i++) if (taps[i].k !== taps[i - 1].k) alt++;
  const alternate = taps.length > 1 ? alt / (taps.length - 1) : 0;

  const streamGap = Math.max(median * 1.25, 165);
  let burst = 1;
  let maxBurst = taps.length ? 1 : 0;
  let streams = 0;
  for (let i = 1; i < taps.length; i++) {
    if (intervals[i - 1] <= streamGap) burst++;
    else {
      if (burst >= 4) streams++;
      maxBurst = Math.max(maxBurst, burst);
      burst = 1;
    }
  }
  if (burst >= 4) streams++;
  maxBurst = Math.max(maxBurst, burst);

  let maxJump = 0;
  let sumJump = 0;
  let bigJumps = 0;
  for (let i = 1; i < frames.length; i++) {
    const d = Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y);
    sumJump += d;
    if (d > maxJump) maxJump = d;
    if (d > 120) bigJumps++;
  }
  const avgJump = frames.length > 1 ? sumJump / (frames.length - 1) : 0;

  const gaps = [];
  for (let i = 1; i < taps.length; i++) {
    if (intervals[i - 1] > 1500) gaps.push({ at: taps[i].t, ms: intervals[i - 1] });
  }

  const duration = frames.length ? frames[frames.length - 1].t : 0;
  const buckets = Math.max(1, Math.min(120, Math.round(duration / 1000) || 1));
  const perMs = duration / buckets || 1;
  const tapSeries = Array.from({ length: buckets }, () => 0);
  for (const tap of taps) tapSeries[Math.min(buckets - 1, Math.floor(tap.t / perMs))]++;
  const speedSeries = Array.from({ length: buckets }, () => 0);
  const speedCount = Array.from({ length: buckets }, () => 0);
  for (let i = 1; i < frames.length; i++) {
    const d = Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y);
    const b = Math.min(buckets - 1, Math.floor(frames[i].t / perMs));
    speedSeries[b] += d;
    speedCount[b]++;
  }
  for (let i = 0; i < buckets; i++) speedSeries[i] = speedCount[i] ? Math.round(speedSeries[i] / speedCount[i]) : 0;

  const totalHits = meta.count300 + meta.count100 + meta.count50;
  const judged = totalHits + meta.miss;
  const accuracy = judged ? (300 * meta.count300 + 100 * meta.count100 + 50 * meta.count50) / (300 * judged) : 0;
  const maxTapRate = Math.max(0, ...tapSeries);
  const avgTapRate = buckets ? taps.length / buckets : 0;

  return {
    player: meta.player,
    at: meta.at,
    mods: meta.mods,
    score: meta.score,
    maxCombo: meta.maxCombo,
    perfect: meta.perfect,
    counts: { n300: meta.count300, n100: meta.count100, n50: meta.count50, miss: meta.miss },
    accuracy: accuracy * 100,
    durationMs: duration,
    taps: taps.length,
    tapBpm,
    alternate,
    streams,
    maxBurst,
    maxJump: Math.round(maxJump),
    avgJump: Math.round(avgJump),
    bigJumps,
    gaps: gaps.slice(0, 8),
    timeline: { tapSeries, speedSeries, buckets, perMs },
    summary: buildSummary({
      meta,
      accuracy: accuracy * 100,
      tapBpm,
      alternate,
      streams,
      maxBurst,
      maxJump,
      bigJumps,
      avgTapRate,
      maxTapRate,
      gaps,
    }),
  };
}

function buildSummary(s) {
  const verdicts = [];
  const tips = [];

  if (s.meta.miss === 0 && s.meta.count50 === 0) verdicts.push('чисто: ни одного промаха');
  else if (s.meta.miss === 0) verdicts.push('без промахов, но 50-ки проскакивают');
  else if (s.meta.miss > 0 && s.meta.miss <= 3) verdicts.push(`${s.meta.miss} промах(а) — почти чисто`);
  else verdicts.push(`${s.meta.miss} промахов — комбо рвётся`);

  if (s.alternate > 0.7) verdicts.push('чередуешь ритмично, двумя пальцами');
  else if (s.alternate < 0.3 && s.tapBpm > 160) verdicts.push('сингл-тап на высокой скорости');
  else if (s.alternate < 0.3) verdicts.push('играешь одним пальцем');

  if (s.streams >= 6) verdicts.push(`держал ${s.streams} стримов`);
  else if (s.maxBurst >= 8) verdicts.push(`самый длинный поток — ${s.maxBurst} нот`);

  if (s.gaps.length >= 2) verdicts.push('были паузы — похоже на смерти или рестарты');

  if (s.accuracy >= 98) tips.push('точность на месте — можно поднять звёзды на 0.2–0.4.');
  if (s.meta.miss >= 3)
    tips.push('много промахов: играй длинные карты на комфортной сложности, пока промахи не уйдут.');
  if (s.tapBpm > 0 && s.tapBpm < 150 && s.meta.miss > 0)
    tips.push('медленный темп и промахи — разомнись на коротких картах перед длинной.');
  if (s.maxJump > 260) tips.push('были очень резкие джампы — потренируй аим на картах с крупной сеткой.');
  if (s.streams === 0 && s.maxBurst <= 4) tips.push('стримов мало — добавь карты с потоками для ритма.');
  if (s.alternate < 0.3 && s.tapBpm > 170)
    tips.push('на таком темпе сингл-тап упирается в потолок — начни чередовать.');
  if (!tips.length) tips.push('стабильно по всем метрикам — двигайся к следующей сложности.');

  return { verdicts: verdicts.slice(0, 4), tips: tips.slice(0, 3) };
}

function analyzeFile(full) {
  const parsed = parseOsr(fs.readFileSync(full));
  return {
    ok: true,
    error: null,
    path: path.dirname(full),
    file: path.basename(full),
    analysis: analyze(parsed.frames, parsed),
  };
}

/** Analyzes the newest .osr in the Replays folder, or null if there is none. */
function latest(osuDir) {
  const dir = path.join(osuDir, 'Replays');
  if (!fs.existsSync(dir)) return { ok: false, error: 'no-replays-folder', path: dir, analysis: null };
  let files;
  try {
    files = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.osr'));
  } catch {
    return { ok: false, error: 'no-replays-folder', path: dir, analysis: null };
  }
  if (!files.length) return { ok: false, error: 'empty', path: dir, analysis: null };

  const withTime = files
    .map((name) => {
      const full = path.join(dir, name);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        mtime = 0;
      }
      return { name, full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  let lastError = null;
  for (const file of withTime.slice(0, 8)) {
    try {
      return analyzeFile(file.full);
    } catch (err) {
      lastError = String(err.message || err);
    }
  }
  return { ok: false, error: 'parse-failed', detail: lastError, path: dir, analysis: null };
}

module.exports = { latest, analyzeFile, parseOsr, analyze };
