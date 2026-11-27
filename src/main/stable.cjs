'use strict';

const fs = require('node:fs');
const path = require('node:path');

class Reader {
  constructor(buffer) {
    this.b = buffer;
    this.o = 0;
  }
  u8() {
    return this.b[this.o++];
  }
  i16() {
    const v = this.b.readInt16LE(this.o);
    this.o += 2;
    return v;
  }
  u16() {
    const v = this.b.readUInt16LE(this.o);
    this.o += 2;
    return v;
  }
  i32() {
    const v = this.b.readInt32LE(this.o);
    this.o += 4;
    return v;
  }
  i64() {
    const v = this.b.readBigInt64LE(this.o);
    this.o += 8;
    return Number(v);
  }
  f32() {
    const v = this.b.readFloatLE(this.o);
    this.o += 4;
    return v;
  }
  f64() {
    const v = this.b.readDoubleLE(this.o);
    this.o += 8;
    return v;
  }
  bool() {
    return this.u8() !== 0;
  }
  str() {
    const marker = this.u8();
    if (marker === 0) return '';
    if (marker !== 0x0b) throw new Error(`bad string marker ${marker} at ${this.o - 1}`);
    let len = 0;
    let shift = 0;
    let byte;
    do {
      byte = this.u8();
      len |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    const value = this.b.toString('utf8', this.o, this.o + len);
    this.o += len;
    return value;
  }
}

const MOD_BITS = [
  [1, 'NF'],
  [2, 'EZ'],
  [8, 'HD'],
  [16, 'HR'],
  [32, 'SD'],
  [64, 'DT'],
  [256, 'HT'],
  [512, 'NC'],
  [1024, 'FL'],
  [2048, 'AT'],
  [4096, 'SO'],
  [8192, 'AP'],
  [16384, 'PF'],
  [1048576, 'FI'],
  [4194304, 'MR'],
];

function modsToArray(bits) {
  const out = [];
  for (const [bit, name] of MOD_BITS) {
    if (bits & bit) out.push(name);
  }
  if (out.includes('NC')) {
    const i = out.indexOf('DT');
    if (i >= 0) out.splice(i, 1);
  }
  if (out.includes('PF')) {
    const i = out.indexOf('SD');
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}

/** osu!.db — parsed against the 2026 stable layout (validated end-of-file). */
function parseOsuDb(buffer) {
  const r = new Reader(buffer);
  const version = r.i32();
  r.i32(); // folder count
  r.bool(); // unlocked
  r.i64(); // unlock date
  const player = r.str();
  const count = r.i32();
  const maps = [];

  for (let i = 0; i < count; i++) {
    if (version < 20191107) r.i32();

    const artist = r.str();
    const artistUnicode = r.str();
    const title = r.str();
    const titleUnicode = r.str();
    const creator = r.str();
    const diff = r.str();
    r.str(); // audio file
    const md5 = r.str();
    r.str(); // osu file name
    const ranked = r.u8();
    const circles = r.i16();
    const sliders = r.i16();
    const spinners = r.i16();
    r.i64(); // last modification

    let ar = 0;
    let cs = 0;
    let hp = 0;
    let od = 0;
    if (version < 20140609) {
      ar = r.u8();
      cs = r.u8();
      hp = r.u8();
      od = r.u8();
    } else {
      ar = r.f32();
      cs = r.f32();
      hp = r.f32();
      od = r.f32();
    }
    r.f64(); // slider velocity

    const starsByMods = {};
    if (version >= 20140609) {
      const sections = [];
      for (let s = 0; s < 4; s++) {
        const n = r.i32();
        const diffs = {};
        for (let j = 0; j < n; j++) {
          r.u8();
          const mods = r.i32();
          r.u8();
          const value = version > 20250107 ? r.f32() : r.f64();
          diffs[mods] = value;
        }
        sections.push(diffs);
      }
      Object.assign(starsByMods, sections[0]);
    }

    const drainTime = r.i32();
    const totalTime = r.i32();
    r.i32(); // preview
    const tpCount = r.i32();
    const bpmCounter = new Map();
    for (let j = 0; j < tpCount; j++) {
      const beatLength = r.f64();
      r.f64(); // offset
      const timingChange = r.bool();
      if (timingChange && beatLength > 0) {
        const bpm = 60000 / beatLength;
        const key = Math.round(bpm * 10) / 10;
        bpmCounter.set(key, (bpmCounter.get(key) || 0) + 1);
      }
    }
    const bpm = [...bpmCounter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

    const id = r.i32();
    const setId = r.i32();
    r.i32(); // thread
    r.u8();
    r.u8();
    r.u8();
    r.u8(); // grades
    r.i16(); // local offset
    r.f32(); // stack leniency
    const mode = r.u8();
    r.str(); // source
    r.str(); // tags
    r.i16();
    r.str(); // title font
    r.bool(); // unplayed
    const lastPlayed = r.i64();
    r.bool(); // osz2
    const folder = r.str();
    r.i64(); // last checked
    r.bool();
    r.bool();
    r.bool();
    r.bool();
    r.bool();
    if (version < 20140609) r.i16();
    r.i32();
    r.u8(); // mania scroll speed

    maps.push({
      md5,
      id,
      setId,
      artist: artistUnicode || artist,
      title: titleUnicode || title,
      diff,
      creator,
      mode,
      ranked,
      stars: starsByMods[0] ?? null,
      starsByMods,
      ar: Math.round(ar * 10) / 10,
      cs: Math.round(cs * 10) / 10,
      hp: Math.round(hp * 10) / 10,
      od: Math.round(od * 10) / 10,
      bpm,
      drainTime,
      totalTime,
      objects: circles + sliders + spinners,
      folder,
      lastPlayed,
    });
  }

  return { version, player, maps };
}

/**
 * scores.db. Layout validated against a real 2026 file and against
 * LegacyScoreDecoder: mode(u8) ver(i32) md5 player replayMd5 6*u16
 * score(i32) combo(u16) perfect(u8) mods(i32) healthGraph(str)
 * date(i64 ticks) replay(byte[]) onlineId(i64)
 */
function parseScoresDb(buffer) {
  const r = new Reader(buffer);
  const version = r.i32();
  const beatmapCount = r.i32();
  const scores = [];

  for (let i = 0; i < beatmapCount; i++) {
    const key = r.str();
    const scoreCount = r.i32();
    for (let j = 0; j < scoreCount; j++) {
      const mode = r.u8();
      const scoreVersion = r.i32();
      r.str(); // beatmap hash inside the score
      const player = r.str();
      r.str(); // replay hash
      const c300 = r.u16();
      const c100 = r.u16();
      const c50 = r.u16();
      const geki = r.u16();
      const katu = r.u16();
      const miss = r.u16();
      const score = r.i32();
      const maxCombo = r.u16();
      r.bool(); // perfect
      const mods = r.i32();
      r.str(); // health graph
      const ticks = r.i64();
      const replayLength = r.i32();
      if (replayLength > 0) r.o += replayLength; // compressed replay bytes
      const onlineId = r.i64();

      const total = c300 + c100 + c50 + miss;
      const acc = total ? ((c300 * 300 + c100 * 100 + c50 * 50) / (total * 300)) * 100 : 0;

      scores.push({
        key,
        mode,
        player,
        c300,
        c100,
        c50,
        geki,
        katu,
        miss,
        score,
        maxCombo,
        mods,
        modsArray: modsToArray(mods),
        acc,
        scoreId: onlineId,
        at: ticks > 0 ? Math.round(ticks / 10000 - 62135596800000) : 0,
        scoreVersion,
      });
    }
  }

  return { version, beatmapCount, scores };
}

function pickStars(map, mods) {
  if (!map) return null;
  const exact = map.starsByMods?.[mods];
  if (typeof exact === 'number' && exact > 0) return exact;
  const base = map.starsByMods?.[0];
  return typeof base === 'number' && base > 0 ? base : null;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function scanStable(osuDir) {
  const osuDbPath = path.join(osuDir, 'osu!.db');
  const scoresDbPath = path.join(osuDir, 'scores.db');
  if (!fs.existsSync(osuDbPath)) throw new Error('osu!.db not found in ' + osuDir);

  const osuDb = parseOsuDb(fs.readFileSync(osuDbPath));
  const byMd5 = new Map();
  for (const map of osuDb.maps) byMd5.set(map.md5.toLowerCase(), map);

  const scoresDb = fs.existsSync(scoresDbPath) ? parseScoresDb(fs.readFileSync(scoresDbPath)) : { scores: [] };

  const plays = [];
  for (const s of scoresDb.scores) {
    if (s.mode !== 0) continue;
    const map = byMd5.get(s.key.toLowerCase());
    plays.push({
      ...s,
      stars: pickStars(map, s.mods),
      map,
    });
  }

  const withStars = plays.filter((p) => p.stars && p.stars > 0);
  const bucketsMap = new Map();
  for (const p of withStars) {
    const bucket = Math.round(p.stars * 2) / 2;
    if (!bucketsMap.has(bucket)) bucketsMap.set(bucket, { star: bucket, accs: [] });
    bucketsMap.get(bucket).accs.push(p.acc);
  }
  const buckets = [...bucketsMap.values()]
    .sort((a, b) => a.star - b.star)
    .map((b) => {
      const sorted = [...b.accs].sort((x, y) => x - y);
      return {
        star: b.star,
        count: b.accs.length,
        acc: b.accs.reduce((s, v) => s + v, 0) / b.accs.length,
        best: sorted[sorted.length - 1],
        median: quantile(sorted, 0.5),
      };
    });

  const comfort = [...buckets].reverse().find((b) => b.count >= 5 && b.median >= 92);
  const hard = buckets.find((b) => b.count >= 5 && b.median < 88);
  const allAccs = withStars.map((p) => p.acc).sort((a, b) => a - b);
  const playsAboveHard = hard ? buckets.filter((b) => b.star >= hard.star).reduce((s, b) => s + b.count, 0) : 0;

  // Skill profile: only what the local scores can actually prove.
  const medianAcc = quantile(allAccs, 0.5);
  const gaps = buckets.map((b) => b.best - b.median);
  const gapWeight = buckets.reduce((s, b) => s + b.count, 0) || 1;
  const gapAvg = buckets.reduce((s, b, i) => s + gaps[i] * b.count, 0) / gapWeight;
  const totalMiss = withStars.reduce((s, p) => s + p.miss, 0);
  const totalHits = withStars.reduce((s, p) => s + p.c300 + p.c100 + p.c50 + p.miss, 0) || 1;
  const missRate = (totalMiss / totalHits) * 100;
  const zeroMissShare = withStars.length ? (withStars.filter((p) => p.miss === 0).length / withStars.length) * 100 : 0;

  const bpmSorted = withStars.map((p) => p.map.bpm).sort((a, b) => a - b);
  const lenSorted = withStars.map((p) => p.map.drainTime).sort((a, b) => a - b);
  const speedCut = quantile(bpmSorted, 0.7);
  const staminaCut = quantile(lenSorted, 0.7);
  const fast = withStars.filter((p) => p.map.bpm >= speedCut);
  const long = withStars.filter((p) => p.map.drainTime >= staminaCut);
  const segMedian = (list) =>
    list.length
      ? quantile(
          list.map((p) => p.acc).sort((a, b) => a - b),
          0.5,
        )
      : null;
  const medianOf = (values) =>
    values.length
      ? quantile(
          [...values].sort((a, b) => a - b),
          0.5,
        )
      : null;

  const skills = {
    accuracy: medianAcc,
    consistency: Math.max(0, Math.min(100, 100 - gapAvg * 3.5)),
    combo: Math.max(0, Math.min(100, 100 - missRate * 10)),
    speed: segMedian(fast),
    stamina: segMedian(long),
    gap: gapAvg,
    missRate,
    zeroMiss: zeroMissShare,
    speedCut,
    staminaCut,
    speedN: fast.length,
    staminaN: long.length,
    n: withStars.length,
  };

  // Compare the hardest third of maps against the rest for each map property.
  const segment = (valueOf, minSide = 20) => {
    const values = withStars.map(valueOf).sort((a, b) => a - b);
    const cut = quantile(values, 0.7);
    const high = withStars.filter((p) => valueOf(p) >= cut).map((p) => p.acc);
    const low = withStars.filter((p) => valueOf(p) < cut).map((p) => p.acc);
    if (high.length < minSide || low.length < minSide) return null;
    const highMed = medianOf(high);
    const lowMed = medianOf(low);
    return {
      cut,
      high: highMed,
      low: lowMed,
      highN: high.length,
      lowN: low.length,
      delta: highMed - lowMed,
    };
  };

  const segments = {
    ar: segment((p) => p.map.ar),
    cs: segment((p) => p.map.cs),
    bpm: segment((p) => p.map.bpm),
    drain: segment((p) => p.map.drainTime),
  };

  const perMap = new Map();
  for (const p of plays) {
    const key = p.key.toLowerCase();
    const entry = perMap.get(key) || { count: 0, bestAcc: 0, stars: p.stars, map: p.map, lastAt: 0 };
    entry.count += 1;
    entry.bestAcc = Math.max(entry.bestAcc, p.acc);
    entry.lastAt = Math.max(entry.lastAt, p.at || 0);
    perMap.set(key, entry);
  }

  const maps = osuDb.maps
    .filter((m) => m.mode === 0 && m.stars)
    .map((m) => {
      const entry = perMap.get(m.md5.toLowerCase());
      return {
        id: m.id,
        setId: m.setId,
        artist: m.artist,
        title: m.title,
        diff: m.diff,
        mapper: m.creator,
        stars: m.stars,
        ar: m.ar,
        od: m.od,
        cs: m.cs,
        bpm: m.bpm,
        drainTime: m.drainTime,
        plays: entry?.count ?? 0,
        bestAcc: entry?.bestAcc ?? 0,
        lastAt: entry?.lastAt ?? 0,
      };
    });

  const pickTop = (valueOf, limit = 5) => {
    const counts = new Map();
    for (const item of withStars) {
      const key = valueOf(item);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, plays: count }));
  };

  const modCounts = new Map();
  for (const item of withStars) {
    if (!item.modsArray.length) modCounts.set('NM', (modCounts.get('NM') || 0) + 1);
    for (const mod of item.modsArray) modCounts.set(mod, (modCounts.get(mod) || 0) + 1);
  }

  const stats = (values) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      median: quantile(sorted, 0.5),
      p25: quantile(sorted, 0.25),
      p75: quantile(sorted, 0.75),
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  };

  const preferences = {
    stars: stats(withStars.map((p) => p.stars)),
    bpm: stats(withStars.map((p) => p.map.bpm)),
    ar: stats(withStars.map((p) => p.map.ar)),
    length: stats(withStars.map((p) => p.map.drainTime)),
    creators: pickTop((p) => p.map.creator),
    artists: pickTop((p) => p.map.artist),
    mods: [...modCounts.entries()].sort((a, b) => b[1] - a[1]).map(([mod, count]) => ({ mod, plays: count })),
  };

  const topRepeated = [...perMap.values()]
    .filter((e) => e.count >= 4 && e.map)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((e) => ({
      title: e.map.title,
      artist: e.map.artist,
      diff: e.map.diff,
      stars: e.stars,
      plays: e.count,
      bestAcc: e.bestAcc,
    }));

  const dailyMap = new Map();
  const now = Date.now();
  for (const p of plays) {
    if (!p.at || now - p.at > 1000 * 60 * 60 * 24 * 30) continue;
    const key = dayKey(p.at);
    const e = dailyMap.get(key) || { day: key, plays: 0, accSum: 0 };
    e.plays += 1;
    e.accSum += p.acc;
    dailyMap.set(key, e);
  }
  const daily = [...dailyMap.values()]
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((e) => ({ day: e.day, plays: e.plays, acc: e.accSum / e.plays }));

  const recent = [...plays]
    .sort((a, b) => b.at - a.at)
    .slice(0, 12)
    .map((p) => ({
      id: p.map?.id ?? 0,
      title: p.map?.title ?? 'unknown',
      artist: p.map?.artist ?? '',
      diff: p.map?.diff ?? '',
      mapper: p.map?.creator ?? '',
      stars: p.stars,
      acc: p.acc,
      mods: p.modsArray,
      combo: p.maxCombo,
      miss: p.miss,
      at: p.at,
    }));

  const hours = Array.from({ length: 24 }, () => 0);
  const dayPlays = new Map();
  let playSeconds = 0;
  let bestPlay = null;
  const artistSet = new Set();
  const creatorSet = new Set();

  for (const p of plays) {
    if (p.at) {
      hours[new Date(p.at).getHours()] += 1;
      const key = dayKey(p.at);
      dayPlays.set(key, (dayPlays.get(key) || 0) + 1);
    }
    const drain = p.map?.drainTime || 0;
    if (drain > 0) playSeconds += drain;
    if (p.map?.artist) artistSet.add(p.map.artist);
    if (p.map?.creator) creatorSet.add(p.map.creator);
    if (!bestPlay || p.acc > bestPlay.acc) {
      bestPlay = {
        title: p.map?.title || '—',
        artist: p.map?.artist || '',
        diff: p.map?.diff || '',
        stars: p.stars ?? null,
        acc: p.acc,
        at: p.at || 0,
      };
    }
  }

  const busiest = [...dayPlays.entries()].sort((a, b) => b[1] - a[1])[0];

  const totalPlayCount = plays.length;
  const uniqueMaps = perMap.size;

  return {
    ok: true,
    scannedAt: Date.now(),
    player: osuDb.player,
    mapsTotal: osuDb.maps.length,
    playsTotal: totalPlayCount,
    uniqueMaps,
    avgAcc: allAccs.length ? allAccs.reduce((s, v) => s + v, 0) / allAccs.length : 0,
    medianAcc,
    comfortStar: comfort?.star ?? null,
    comfortAcc: comfort?.median ?? null,
    hardStar: hard?.star ?? null,
    hardAcc: hard?.median ?? null,
    playsAboveHard,
    playsWithStars: withStars.length,
    skills,
    segments,
    preferences,
    maps,
    playsPerMap: uniqueMaps ? totalPlayCount / uniqueMaps : 0,
    buckets,
    topRepeated,
    recent,
    daily,
    hours,
    playSeconds,
    uniqueArtists: artistSet.size,
    uniqueCreators: creatorSet.size,
    activeDays: dayPlays.size,
    busiestDay: busiest ? { day: busiest[0], plays: busiest[1] } : null,
    bestPlay,
  };
}

/** Cached osu!.db, so replay lookups don't re-parse it on every poll. */
const osuDbCache = new Map();

function findBeatmapByHash(osuDir, hash) {
  if (!osuDir || !hash) return null;
  const dbPath = path.join(osuDir, 'osu!.db');
  let mtime = 0;
  try {
    mtime = fs.statSync(dbPath).mtimeMs;
  } catch {
    return null;
  }
  let entry = osuDbCache.get(osuDir);
  if (!entry || entry.mtime !== mtime) {
    try {
      entry = { mtime, db: parseOsuDb(fs.readFileSync(dbPath)) };
      osuDbCache.set(osuDir, entry);
    } catch {
      return null;
    }
  }
  const want = String(hash).toLowerCase();
  return entry.db.maps.find((m) => m.md5.toLowerCase() === want) || null;
}

module.exports = { scanStable, parseOsuDb, parseScoresDb, modsToArray, pickStars, findBeatmapByHash };
