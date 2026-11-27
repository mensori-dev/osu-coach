export type LiveState = 'idle' | 'menu' | 'playing' | 'paused' | 'results';

export interface HitCounts {
  '300': number;
  '100': number;
  '50': number;
  miss: number;
  geki: number;
  katu: number;
}

export interface BeatmapInfo {
  id: number;
  setId: number;
  artist: string;
  title: string;
  version: string;
  mapper: string;
  stars: number;
  ar: number;
  od: number;
  cs: number;
  hp: number;
  bpm: number;
  maxCombo: number;
  objects: number;
  lengthMs: number;
  kiai: boolean;
  mode: string;
  status?: number;
}

export interface PlayInfo {
  score: number;
  accuracy: number;
  combo: number;
  maxCombo: number;
  hits: HitCounts;
  pp: { current: number; fc: number; max: number };
  mods: string[];
  rank: string;
  failed: boolean;
  progress: number;
  elapsedMs: number;
  totalMs: number;
  ur: number;
}

export interface LivePayload {
  source: 'tosu' | 'demo';
  connected: boolean;
  state: LiveState;
  updatedAt: number;
  player: {
    name: string;
    id: number;
    pp: number;
    rank: number | null;
    accuracy: number;
    playCount: number;
  } | null;
  beatmap: BeatmapInfo | null;
  play: PlayInfo | null;
  hitErrors: number[];
  keys: { k1: boolean; k2: boolean; m1: boolean; m2: boolean } | null;
  cover: string | null;
  tosu: { connected: boolean; port: number };
}

export interface ScanBucket {
  star: number;
  count: number;
  acc: number;
  best: number;
  median: number;
}

export interface ScanPlay {
  id: number;
  title: string;
  artist: string;
  diff: string;
  mapper: string;
  stars: number | null;
  acc: number;
  mods: string[];
  combo: number;
  miss: number;
  at: number;
}

/** A play that just ended in tosu, kept until scores.db catches up. */
export interface FreshPlay extends ScanPlay {
  setId: number;
  bpm: number;
  ar: number;
  drainTime: number;
}

export interface MapEntry {
  id: number;
  setId: number;
  artist: string;
  title: string;
  diff: string;
  mapper: string;
  stars: number;
  ar: number;
  od: number;
  cs: number;
  bpm: number;
  drainTime: number;
  plays: number;
  bestAcc: number;
  lastAt: number;
}

export interface Percentiles {
  median: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
}

export interface Preferences {
  stars: Percentiles | null;
  bpm: Percentiles | null;
  ar: Percentiles | null;
  length: Percentiles | null;
  creators: { name: string; plays: number }[];
  artists: { name: string; plays: number }[];
  mods: { mod: string; plays: number }[];
}

export interface ProfileFact {
  at: number;
  playsTotal: number;
  avgAcc: number;
  medianAcc: number;
  comfortStar: number | null;
  comfortAcc: number;
  hardStar: number | null;
  hardAcc: number;
  pp: number | null;
}

export interface SkillProfile {
  accuracy: number;
  consistency: number;
  combo: number;
  speed: number | null;
  stamina: number | null;
  gap: number;
  missRate: number;
  zeroMiss: number;
  speedCut: number;
  staminaCut: number;
  speedN: number;
  staminaN: number;
  n: number;
}

export interface SegmentStat {
  cut: number;
  high: number | null;
  low: number | null;
  highN: number;
  lowN: number;
  delta: number | null;
}

export interface ScanResult {
  ok: boolean;
  error?: string;
  scannedAt: number;
  player: string;
  mapsTotal: number;
  playsTotal: number;
  uniqueMaps: number;
  avgAcc: number;
  medianAcc: number;
  comfortStar: number | null;
  comfortAcc: number | null;
  hardStar: number | null;
  hardAcc: number | null;
  playsAboveHard: number;
  playsWithStars: number;
  playsPerMap: number;
  skills: SkillProfile;
  segments: {
    ar: SegmentStat | null;
    cs: SegmentStat | null;
    bpm: SegmentStat | null;
    drain: SegmentStat | null;
  };
  preferences: Preferences;
  maps: MapEntry[];
  buckets: ScanBucket[];
  topRepeated: {
    title: string;
    artist: string;
    diff: string;
    stars: number | null;
    plays: number;
    bestAcc: number;
  }[];
  recent: ScanPlay[];
  daily: { day: string; plays: number; acc: number }[];
  hours: number[];
  playSeconds: number;
  uniqueArtists: number;
  uniqueCreators: number;
  activeDays: number;
  busiestDay: { day: string; plays: number } | null;
  bestPlay: {
    title: string;
    artist: string;
    diff: string;
    stars: number | null;
    acc: number;
    at: number;
  } | null;
}

export interface ApiScore {
  id: number;
  pp: number;
  acc: number;
  stars: number;
  mods: string[];
  rank: string;
  combo: number;
  miss: number;
  date: string;
  score: number;
  map: {
    id: number;
    setId: number;
    artist: string;
    title: string;
    version: string;
    cover: string;
  };
}

export interface ApiSnapshot {
  status: {
    configured: boolean;
    fetchedAt: number;
    error: string | null;
    user: string;
  };
  profile: {
    id: number;
    username: string;
    avatar: string;
    cover: string;
    country: string;
    pp: number;
    rank: number | null;
    countryRank: number | null;
    accuracy: number;
    playCount: number;
    playTime: number;
    level: number;
    maxCombo: number;
  } | null;
  best: ApiScore[];
  recent: ApiScore[];
  rankHistory: number[];
}

export type Device = 'mouse' | 'tablet' | 'touchpad' | 'unknown';
export type Theme = 'cover' | 'rose' | 'neon' | 'sunset' | 'night';
export type Tapping = 'single' | 'alternate' | 'two' | 'depends' | 'unknown';
export type Goal = 'accuracy' | 'pp' | 'consistency' | 'speed' | 'fun';
export type PlayStyle = 'jumps' | 'streams' | 'tech' | 'mixed' | 'unknown';
export type ModPref = 'nm' | 'hr' | 'dt' | 'hd' | 'other' | 'unknown';
export type Annoy = 'misses' | 'speed' | 'reading' | 'maps' | 'nothing' | 'unknown';
export type OverlayPos = 'tl' | 'tr' | 'bl' | 'br';

export interface Settings {
  user: string;
  demo: boolean;
  tosuPort: number;
  tosuPath: string;
  osuDir: string;
  apiClientId: string;
  apiClientSecret: string;
  onboarded: boolean;
  tutorialSeen: boolean;
  device: Device;
  tapping: Tapping;
  goal: Goal;
  dailyMinutes: number;
  style: PlayStyle;
  modPref: ModPref;
  music: string;
  annoy: Annoy;
  theme: Theme;
  overlay: boolean;
  overlayPos: OverlayPos;
}

export interface MapSuggestion {
  id: number;
  setId: number;
  artist: string;
  title: string;
  diff: string;
  mapper: string;
  stars: number;
  bpm: number;
  drainTime: number;
  ar: number;
  cs: number;
  od: number;
  cover: string;
  status: string;
  why?: string[];
}

export interface MapSearchParams {
  minStars: number;
  maxStars: number;
  bpmMin?: number;
  bpmMax?: number;
  target?: number;
  excludeSetIds?: number[];
  limit?: number;
  cursor?: string;
  force?: boolean;
}

export interface MapSearchResult {
  ok: boolean;
  error?: string;
  total: number;
  maps: MapSuggestion[];
  next?: string | null;
}

export interface DownloadResult {
  ok: boolean;
  path?: string;
  opened?: boolean;
  method?: string;
  error?: string;
}

export interface OpenMapResult {
  ok: boolean;
  method?: 'protocol' | 'spawn' | 'already' | 'manual';
  reason?: 'stable-ignored' | 'no-tosu' | 'not-running';
  title?: string;
  copied?: boolean;
  started?: boolean;
  osuRunning?: boolean;
  error?: string;
}

export interface TosuLaunchResult {
  ok: boolean;
  already?: boolean;
  up?: boolean;
  path?: string | null;
  notFound?: boolean;
  cancelled?: boolean;
  error?: string;
}

export interface ReplayAnalysis {
  player: string;
  at: number;
  mods: string[];
  score: number;
  maxCombo: number;
  perfect: boolean;
  counts: { n300: number; n100: number; n50: number; miss: number };
  accuracy: number;
  durationMs: number;
  taps: number;
  tapBpm: number;
  alternate: number;
  streams: number;
  maxBurst: number;
  maxJump: number;
  avgJump: number;
  bigJumps: number;
  gaps: { at: number; ms: number }[];
  timeline: { tapSeries: number[]; speedSeries: number[]; buckets: number; perMs: number };
  summary: { verdicts: string[]; tips: string[] };
}

export interface ReplayResult {
  ok: boolean;
  error: string | null;
  detail?: string | null;
  path: string;
  file?: string;
  analysis: ReplayAnalysis | null;
}

export interface Bootstrap {
  settings: Settings;
  live: LivePayload;
  scan: ScanResult | null;
  api: ApiSnapshot;
  tosu: { connected: boolean; port: number };
  history: ProfileFact[];
  paths: { osuDir: string; dataDir: string; envFile: string };
  version: string;
}

export interface Bridge {
  bootstrap: () => Promise<Bootstrap>;
  scan: () => Promise<ScanResult>;
  replayLatest: () => Promise<ReplayResult>;
  refreshApi: () => Promise<ApiSnapshot>;
  setSettings: (patch: Partial<Settings>) => Promise<Settings>;
  searchMaps: (params: MapSearchParams) => Promise<MapSearchResult>;
  installedSets: () => Promise<number[]>;
  openMap: (target: number | { id: number; title?: string }) => Promise<OpenMapResult>;
  coverData: (url: string) => Promise<string | null>;
  downloadMap: (setId: number) => Promise<DownloadResult>;
  launchTosu: () => Promise<TosuLaunchResult>;
  pickTosu: () => Promise<{ ok: boolean; path?: string; cancelled?: boolean }>;
  openExternal: (url: string) => Promise<unknown>;
  onLive: (cb: (payload: LivePayload) => void) => () => void;
  onData: (cb: (boot: Bootstrap) => void) => () => void;
  win: {
    min: () => void;
    max: () => void;
    full: () => void;
    close: () => void;
    onFull: (cb: (on: boolean) => void) => () => void;
    onFrame: (cb: (state: { maximized: boolean; fullscreen: boolean }) => void) => () => void;
  };
}
