'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * The «забег»: seven stages, all of them built from the player's own library
 * and their own comfort line, never from an absolute star number. A 7★ player
 * must not be sent to 3★ maps just because a table says so.
 *
 * Pass criteria also come from the player: accuracy above their own median and
 * a miss budget proportional to their own miss rate. No invented difficulty.
 */

const STAGES = 7;
const MAX_LENGTH = 210; // 3:30 — long enough to matter, short enough for one evening
const MIN_LENGTH = 55;
const MISS_CAP = 15;

// Star bands relative to the player's comfort line, and how much accuracy is
// added on top of their own median at that band.
const BANDS = [
  { lo: -1.0, hi: -0.3, familiar: true, acc: 0.2, miss: 0.4 },
  { lo: -0.55, hi: 0.05, familiar: true, acc: 0.5, miss: 0.45 },
  { lo: -0.2, hi: 0.3, familiar: true, acc: 0.8, miss: 0.5 },
  { lo: 0.0, hi: 0.5, familiar: false, acc: 1.1, miss: 0.55 },
  { lo: 0.3, hi: 0.75, familiar: false, acc: 1.4, miss: 0.6 },
  { lo: 0.5, hi: 1.0, familiar: false, acc: 1.7, miss: 0.65 },
  { lo: 0.6, hi: 1.2, familiar: false, acc: 2.0, miss: 0.7, fresh: true },
];

const round1 = (value) => Math.round(value * 10) / 10;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

function playable(map) {
  return Boolean(map && map.stars > 0 && map.drainTime >= MIN_LENGTH && map.drainTime <= MAX_LENGTH);
}

function stageNotes(map) {
  const bpm = map.bpm > 0 ? map.bpm : 160;
  return Math.max(80, Math.round(map.drainTime * (bpm / 60) * (0.5 + map.stars * 0.13)));
}

function mapOf(entry) {
  return {
    id: entry.id,
    setId: entry.setId,
    title: entry.title,
    artist: entry.artist,
    diff: entry.diff,
    mapper: entry.mapper || entry.creator || '',
    stars: round1(entry.stars),
    bpm: Math.round(entry.bpm || 0),
    drainTime: Math.round(entry.drainTime || 0),
    ar: entry.ar ?? 0,
    od: entry.od ?? 0,
  };
}

function scoreCandidate(map, center, familiar, last) {
  let score = Math.abs(map.stars - center) * 6 + Math.min(map.plays || 0, 12) * 0.25;
  if (familiar && !map.plays) score += 6;
  if (last) {
    if (map.artist && map.artist === last.artist) score += 5;
    if (map.mapper && map.mapper === last.mapper) score += 2;
  }
  return score;
}

function chooseStage(maps, band, used, last, comfort) {
  const center = comfort + (band.lo + band.hi) / 2;
  const pads = [0, 0.2, 0.45, 0.8, 1.4, 2.6];

  for (const pad of pads) {
    const lo = comfort + band.lo - pad;
    const hi = comfort + band.hi + pad;
    let pool = maps.filter(
      (map) =>
        playable(map) && !used.has('m' + map.id) && !used.has('s' + map.setId) && map.stars >= lo && map.stars <= hi,
    );
    if (band.familiar) {
      const known = pool.filter((map) => map.plays > 0);
      if (known.length) pool = known;
    }
    if (band.fresh) {
      const fresh = pool.filter((map) => !map.plays);
      if (fresh.length) pool = fresh;
    }
    if (pool.length) {
      return [...pool].sort(
        (a, b) => scoreCandidate(a, center, band.familiar, last) - scoreCandidate(b, center, band.familiar, last),
      )[0];
    }
  }

  const rest = maps.filter((map) => playable(map) && !used.has('m' + map.id) && !used.has('s' + map.setId));
  if (!rest.length) return null;
  return [...rest].sort((a, b) => scoreCandidate(a, center, false, last) - scoreCandidate(b, center, false, last))[0];
}

/**
 * Builds a fresh campaign. `newMap` is the one taste-matched map from the osu!
 * API for the final stage; when there is no network or no credentials the
 * campaign simply stays inside the library and says so.
 */
function build(scan, newMap) {
  const maps = Array.isArray(scan?.maps) ? scan.maps : [];
  const comfort = clamp(scan?.comfortStar ?? 3.5, 1.2, 8.5);
  const baseAcc = clamp(scan?.comfortAcc ?? scan?.medianAcc ?? 92, 80, 99);
  const missRate = clamp(scan?.skills?.missRate ?? 2, 0.05, 12);

  const used = new Set();
  const stages = [];
  let last = null;

  for (let i = 0; i < STAGES; i += 1) {
    const band = BANDS[i];
    let entry = null;

    if (i === STAGES - 1 && newMap && playable(newMap) && !used.has('s' + newMap.setId)) {
      entry = newMap;
    }
    if (!entry) entry = chooseStage(maps, band, used, last, comfort);
    if (!entry) break;

    used.add('m' + entry.id);
    used.add('s' + entry.setId);
    last = entry;

    const map = mapOf(entry);
    const notes = stageNotes(map);
    const targetAcc = clamp(round1(baseAcc + band.acc), 86, 98.5);
    const maxMiss = clamp(Math.round(((notes * missRate) / 100) * band.miss), i < 2 ? 1 : 0, MISS_CAP);

    stages.push({
      index: stages.length + 1,
      map,
      source: i === STAGES - 1 && newMap && entry.id === newMap.id ? 'new' : 'library',
      targetAcc,
      maxMiss,
      notes,
      attempts: [],
      best: null,
      passed: false,
      passedAt: null,
    });
  }

  return {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    comfortStar: round1(comfort),
    baseAcc: round1(baseAcc),
    missRate: Math.round(missRate * 100) / 100,
    stages,
    records: {},
    recordsSeeded: false,
  };
}

function sameAttempt(stage, play) {
  return stage.attempts.some((item) => Math.abs(item.at - play.at) < 2000 && Math.abs(item.acc - play.acc) < 0.05);
}

function judge(stage, play) {
  return play.acc >= stage.targetAcc && play.miss <= stage.maxMiss;
}

/**
 * Pulls every new play of every stage map out of a fresh scan. Called after
 * each scores.db rescan, so a stage ticks itself off without a button.
 */
function sync(state, scan) {
  if (!state?.stages?.length || !scan?.recent) return { changed: false, records: [] };
  let changed = false;
  const now = Date.now();

  for (const stage of state.stages) {
    const plays = scan.recent.filter(
      (play) => play.id === stage.map.id && play.at > (state.createdAt || 0) - 1000 && play.acc > 0,
    );
    for (const play of plays) {
      if (sameAttempt(stage, play)) continue;
      const attempt = {
        at: play.at,
        acc: Math.round(play.acc * 100) / 100,
        miss: play.miss,
        passed: judge(stage, play),
      };
      stage.attempts.push(attempt);
      if (stage.attempts.length > 40) stage.attempts = stage.attempts.slice(-40);
      if (!stage.best || attempt.acc > stage.best.acc) stage.best = { ...attempt };
      if (attempt.passed && !stage.passed) {
        stage.passed = true;
        stage.passedAt = play.at;
      }
      changed = true;
    }
  }

  // Personal records: any map whose best accuracy moved up since the last scan.
  const records = [];
  if (Array.isArray(scan.maps)) {
    if (!state.records || typeof state.records !== 'object') state.records = {};
    for (const map of scan.maps) {
      if (!map.plays || !map.bestAcc) continue;
      const known = state.records[map.id];
      if (known == null) {
        state.records[map.id] = Math.round(map.bestAcc * 100) / 100;
        continue;
      }
      if (map.bestAcc > known + 0.005) {
        records.push({
          mapId: map.id,
          title: map.title,
          diff: map.diff,
          artist: map.artist,
          acc: Math.round(map.bestAcc * 100) / 100,
          prev: known,
          at: now,
        });
        state.records[map.id] = Math.round(map.bestAcc * 100) / 100;
        changed = true;
      }
    }
    state.recordsSeeded = true;
  }

  if (changed) state.updatedAt = now;
  return { changed, records };
}

function progress(state) {
  const stages = state?.stages || [];
  const done = stages.filter((stage) => stage.passed).length;
  return { done, total: stages.length };
}

/** The renderer gets a plain copy; no file paths, nothing machine-specific. */
function view(state) {
  if (!state?.stages?.length) return null;
  return {
    ...state,
    progress: progress(state),
  };
}

class CampaignStore {
  constructor(file) {
    this.file = file;
    this.state = null;
  }

  load() {
    if (this.state) return this.state;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw?.stages?.length) this.state = raw;
    } catch {
      // no campaign yet
    }
    return this.state;
  }

  save(state) {
    this.state = state;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(state, null, 2));
    } catch {
      // a broken write must not take the app down
    }
    return state;
  }

  reset() {
    this.state = null;
    try {
      fs.unlinkSync(this.file);
    } catch {
      // already gone
    }
  }
}

module.exports = { CampaignStore, build, sync, view, progress, stageNotes, MAX_LENGTH };
