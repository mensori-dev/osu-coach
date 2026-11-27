'use strict';

const MAP = {
  id: 0,
  setId: 0,
  artist: 'Kenshi Yonezu',
  title: 'Lemon',
  version: 'Insane',
  mapper: 'Skystar',
  stars: 4.62,
  ar: 9.2,
  od: 8.8,
  cs: 4,
  hp: 6,
  bpm: 174,
  maxCombo: 1187,
  objects: 864,
  lengthMs: 221000,
  kiai: true,
  mode: 'osu',
  status: 3,
};

const PLAYER = {
  name: 'mens0ri',
  id: 39988385,
  pp: 1387.71,
  rank: 733098,
  accuracy: 89.2,
  playCount: 1109,
};

function gauss(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Demo {
  constructor() {
    this.attempt = 0;
    this.phase = 'playing';
    this.elapsed = 0;
    this.resultsFor = 0;
    this.buildAttempt();
  }

  buildAttempt() {
    const rng = mulberry32(1337 + this.attempt * 977);
    const n = MAP.objects;
    const start = 1400;
    const span = MAP.lengthMs - start - 1800;

    // Choke windows make the demo look like a real, imperfect play.
    const chokes = [
      { from: 0.34, to: 0.41, sigma: 52 },
      { from: 0.67, to: 0.73, sigma: 44 },
      { from: 0.9, to: 0.94, sigma: 36 },
    ];
    const baseSigma = 15 + this.attempt * 2;

    this.hits = [];
    let t = start;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const spacing = (span / n) * (0.55 + rng() * 0.9);
      t += spacing;
      const choke = chokes.find((c) => p >= c.from && p <= c.to);
      const sigma = choke ? choke.sigma : baseSigma;
      let err = gauss(rng) * sigma;
      if (rng() < 0.004) err += (rng() > 0.5 ? 1 : -1) * (110 + rng() * 70);
      this.hits.push({ t, err });
    }
    this.elapsed = 0;
    this.phase = 'playing';
    this.hitsSoFar = 0;
    this.w300 = 0;
    this.w100 = 0;
    this.w50 = 0;
    this.miss = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.errors = [];
    this.cursor = 0;
  }

  step(dt) {
    if (this.phase === 'playing') {
      this.elapsed += dt;
      while (this.cursor < this.hits.length && this.hits[this.cursor].t <= this.elapsed) {
        this.register(this.hits[this.cursor]);
        this.cursor += 1;
      }
      if (this.elapsed > MAP.lengthMs + 2600) {
        this.phase = 'results';
        this.resultsFor = 0;
      }
    } else {
      this.resultsFor += dt;
      if (this.resultsFor > 6500) {
        this.attempt += 1;
        this.buildAttempt();
      }
    }
  }

  register(hit) {
    const err = hit.err;
    const abs = Math.abs(err);
    const w300 = 79.5 - 6 * MAP.od;
    const w100 = 139.5 - 8 * MAP.od;
    const w50 = 199.5 - 10 * MAP.od;

    this.hitsSoFar += 1;
    this.errors.push(err);
    if (this.errors.length > 400) this.errors.shift();

    if (abs <= w300) this.w300 += 1;
    else if (abs <= w100) this.w100 += 1;
    else if (abs <= w50) this.w50 += 1;
    else this.miss += 1;

    if (abs > w50) this.combo = 0;
    else this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  stats() {
    const total = this.w300 + this.w100 + this.w50 + this.miss;
    const acc = total ? ((this.w300 * 300 + this.w100 * 100 + this.w50 * 50) / (total * 300)) * 100 : 100;
    const base = Math.pow(MAP.stars, 2.4) * 6.4;
    const comboRatio = MAP.maxCombo ? Math.min(1, this.combo / MAP.maxCombo) : 0;
    const current = base * Math.pow(acc / 100, 9) * Math.pow(comboRatio, 0.4);
    const fc = base * Math.pow(acc / 100, 9);
    const max = base * 1.08;
    const score = Math.round((this.w300 * 300 + this.w100 * 100 + this.w50 * 50) * (1 + this.maxCombo / 40));
    const rank = acc >= 100 ? 'SS' : acc >= 95 ? 'S' : acc >= 90 ? 'A' : acc >= 80 ? 'B' : acc >= 70 ? 'C' : 'D';
    return { total, acc, current, fc, max, score, rank };
  }

  payload() {
    const s = this.stats();
    const totalMs = MAP.lengthMs;
    const progress = Math.min(1, Math.max(0, (this.elapsed - 1400) / (totalMs - 3200)));
    return {
      source: 'demo',
      connected: true,
      state: this.phase,
      updatedAt: Date.now(),
      player: PLAYER,
      beatmap: MAP,
      play: {
        score: s.score,
        accuracy: s.acc,
        combo: this.combo,
        maxCombo: this.maxCombo,
        hits: { 300: this.w300, 100: this.w100, 50: this.w50, miss: this.miss, geki: 0, katu: 0 },
        pp: { current: s.current, fc: s.fc, max: s.max },
        mods: [],
        rank: s.rank,
        failed: false,
        progress,
        elapsedMs: Math.min(this.elapsed, totalMs),
        totalMs,
        ur: this.ur(),
      },
      hitErrors: this.errors.slice(-240),
      keys: { k1: false, k2: false, m1: false, m2: false },
      cover: null,
      tosu: { connected: false, port: 24050 },
    };
  }

  ur() {
    if (!this.errors.length) return 0;
    const sum = this.errors.reduce((acc, e) => acc + e * e, 0);
    return Math.sqrt(sum / this.errors.length) * 10;
  }
}

module.exports = { Demo, DEMO_MAP: MAP, DEMO_PLAYER: PLAYER };
