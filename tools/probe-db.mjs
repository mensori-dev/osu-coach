// One-off probe: figure out exact osu!.db / scores.db layouts on this machine.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.env.LOCALAPPDATA, 'osu!');
const osuDbPath = path.join(root, 'osu!.db');
const scoresPath = path.join(root, 'scores.db');

class R {
  constructor(b) { this.b = b; this.o = 0; }
  u8() { return this.b[this.o++]; }
  i16() { const v = this.b.readInt16LE(this.o); this.o += 2; return v; }
  u16() { const v = this.b.readUInt16LE(this.o); this.o += 2; return v; }
  i32() { const v = this.b.readInt32LE(this.o); this.o += 4; return v; }
  u32() { const v = this.b.readUInt32LE(this.o); this.o += 4; return v; }
  i64() { const v = this.b.readBigInt64LE(this.o); this.o += 8; return Number(v); }
  f32() { const v = this.b.readFloatLE(this.o); this.o += 4; return v; }
  f64() { const v = this.b.readDoubleLE(this.o); this.o += 8; return v; }
  bool() { return this.u8() !== 0; }
  str() {
    const marker = this.u8();
    if (marker === 0) return '';
    if (marker !== 0x0b) throw new Error(`bad string marker ${marker} at ${this.o - 1}`);
    let len = 0, shift = 0, byte;
    do { byte = this.u8(); len |= (byte & 0x7f) << shift; shift += 7; } while (byte & 0x80);
    const s = this.b.toString('utf8', this.o, this.o + len);
    this.o += len;
    return s;
  }
}

const md5re = /^[0-9a-f]{32}$/;

function parseOsuDb(variant) {
  const b = fs.readFileSync(osuDbPath);
  const r = new R(b);
  const version = r.i32();
  const folders = r.i32();
  const unlocked = r.bool();
  const unlockTicks = r.i64();
  const player = r.str();
  const count = r.i32();
  const maps = [];
  for (let i = 0; i < count; i++) {
    if (version < 20191107) r.i32();
    const artist = r.str();
    const artistU = r.str();
    const title = r.str();
    const titleU = r.str();
    const creator = r.str();
    const diff = r.str();
    const audio = r.str();
    const md5 = r.str();
    const osuFile = r.str();
    const ranked = r.u8();
    const circles = r.i16();
    const sliders = r.i16();
    const spinners = r.i16();
    const lastMod = r.i64();
    if (version < 20140609) { r.u8(); r.u8(); r.u8(); r.u8(); }
    else { r.f32(); r.f32(); r.f32(); r.f32(); }
    const sv = r.f64();
    let stars = null;
    if (version >= 20140609) {
      const sections = [];
      for (let s = 0; s < 4; s++) {
        const n = r.i32();
        const diffs = {};
        for (let j = 0; j < n; j++) {
          if (variant === 'extra') r.u8();
          const mode = r.i32();
          const mods = variant === 'extra' ? r.u8() : r.i32();
          const starsVal = version > 20250107 ? r.f32() : r.f64();
          diffs[mods] = starsVal;
        }
        sections.push(diffs);
      }
      stars = sections[0];
    }
    const drain = r.i32();
    const total = r.i32();
    const preview = r.i32();
    const tpCount = r.i32();
    const tps = [];
    for (let j = 0; j < tpCount; j++) { tps.push([r.f64(), r.f64(), r.bool()]); }
    const id = r.i32();
    const setId = r.i32();
    const thread = r.i32();
    r.u8(); r.u8(); r.u8(); r.u8();
    r.i16();
    r.f32();
    const mode = r.u8();
    const source = r.str();
    const tags = r.str();
    r.i16();
    const titleFont = r.str();
    const unplayed = r.bool();
    const lastPlayed = r.i64();
    const osz2 = r.bool();
    const folder = r.str();
    r.i64();
    const igSound = r.bool(); const igSkin = r.bool(); const igSb = r.bool(); const igVideo = r.bool(); const visOverride = r.bool();
    if (version < 20140609) r.i16();
    r.i32();
    r.u8();
    maps.push({ artist, title, diff, md5, id, setId, mode, stars, ar: 0, circles, sliders, spinners, ranked, folder });
  }
  return { version, folders, unlocked, player, count, maps, end: r.o, size: b.length, rest: b.length - r.o };
}

console.log('--- osu!.db ---');
for (const v of ['extra', 'plain']) {
  try {
    const res = parseOsuDb(v);
    const goodMd5 = res.maps.filter(m => md5re.test(m.md5)).length;
    console.log(v, JSON.stringify({ version: res.version, player: res.player, count: res.count, parsed: res.maps.length, goodMd5, rest: res.rest, first: res.maps[0] && { artist: res.maps[0].artist, title: res.maps[0].title, diff: res.maps[0].diff, id: res.maps[0].id, stars: res.maps[0].stars } }));
  } catch (e) {
    console.log(v, 'FAILED', e.message);
  }
}

console.log('\n--- scores.db ---');
for (const withHp of [false, true]) {
  try {
    const b = fs.readFileSync(scoresPath);
    const r = new R(b);
    const version = r.i32();
    const bmCount = r.i32();
    let scores = 0, badMd5 = 0, plausibleTs = 0, minTs = Infinity, maxTs = 0;
    const samples = [];
    for (let i = 0; i < bmCount; i++) {
      const bmMd5 = r.str();
      if (!md5re.test(bmMd5)) badMd5++;
      const n = r.i32();
      for (let j = 0; j < n; j++) {
        const mode = r.u8();
        const sver = r.i32();
        r.str(); r.str(); r.str();
        const c300 = r.u16(), c100 = r.u16(), c50 = r.u16(), cgeki = r.u16(), ckatu = r.u16(), cmiss = r.u16();
        const total = r.i32();
        const combo = r.u16();
        const perfect = r.bool();
        const mods = r.i32();
        if (withHp) r.str();
        const ts = r.i64();
        r.bool();
        if (sver >= 20140722) r.i64();
        scores++;
        if (ts > 6e17 && ts < 7e17) plausibleTs++;
        minTs = Math.min(minTs, ts); maxTs = Math.max(maxTs, ts);
        if (samples.length < 2) samples.push({ mode, sver, c300, c100, c50, cmiss, total, combo, mods, ts });
      }
    }
    console.log('withHp=' + withHp, JSON.stringify({ version, bmCount, scores, badMd5, plausibleTs, rest: b.length - r.o, samples }));
  } catch (e) {
    console.log('withHp=' + withHp, 'FAILED', e.message);
  }
}
