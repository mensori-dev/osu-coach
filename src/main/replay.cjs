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
  // A trailing frame sometimes carries a broken clock (time jumps backwards and
  // the key field is garbage). Keep the timeline up to the last real moment.
  let maxIdx = 0;
  for (let i = 1; i < frames.length; i++) if (frames[i].t >= frames[maxIdx].t) maxIdx = i;
  if (maxIdx < frames.length - 1) frames.length = maxIdx + 1;
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
    beatmapHash: meta.beatmapHash,
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

/* ------------------------------------------------------------------ *
 * Detailed per-moment breakdown.                                      *
 * The map is found locally (osu!.db keeps each beatmap's MD5), so it  *
 * works without any osu! API keys. Inputs are the replay frames and   *
 * the parsed .osu hit objects; output is sections + worst moments.    *
 * ------------------------------------------------------------------ */

const DIFF_KEYS = /^([A-Za-z]+)\s*:\s*(-?[\d.]+)/;

/** Hit objects and difficulty from a .osu file. Spinners are kept for timing. */
function parseBeatmap(text) {
  const diff = {};
  for (const line of (text.split('[Difficulty]')[1] || '').split('[')[0].split('\n')) {
    const m = line.match(DIFF_KEYS);
    if (m) diff[m[1]] = Number(m[2]);
  }
  const objects = [];
  for (const line of (text.split('[HitObjects]')[1] || '').split('\n')) {
    const p = line.trim().split(',');
    if (p.length < 4) continue;
    const time = Number(p[2]);
    const type = Number(p[3]);
    if (!Number.isFinite(time)) continue;
    objects.push({
      x: Number(p[0]),
      y: Number(p[1]),
      time,
      kind: type & 8 ? 'spinner' : type & 2 ? 'slider' : 'circle',
    });
  }
  objects.sort((a, b) => a.time - b.time);
  return { diff, objects };
}

/** osu! hit windows in ms, adjusted for the mods that actually change them. */
function hitWindows(od, mods) {
  let o = Number.isFinite(od) ? od : 8;
  if (mods.includes('HR')) o = Math.min(10, o * 1.4);
  if (mods.includes('EZ')) o /= 2;
  let w300 = 80 - 6 * o;
  let w100 = 140 - 8 * o;
  let w50 = 200 - 10 * o;
  if (mods.includes('DT') || mods.includes('NC')) {
    w300 /= 1.5;
    w100 /= 1.5;
    w50 /= 1.5;
  }
  if (mods.includes('HT')) {
    w300 /= 0.75;
    w100 /= 0.75;
    w50 /= 0.75;
  }
  return { w300, w100, w50 };
}

function extractTaps(frames) {
  const taps = [];
  let prev = 0;
  for (const f of frames) {
    const down = f.key & 3;
    const rising = down & ~prev;
    if (rising & 1) taps.push({ t: f.t, k: 0 });
    if (rising & 2) taps.push({ t: f.t, k: 1 });
    prev = down;
  }
  return taps;
}

/** Pairs each hit object with the nearest free tap inside the hit window. */
function judgeNotes(taps, notes, w) {
  const used = Array.from({ length: taps.length }, () => false);
  const out = [];
  let cur = 0;
  for (const note of notes) {
    while (cur < taps.length && taps[cur].t < note.time - w.w50) cur++;
    let best = -1;
    let bestAbs = Infinity;
    for (let i = cur; i < taps.length && taps[i].t <= note.time + w.w50; i++) {
      if (used[i]) continue;
      const d = Math.abs(taps[i].t - note.time);
      if (d < bestAbs) {
        bestAbs = d;
        best = i;
      }
    }
    if (best === -1) {
      out.push({ note, off: null, judged: 'miss' });
      continue;
    }
    used[best] = true;
    const off = taps[best].t - note.time;
    const a = Math.abs(off);
    out.push({ note, off, judged: a <= w.w300 ? '300' : a <= w.w100 ? '100' : '50' });
  }
  return out;
}

function medianOf(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function weightedAbs(list) {
  const total = list.reduce((a, s) => a + s.notes, 0);
  return total ? list.reduce((a, s) => a + s.avgAbs * s.notes, 0) / total : 0;
}

function stddev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

function timeLabel(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function makeSection(start, end, kind, notes, judged, spacings, w) {
  const slice = judged.slice(start, end + 1);
  const signed = slice.filter((r) => r.off != null).map((r) => r.off);
  const avgOff = signed.length ? signed.reduce((a, b) => a + b, 0) / signed.length : 0;
  const abs = signed.map(Math.abs);
  const avgAbs = abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : 0;
  const localSpace = spacings.slice(start + 1, end + 1);
  const dur = notes[end].time - notes[start].time;
  return {
    kind,
    startMs: notes[start].time,
    endMs: notes[end].time,
    notes: end - start + 1,
    avgOff: Math.round(avgOff),
    avgAbs: Math.round(avgAbs),
    jitter: Math.round(stddev(signed)),
    late: signed.filter((v) => v > w.w300).length,
    early: signed.filter((v) => v < -w.w300).length,
    big: signed.filter((v) => Math.abs(v) > w.w100).length,
    miss: slice.filter((r) => r.off == null).length,
    worst: abs.length ? Math.round(Math.max(...abs)) : 0,
    avgSpace: localSpace.length ? Math.round(localSpace.reduce((a, b) => a + b, 0) / localSpace.length) : 0,
    maxSpace: localSpace.length ? Math.round(Math.max(...localSpace)) : 0,
    nps: dur > 0 ? Math.round(((end - start) / (dur / 1000)) * 10) / 10 : 0,
  };
}

function sectionBadness(s, w) {
  if (s.notes < 2) return 0;
  const smear = s.late + s.early;
  return s.miss * 5 + s.big * 2.5 + smear * 0.6 + (s.avgAbs / Math.max(1, w.w300)) * 0.8;
}

/** Russian plural picker for the section text. */
function plural(n, one, few, many) {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 > 10 && mod100 < 20) return many;
  if (mod10 > 1 && mod10 < 5) return few;
  if (mod10 === 1) return one;
  return many;
}

function sectionText(s, w) {
  const label =
    s.kind === 'stream'
      ? `стрим ${s.notes} нот`
      : s.kind === 'burst'
        ? `бёрст ${s.notes} нот`
        : s.kind === 'jump'
          ? `джампы${s.maxSpace ? ` до ${s.maxSpace} px` : ''}`
          : `ровный участок (${s.notes} нот)`;
  const bits = [];
  const smeared = s.late + s.early;
  if (s.miss > 0) bits.push(`${s.miss} ${plural(s.miss, 'нота не нажата', 'ноты не нажаты', 'нот не нажато')}`);
  if (s.big > 0) bits.push(`${s.big} ${plural(s.big, 'нота вне окна', 'ноты вне окна', 'нот вне окна')}`);
  if (smeared / s.notes >= 0.25) bits.push(`${Math.round((smeared / s.notes) * 100)}% нот смазано по времени`);
  if (Math.abs(s.avgOff) > w.w300)
    bits.push(s.avgOff > 0 ? `систематически позже на ${s.avgOff} мс` : `спешил на ${-s.avgOff} мс`);
  if (!bits.length) bits.push('ровно');
  return `${label} — ${bits.join(', ')}`;
}

/** Rich, deterministic breakdown: which chunks are streams vs jumps and where they broke. */
function analyzeDetail(frames, meta, beatmap, mapInfo) {
  const notes = beatmap.objects.filter((o) => o.kind !== 'spinner');
  if (!notes.length) return null;
  const w = hitWindows(beatmap.diff.OverallDifficulty, meta.mods);
  const judged = judgeNotes(extractTaps(frames), notes, w);

  const n = notes.length;
  const spacings = [];
  const intervals = [];
  for (let i = 1; i < n; i++) {
    intervals.push(notes[i].time - notes[i - 1].time);
    spacings.push(Math.hypot(notes[i].x - notes[i - 1].x, notes[i].y - notes[i - 1].y));
  }
  const fastCut = Math.max(medianOf(intervals.filter((v) => v > 0)) * 1.35, 190);
  const dense = notes.map((_, i) => {
    const a = i > 0 ? notes[i].time - notes[i - 1].time : Infinity;
    const b = i < n - 1 ? notes[i + 1].time - notes[i].time : Infinity;
    return Math.min(a, b) <= fastCut;
  });

  const sections = [];
  const pushRun = (start, end, kind) => {
    const count = end - start + 1;
    if ((kind === 'stream' || kind === 'burst') && count > 12) {
      const size = Math.ceil(count / Math.ceil(count / 12));
      for (let a = start; a <= end; a += size) {
        const b = Math.min(end, a + size - 1);
        sections.push(makeSection(a, b, kind, notes, judged, spacings, w));
      }
    } else {
      sections.push(makeSection(start, end, kind, notes, judged, spacings, w));
    }
  };

  let i = 0;
  while (i < n) {
    const start = i;
    let end = i;
    if (dense[i]) {
      while (end + 1 < n && dense[end + 1] && notes[end + 1].time - notes[end].time <= 1500) end++;
      pushRun(start, end, end - start + 1 >= 5 ? 'stream' : 'burst');
    } else {
      while (end + 1 < n && !dense[end + 1] && notes[end + 1].time - notes[end].time <= 1800) end++;
      const avgSpace = spacings.slice(start, end + 1).reduce((a, b) => a + b, 0) / Math.max(1, end - start + 1);
      pushRun(start, end, avgSpace >= 115 ? 'jump' : 'flow');
    }
    i = end + 1;
  }

  const moments = sections
    .filter((s) => s.notes >= 4)
    .map((s) => ({ s, badness: sectionBadness(s, w) }))
    .filter(
      (m) => m.s.miss > 0 || m.s.big > 0 || (m.s.late + m.s.early) / m.s.notes >= 0.25 || Math.abs(m.s.avgOff) > w.w300,
    )
    .sort((a, b) => b.badness - a.badness)
    .slice(0, 5)
    .map((m) => ({
      at: m.s.startMs,
      kind: m.s.kind,
      text: `${timeLabel(m.s.startMs)} — ${sectionText(m.s, w)}`,
      badness: Math.round(m.badness * 10) / 10,
    }));

  const streams = sections.filter((s) => s.kind === 'stream' || s.kind === 'burst');
  const jumps = sections.filter((s) => s.kind === 'jump');
  const streamAbs = weightedAbs(streams);
  const jumpAbs = weightedAbs(jumps);
  let verdict = null;
  if (streams.length >= 2 && jumps.length >= 2) {
    if (streamAbs > jumpAbs * 1.25 && streamAbs - jumpAbs > 4) verdict = 'стримы идут тяжелее джампов';
    else if (jumpAbs > streamAbs * 1.25 && jumpAbs - streamAbs > 4) verdict = 'джампы тяжелее, стримы держишь';
    else verdict = 'стримы и джампы идут ровно';
  }

  const derived = {
    n300: judged.filter((r) => r.judged === '300').length,
    n100: judged.filter((r) => r.judged === '100').length,
    n50: judged.filter((r) => r.judged === '50').length,
    miss: judged.filter((r) => r.judged === 'miss').length,
  };

  const duration = frames.length ? frames[frames.length - 1].t : 0;
  const buckets = Math.max(1, Math.min(160, Math.round(duration / 1000) || 1));
  const perMs = duration / buckets || 1;
  const offSum = Array.from({ length: buckets }, () => 0);
  const offN = Array.from({ length: buckets }, () => 0);
  for (const r of judged) {
    if (r.off == null) continue;
    const b = Math.min(buckets - 1, Math.max(0, Math.floor(r.note.time / perMs)));
    offSum[b] += r.off;
    offN[b]++;
  }
  const offAvg = Array.from({ length: buckets }, (_, k) => (offN[k] ? Math.round(offSum[k] / offN[k]) : null));

  return {
    map: mapInfo || null,
    objects: n,
    windows: { w300: Math.round(w.w300), w100: Math.round(w.w100), w50: Math.round(w.w50) },
    derived,
    profile: { streamAbs: Math.round(streamAbs), jumpAbs: Math.round(jumpAbs), verdict },
    sections: sections.filter((s) => s.notes >= 2).slice(0, 80),
    moments,
    offsetTimeline: { buckets, perMs, avg: offAvg },
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

module.exports = { latest, analyzeFile, parseOsr, analyze, parseBeatmap, analyzeDetail, hitWindows, extractTaps };
