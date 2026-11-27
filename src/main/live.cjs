'use strict';

function normMods(mods) {
  if (!mods) return [];
  const list = Array.isArray(mods) ? mods : Array.isArray(mods.array) ? mods.array : null;
  if (list) {
    return list.map((m) => (typeof m === 'string' ? m : m?.acronym || m?.name)).filter(Boolean);
  }
  if (typeof mods.name === 'string' && mods.name) {
    return mods.name.split(/(?=[A-Z])/).filter(Boolean);
  }
  return [];
}

function idlePayload(connected, port) {
  return {
    source: 'tosu',
    connected: Boolean(connected),
    state: 'idle',
    updatedAt: Date.now(),
    player: null,
    beatmap: null,
    play: null,
    hitErrors: [],
    keys: null,
    cover: null,
    tosu: { connected: Boolean(connected), port: port ?? 24050 },
  };
}

function normalizeTosu(raw, hitErrors, keys, port) {
  if (!raw) return idlePayload(false, port);

  const stateName = raw.state?.name || 'menu';
  const isPlay = stateName === 'play';
  const isResults = stateName === 'resultScreen';
  const beatmap = raw.beatmap;
  const play = raw.play;
  const stats = beatmap?.stats;
  const time = beatmap?.time;

  const totalMs = time ? Math.max(0, (time.lastObject || 0) - (time.firstObject || 0)) : 0;
  const elapsed = time?.live || 0;
  const progress = totalMs > 0 ? Math.min(1, Math.max(0, (elapsed - (time.firstObject || 0)) / totalMs)) : 0;

  const hits = play?.hits || {};
  const player = raw.profile
    ? {
        name: raw.profile.name,
        id: raw.profile.id,
        pp: raw.profile.pp,
        rank: raw.profile.globalRank,
        accuracy: raw.profile.accuracy,
        playCount: raw.profile.playCount,
      }
    : null;

  const map = beatmap
    ? {
        id: beatmap.id,
        setId: beatmap.set,
        artist: beatmap.artistUnicode || beatmap.artist,
        title: beatmap.titleUnicode || beatmap.title,
        version: beatmap.version,
        mapper: beatmap.mapper,
        stars: stats?.stars?.total ?? stats?.stars?.live ?? 0,
        ar: stats?.ar?.converted ?? stats?.ar?.original ?? 0,
        od: stats?.od?.converted ?? stats?.od?.original ?? 0,
        cs: stats?.cs?.converted ?? stats?.cs?.original ?? 0,
        hp: stats?.hp?.converted ?? stats?.hp?.original ?? 0,
        bpm: stats?.bpm?.common ?? stats?.bpm?.realtime ?? 0,
        maxCombo: stats?.maxCombo ?? 0,
        objects: stats?.objects?.total ?? 0,
        lengthMs: totalMs,
        kiai: Boolean(beatmap.isKiai),
        mode: beatmap.mode?.name ?? 'osu',
        status: beatmap.status?.number ?? 0,
      }
    : null;

  let uiState = 'menu';
  if (isPlay) uiState = raw.game?.paused ? 'paused' : 'playing';
  else if (isResults) uiState = 'results';
  else if (stateName === 'menu' || stateName === 'selectPlay' || stateName === 'songSelect') uiState = 'menu';

  return {
    source: 'tosu',
    connected: true,
    state: uiState,
    updatedAt: Date.now(),
    player,
    beatmap: map,
    play:
      play && map
        ? {
            score: play.score || 0,
            accuracy: play.accuracy ?? 100,
            combo: play.combo?.current ?? 0,
            maxCombo: play.combo?.max ?? 0,
            hits: {
              300: hits['300'] ?? 0,
              100: hits['100'] ?? 0,
              50: hits['50'] ?? 0,
              miss: hits['0'] ?? 0,
              geki: hits.geki ?? 0,
              katu: hits.katu ?? 0,
            },
            pp: {
              current: play.pp?.current ?? 0,
              fc: play.pp?.fc ?? 0,
              max: play.pp?.maxAchievable ?? 0,
            },
            mods: normMods(play.mods),
            rank: play.rank?.current ?? '',
            failed: Boolean(play.failed),
            progress,
            elapsedMs: elapsed,
            totalMs,
            ur: play.unstableRate ?? 0,
          }
        : null,
    hitErrors: (hitErrors || []).slice(-500),
    keys: keys
      ? {
          k1: keys.k1?.isPressed,
          k2: keys.k2?.isPressed,
          m1: keys.m1?.isPressed,
          m2: keys.m2?.isPressed,
        }
      : null,
    cover: map?.id ? `http://127.0.0.1:${port}/files/beatmap/background` : null,
    tosu: { connected: true, port },
  };
}

module.exports = { normalizeTosu, idlePayload, normMods };
