import type { Bootstrap, Bridge, LivePayload, ScanResult } from './types';

const MAP = {
  id: 1,
  setId: 1,
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
};

const PLAYER = {
  name: 'mens0ri',
  id: 39988385,
  pp: 1387.71,
  rank: 733098,
  accuracy: 89.2,
  playCount: 1109,
};

function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

class DemoEngine {
  elapsed = 0;
  cursor = 0;
  phase: 'playing' | 'results' = 'playing';
  resultsFor = 0;
  hits: { t: number; err: number }[] = [];
  w300 = 0;
  w100 = 0;
  w50 = 0;
  miss = 0;
  combo = 0;
  maxCombo = 0;
  errors: number[] = [];

  constructor() {
    this.build();
  }

  build() {
    const n = MAP.objects;
    const start = 1400;
    const span = MAP.lengthMs - start - 1800;
    const chokes = [
      { from: 0.34, to: 0.41, sigma: 52 },
      { from: 0.67, to: 0.73, sigma: 44 },
      { from: 0.9, to: 0.94, sigma: 36 },
    ];
    this.hits = [];
    let t = start;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      t += (span / n) * (0.55 + Math.random() * 0.9);
      const choke = chokes.find((c) => p >= c.from && p <= c.to);
      const sigma = choke ? choke.sigma : 16;
      let err = gauss() * sigma;
      if (Math.random() < 0.004) err += (Math.random() > 0.5 ? 1 : -1) * (110 + Math.random() * 70);
      this.hits.push({ t, err });
    }
    this.elapsed = 0;
    this.cursor = 0;
    this.phase = 'playing';
    this.resultsFor = 0;
    this.w300 = 0;
    this.w100 = 0;
    this.w50 = 0;
    this.miss = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.errors = [];
  }

  register(err: number) {
    const abs = Math.abs(err);
    const w300 = 79.5 - 6 * MAP.od;
    const w100 = 139.5 - 8 * MAP.od;
    const w50 = 199.5 - 10 * MAP.od;
    this.errors.push(err);
    if (this.errors.length > 300) this.errors.shift();
    if (abs <= w300) this.w300 += 1;
    else if (abs <= w100) this.w100 += 1;
    else if (abs <= w50) this.w50 += 1;
    else this.miss += 1;
    if (abs > w50) this.combo = 0;
    else this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  step(dt: number) {
    if (this.phase === 'playing') {
      this.elapsed += dt;
      while (this.cursor < this.hits.length && this.hits[this.cursor].t <= this.elapsed) {
        this.register(this.hits[this.cursor].err);
        this.cursor += 1;
      }
      if (this.elapsed > MAP.lengthMs + 2200) {
        this.phase = 'results';
        this.resultsFor = 0;
      }
    } else {
      this.resultsFor += dt;
      if (this.resultsFor > 5000) this.build();
    }
  }

  payload(): LivePayload {
    const total = this.w300 + this.w100 + this.w50 + this.miss;
    const acc = total ? ((this.w300 * 300 + this.w100 * 100 + this.w50 * 50) / (total * 300)) * 100 : 100;
    const base = Math.pow(MAP.stars, 2.4) * 6.4;
    const ratio = Math.min(1, this.combo / MAP.maxCombo);
    const current = base * Math.pow(acc / 100, 9) * Math.pow(ratio, 0.4);
    const ur = this.errors.length ? Math.sqrt(this.errors.reduce((s, e) => s + e * e, 0) / this.errors.length) * 10 : 0;
    return {
      source: 'demo',
      connected: true,
      state: this.phase,
      updatedAt: Date.now(),
      player: PLAYER,
      beatmap: MAP,
      play: {
        score: Math.round((this.w300 * 300 + this.w100 * 100 + this.w50 * 50) * (1 + this.maxCombo / 40)),
        accuracy: acc,
        combo: this.combo,
        maxCombo: this.maxCombo,
        hits: { '300': this.w300, '100': this.w100, '50': this.w50, miss: this.miss, geki: 0, katu: 0 },
        pp: { current, fc: base * Math.pow(acc / 100, 9), max: base * 1.08 },
        mods: [],
        rank: acc >= 95 ? 'S' : acc >= 90 ? 'A' : 'B',
        failed: false,
        progress: Math.min(1, Math.max(0, (this.elapsed - 1400) / (MAP.lengthMs - 3200))),
        elapsedMs: Math.min(this.elapsed, MAP.lengthMs),
        totalMs: MAP.lengthMs,
        ur,
      },
      hitErrors: this.errors.slice(-240),
      keys: { k1: false, k2: false, m1: false, m2: false },
      cover: null,
      tosu: { connected: false, port: 24050 },
    };
  }
}

const scan: ScanResult = {
  ok: true,
  scannedAt: Date.now(),
  player: 'mens0ri',
  mapsTotal: 449,
  playsTotal: 385,
  uniqueMaps: 207,
  avgAcc: 86.8,
  medianAcc: 87.9,
  comfortStar: 3.5,
  comfortAcc: 92.8,
  hardStar: 4.5,
  hardAcc: 85.7,
  playsAboveHard: 170,
  playsWithStars: 389,
  playsPerMap: 1.88,
  skills: {
    accuracy: 88.0,
    consistency: 70.1,
    combo: 76.3,
    speed: 87.7,
    stamina: 87.8,
    gap: 8.5,
    missRate: 2.37,
    zeroMiss: 17.0,
    speedCut: 186.3,
    staminaCut: 108,
    speedN: 119,
    staminaN: 118,
    n: 389,
  },
  segments: {
    ar: { cut: 9, high: 84.6, low: 91.5, highN: 186, lowN: 204, delta: -6.8 },
    cs: { cut: 4, high: 85.9, low: 89.4, highN: 135, lowN: 255, delta: -3.5 },
    bpm: { cut: 186.3, high: 87.7, low: 88.0, highN: 119, lowN: 271, delta: -0.3 },
    drain: { cut: 108, high: 88.0, low: 88.1, highN: 119, lowN: 271, delta: -0.1 },
  },
  buckets: [
    { star: 2.5, count: 8, acc: 92.3, best: 96.2, median: 92.4 },
    { star: 3, count: 19, acc: 94.0, best: 100, median: 94.7 },
    { star: 3.5, count: 101, acc: 91.4, best: 100, median: 92.8 },
    { star: 4, count: 87, acc: 87.9, best: 98.1, median: 89.6 },
    { star: 4.5, count: 91, acc: 84.0, best: 97.3, median: 85.7 },
    { star: 5, count: 60, acc: 81.6, best: 91.6, median: 82.1 },
    { star: 5.5, count: 14, acc: 79.1, best: 86.8, median: 79.8 },
    { star: 6, count: 4, acc: 77.6, best: 79.9, median: 78.3 },
  ],
  topRepeated: [],
  preferences: {
    stars: { median: 4.12, p25: 3.6, p75: 4.6, min: 2.34, max: 6.5 },
    bpm: { median: 172.8, p25: 135, p75: 194.3, min: 66, max: 300 },
    ar: { median: 8.8, p25: 8, p75: 9, min: 4.8, max: 10 },
    length: { median: 83, p25: 63, p75: 126, min: 15, max: 294 },
    creators: [
      { name: 'Sotarks', plays: 35 },
      { name: 'jzxdxxx', plays: 29 },
      { name: 'Alumetri', plays: 22 },
      { name: 'defreeyay', plays: 21 },
      { name: 'schoolboy', plays: 21 },
    ],
    artists: [
      { name: 'Michael Sembello', plays: 29 },
      { name: 'ПОШЛАЯ МОЛЛИ', plays: 28 },
      { name: 'CUPSIZE', plays: 20 },
    ],
    mods: [
      { mod: 'NM', plays: 375 },
      { mod: 'SD', plays: 13 },
      { mod: 'HR', plays: 2 },
      { mod: 'HT', plays: 2 },
    ],
  },
  maps: [
    {
      id: 101,
      setId: 11,
      artist: 'Kenshi Yonezu',
      title: 'Lemon',
      diff: 'Insane',
      mapper: 'Skystar',
      stars: 4.62,
      ar: 9.2,
      od: 8.8,
      cs: 4,
      bpm: 174,
      drainTime: 221,
      plays: 14,
      bestAcc: 97.8,
      lastAt: Date.now() - 86400000,
    },
    {
      id: 102,
      setId: 12,
      artist: 'Kuba Oms',
      title: 'My Love',
      diff: 'Insane',
      mapper: 'Sotarks',
      stars: 4.02,
      ar: 9,
      od: 8,
      cs: 4,
      bpm: 172,
      drainTime: 210,
      plays: 8,
      bestAcc: 99.1,
      lastAt: Date.now() - 3 * 86400000,
    },
    {
      id: 103,
      setId: 13,
      artist: 'Yorushika',
      title: 'Haru',
      diff: 'Expert',
      mapper: 'Alumetri',
      stars: 4.9,
      ar: 9.4,
      od: 9,
      cs: 4.2,
      bpm: 186,
      drainTime: 240,
      plays: 4,
      bestAcc: 95.4,
      lastAt: Date.now() - 5 * 86400000,
    },
    {
      id: 104,
      setId: 14,
      artist: 'Reol',
      title: 'Kagerou',
      diff: 'Extra',
      mapper: 'jzxdxxx',
      stars: 5.12,
      ar: 9.6,
      od: 9.2,
      cs: 4.2,
      bpm: 200,
      drainTime: 195,
      plays: 2,
      bestAcc: 93.7,
      lastAt: Date.now() - 8 * 86400000,
    },
    {
      id: 105,
      setId: 15,
      artist: 'Miku',
      title: 'Sakura',
      diff: 'Hard',
      mapper: 'schoolboy',
      stars: 4.05,
      ar: 8.8,
      od: 8,
      cs: 3.8,
      bpm: 165,
      drainTime: 180,
      plays: 6,
      bestAcc: 99.6,
      lastAt: Date.now() - 2 * 86400000,
    },
    {
      id: 106,
      setId: 16,
      artist: 'Camellia',
      title: 'Ghost',
      diff: 'Insane',
      mapper: 'defreeyay',
      stars: 5.31,
      ar: 9.8,
      od: 9.4,
      cs: 4.4,
      bpm: 220,
      drainTime: 205,
      plays: 3,
      bestAcc: 92.1,
      lastAt: Date.now() - 6 * 86400000,
    },
    {
      id: 107,
      setId: 17,
      artist: 'Suzumu',
      title: 'Snow Drive',
      diff: 'Expert',
      mapper: 'Sotarks',
      stars: 4.77,
      ar: 9.3,
      od: 8.8,
      cs: 4,
      bpm: 190,
      drainTime: 230,
      plays: 5,
      bestAcc: 96.3,
      lastAt: Date.now() - 4 * 86400000,
    },
    {
      id: 108,
      setId: 18,
      artist: 'Aoi',
      title: 'Night Sky',
      diff: 'Insane',
      mapper: 'Alumetri',
      stars: 4.41,
      ar: 9.1,
      od: 8.6,
      cs: 4,
      bpm: 178,
      drainTime: 215,
      plays: 0,
      bestAcc: 0,
      lastAt: 0,
    },
    {
      id: 109,
      setId: 19,
      artist: 'Cupsize',
      title: 'Василий',
      diff: 'Normal',
      mapper: 'Parad0xa',
      stars: 2.52,
      ar: 7,
      od: 6,
      cs: 3.5,
      bpm: 140,
      drainTime: 95,
      plays: 9,
      bestAcc: 98.2,
      lastAt: Date.now() - 3600000,
    },
    {
      id: 110,
      setId: 20,
      artist: 'Michael Sembello',
      title: 'Maniac',
      diff: 'Insane',
      mapper: 'Sotarks',
      stars: 4.33,
      ar: 9,
      od: 8.5,
      cs: 4,
      bpm: 160,
      drainTime: 200,
      plays: 7,
      bestAcc: 97.1,
      lastAt: Date.now() - 9 * 86400000,
    },
    {
      id: 111,
      setId: 21,
      artist: 'ПОШЛАЯ МОЛЛИ',
      title: 'Плачь',
      diff: 'Hard',
      mapper: 'jzxdxxx',
      stars: 3.6,
      ar: 8,
      od: 7,
      cs: 3.6,
      bpm: 150,
      drainTime: 170,
      plays: 5,
      bestAcc: 96.8,
      lastAt: Date.now() - 12 * 86400000,
    },
    {
      id: 112,
      setId: 22,
      artist: 'xi',
      title: 'Blue Zenith',
      diff: 'FOUR DIMENSIONS',
      mapper: 'Asphyxia',
      stars: 6.1,
      ar: 9.8,
      od: 9.5,
      cs: 4.2,
      bpm: 200,
      drainTime: 280,
      plays: 9,
      bestAcc: 84.2,
      lastAt: Date.now() - 20 * 86400000,
    },
  ],
  recent: [
    {
      id: 109,
      title: 'Василий',
      artist: 'Cupsize',
      diff: 'Normal',
      mapper: 'Parad0xa',
      stars: 2.52,
      acc: 98.2,
      mods: [],
      combo: 565,
      miss: 0,
      at: Date.now() - 3600000,
    },
    {
      id: 105,
      title: 'Sakura',
      artist: 'Miku',
      diff: 'Hard',
      mapper: 'schoolboy',
      stars: 4.05,
      acc: 99.6,
      mods: [],
      combo: 640,
      miss: 0,
      at: Date.now() - 2 * 86400000,
    },
    {
      id: 101,
      title: 'Lemon',
      artist: 'Kenshi Yonezu',
      diff: 'Insane',
      mapper: 'Skystar',
      stars: 4.62,
      acc: 97.8,
      mods: [],
      combo: 812,
      miss: 1,
      at: Date.now() - 3 * 86400000,
    },
  ],
  daily: [
    { day: '2026-11-19', plays: 32, acc: 85.1 },
    { day: '2026-11-20', plays: 51, acc: 83.2 },
    { day: '2026-11-21', plays: 102, acc: 86.8 },
    { day: '2026-11-22', plays: 70, acc: 93.2 },
    { day: '2026-11-23', plays: 0, acc: 0 },
    { day: '2026-11-24', plays: 0, acc: 0 },
    { day: '2026-11-25', plays: 0, acc: 0 },
    { day: '2026-11-26', plays: 6, acc: 89.0 },
  ],
  hours: [6, 3, 1, 0, 0, 1, 2, 4, 7, 9, 12, 14, 16, 18, 20, 22, 26, 31, 38, 42, 35, 28, 19, 11],
  playSeconds: 32_400,
  uniqueArtists: 118,
  uniqueCreators: 76,
  activeDays: 47,
  busiestDay: { day: '2026-11-21', plays: 102 },
  bestPlay: {
    title: 'My Love',
    artist: 'Kuba Oms',
    diff: 'Insane',
    stars: 4.02,
    acc: 99.1,
    at: Date.now() - 3 * 86400000,
  },
};

const best = [
  { stars: 4.62, acc: 97.8, pp: 128.4, mods: [], title: 'Lemon', artist: 'Kenshi Yonezu', diff: 'Insane' },
  { stars: 4.28, acc: 99.1, pp: 112.7, mods: ['HD'], title: 'My Love', artist: 'Kuba Oms', diff: 'Insane' },
  { stars: 4.9, acc: 95.4, pp: 104.2, mods: [], title: 'Haru', artist: 'Yorushika', diff: 'Expert' },
  { stars: 4.41, acc: 98.2, pp: 96.8, mods: [], title: 'Night Sky', artist: 'Aoi', diff: 'Insane' },
  { stars: 5.12, acc: 93.7, pp: 88.1, mods: [], title: 'Kagerou', artist: 'Reol', diff: 'Extra' },
  { stars: 4.05, acc: 99.6, pp: 84.3, mods: [], title: 'Sakura', artist: 'Miku', diff: 'Hard' },
  { stars: 5.31, acc: 92.1, pp: 79.6, mods: ['DT'], title: 'Ghost', artist: 'Camellia', diff: 'Insane' },
  { stars: 4.77, acc: 96.3, pp: 74.9, mods: [], title: 'Snow Drive', artist: 'Suzumu', diff: 'Expert' },
].map((s, i) => ({
  id: i,
  pp: s.pp,
  acc: s.acc,
  stars: s.stars,
  mods: s.mods,
  rank: s.acc >= 95 ? 'S' : 'A',
  combo: 900,
  miss: 1,
  date: '2026-11-2' + (i % 9),
  score: 1000000,
  map: { id: i, setId: i, artist: s.artist, title: s.title, version: s.diff, cover: '' },
}));

const engine = new DemoEngine();

export function createMockBridge(): Bridge {
  let listeners: ((p: LivePayload) => void)[] = [];
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    engine.step(Math.min(120, now - last));
    last = now;
    const payload = engine.payload();
    listeners.forEach((l) => l(payload));
  }, 50);

  return {
    bootstrap: async (): Promise<Bootstrap> => ({
      settings: {
        user: 'mens0ri',
        demo: true,
        tosuPort: 24050,
        tosuPath: 'C:\\tosu\\tosu.exe',
        osuDir: 'C:\\Users\\skamm\\AppData\\Local\\osu!',
        apiClientId: '00000',
        apiClientSecret: '',
        onboarded: !window.location.search.includes('onboarding'),
        tutorialSeen: true,
        device: 'mouse',
        tapping: 'alternate',
        goal: 'accuracy',
        dailyMinutes: 60,
        style: 'mixed',
        modPref: 'nm',
        music: 'Bring Me The Horizon, Drum and Bass',
        annoy: 'misses',
        theme: 'cover',
        overlay: false,
        overlayPos: 'tl',
      },
      live: engine.payload(),
      scan,
      api: {
        status: { configured: true, fetchedAt: Date.now(), error: null, user: 'mens0ri' },
        profile: {
          id: 39988385,
          username: 'mens0ri',
          avatar: '',
          cover: '',
          country: 'RU',
          pp: 1387.71,
          rank: 733098,
          countryRank: 83517,
          accuracy: 89.2,
          playCount: 1109,
          playTime: 69800,
          level: 45,
          maxCombo: 768,
        },
        best,
        recent: best.slice(0, 5),
        rankHistory: Array.from({ length: 40 }, (_, i) => 780000 - i * 1200 + Math.random() * 4000),
      },
      tosu: { connected: false, port: 24050 },
      history: [
        {
          at: Date.now() - 30 * 86400000,
          playsTotal: 240,
          avgAcc: 85.2,
          medianAcc: 86.4,
          comfortStar: 3,
          comfortAcc: 91.1,
          hardStar: 4.5,
          hardAcc: 83.2,
          pp: 1180,
        },
        {
          at: Date.now() - 14 * 86400000,
          playsTotal: 310,
          avgAcc: 86.1,
          medianAcc: 87.1,
          comfortStar: 3.5,
          comfortAcc: 91.9,
          hardStar: 4.5,
          hardAcc: 84.4,
          pp: 1290,
        },
        {
          at: Date.now() - 2 * 86400000,
          playsTotal: 389,
          avgAcc: 86.9,
          medianAcc: 88.0,
          comfortStar: 3.5,
          comfortAcc: 92.8,
          hardStar: 4.5,
          hardAcc: 85.7,
          pp: 1387.7,
        },
      ],
      paths: { osuDir: 'C:\\Users\\skamm\\AppData\\Local\\osu!', dataDir: 'data', envFile: '.env' },
      version: '0.1.0',
    }),
    scan: async () => scan,
    replayLatest: async () => ({ ok: false, error: 'empty', path: '', analysis: null }),
    refreshApi: async () => (await createMockBridge().bootstrap()).api,
    searchMaps: async () => ({
      ok: true,
      total: 3,
      next: null,
      maps: [
        {
          id: 901,
          setId: 901,
          artist: 'Ludicin',
          title: 'Signal',
          diff: "nyalp's Light Insane",
          mapper: 'nyalp',
          stars: 4.0,
          bpm: 170,
          drainTime: 131,
          ar: 8.9,
          cs: 4,
          od: 8.2,
          cover: '',
          status: 'ranked',
        },
        {
          id: 902,
          setId: 902,
          artist: 'MOCKER44. feat. Xing Chen',
          title: 'Shi Kong Mang',
          diff: "Voice's Insane",
          mapper: 'Voice',
          stars: 4.26,
          bpm: 175,
          drainTime: 154,
          ar: 9.1,
          cs: 4,
          od: 8.5,
          cover: '',
          status: 'ranked',
        },
        {
          id: 903,
          setId: 903,
          artist: 'CUPSIZE',
          title: 'kislorod',
          diff: "parad0xa's insane",
          mapper: 'parad0xa',
          stars: 4.33,
          bpm: 198,
          drainTime: 138,
          ar: 9.3,
          cs: 4,
          od: 8.7,
          cover: '',
          status: 'ranked',
        },
      ],
    }),
    installedSets: async () => [901, 902, 903],
    openMap: async () => ({ ok: true }),
    coverData: async () => null,
    downloadMap: async () => ({ ok: true, path: 'mock.osz' }),
    launchTosu: async () => ({ ok: true, path: 'C:\\tosu\\tosu.exe', up: true }),
    pickTosu: async () => ({ ok: true, path: 'C:\\tosu\\tosu.exe' }),
    setSettings: async (patch) => ({
      user: 'mens0ri',
      demo: true,
      tosuPort: 24050,
      tosuPath: 'C:\\tosu\\tosu.exe',
      osuDir: '',
      apiClientId: '00000',
      apiClientSecret: '',
      onboarded: true,
      tutorialSeen: true,
      device: 'mouse',
      tapping: 'alternate',
      goal: 'accuracy',
      dailyMinutes: 60,
      style: 'mixed',
      modPref: 'nm',
      music: 'Bring Me The Horizon, Drum and Bass',
      annoy: 'misses',
      theme: 'cover',
      overlay: false,
      overlayPos: 'tl',
      ...patch,
    }),
    openExternal: async () => true,
    onLive: (cb) => {
      listeners.push(cb);
      cb(engine.payload());
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    onData: () => () => {},
    win: {
      min: () => {},
      max: () => {},
      full: () => {},
      close: () => {},
      onFull: () => () => {},
      onFrame: () => () => {},
    },
  };
}
