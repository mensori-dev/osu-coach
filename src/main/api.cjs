'use strict';

const { readJson, writeJson } = require('./store.cjs');

const API = 'https://osu.ppy.sh';
const TTL = 10 * 60 * 1000;

function compactScore(score) {
  const bm = score.beatmap || {};
  const set = score.beatmapset || {};
  return {
    id: score.id,
    pp: score.pp ?? 0,
    acc: (score.accuracy ?? 0) * 100,
    stars: bm.difficulty_rating ?? 0,
    mods: score.mods || [],
    rank: score.rank || '',
    combo: score.max_combo ?? 0,
    miss: score.statistics?.miss ?? 0,
    date: score.created_at || '',
    score: score.score ?? 0,
    map: {
      id: bm.id,
      setId: set.id,
      artist: set.artist || '',
      title: set.title || '',
      version: bm.version || '',
      cover: set.covers?.list || set.covers?.card || '',
    },
  };
}

/**
 * The player's own taste, so a Russian/old-pop listener is not drowned in
 * Japanese anime farm maps just because osu! is full of them.
 * Inferred from the «что слушаешь» answer plus the artists they actually play.
 */
const LANGUAGE_RULES = [
  { lang: 'russian', words: ['русск', 'russian', 'рашн', 'по-русски', 'ру-музык'] },
  {
    lang: 'japanese',
    words: [
      'япон',
      'japan',
      'аниме',
      'anime',
      'jpop',
      'j-pop',
      'vocaloid',
      'вокалоид',
      'touhou',
      'тохо',
      'utau',
      'doujin',
      'kawaii',
    ],
  },
  { lang: 'english', words: ['англ', 'english', 'американ', 'american', 'западн', 'western', 'брит', 'british'] },
];
const GENRE_RULES = [
  { genre: 'pop', words: ['pop', 'поп'] },
  { genre: 'rock', words: ['rock', 'рок', 'панк', 'metalcore'] },
  {
    genre: 'electronic',
    words: ['electronic', 'электро', 'edm', 'techno', 'техно', 'dnb', 'drum and bass', 'house', 'synth'],
  },
  { genre: 'metal', words: ['metal', 'метал'] },
  { genre: 'hip hop', words: ['hip hop', 'hip-hop', 'rap', 'рэп', 'хип-хоп'] },
  { genre: 'classical', words: ['classical', 'классик', 'piano', 'пианино'] },
  { genre: 'jazz', words: ['jazz', 'джаз'] },
];
const ANIME_TAGS =
  /\b(anime|vocaloid|jpop|j-pop|touhou|utau|doujin|opening|visual novel|vtub|idol|j-rock|jrock|denpa)\b/;
// From the osu! API: English=2, Japanese=3, Russian=12.
const LANG_ID = { russian: 12, english: 2, japanese: 3 };

function hasCjk(name) {
  return /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/.test(name);
}

function hasCyrillic(name) {
  return /[а-яё]/i.test(name);
}

function isAnimeish(map) {
  if (map.languageId === LANG_ID.japanese) return true;
  return ANIME_TAGS.test(`${map.tags || ''} ${map.title || ''} ${map.artist || ''}`.toLowerCase());
}

function buildTaste(music, preferences) {
  const text = String(music || '').toLowerCase();
  const artists = [...new Set((preferences?.artists || []).map((item) => item.name).filter(Boolean))];
  const languages = [];
  const genres = [];

  for (const rule of LANGUAGE_RULES) {
    if (rule.words.some((word) => text.includes(word))) languages.push(rule.lang);
  }
  for (const rule of GENRE_RULES) {
    if (rule.words.some((word) => text.includes(word))) genres.push(rule.genre);
  }

  // What is in their headphones is also visible in what they already play.
  if (artists.some(hasCyrillic) && !languages.includes('russian')) languages.push('russian');
  if (artists.filter(hasCjk).length >= 2) languages.push('japanese');
  if (!languages.length) languages.push('english');

  const japanese = languages.includes('japanese');
  return { languages: [...new Set(languages)], genres, artists, avoidJapanese: !japanese };
}

/**
 * How close a candidate map is to the player's own taste.
 * Favourite mappers and artists weigh the most, then tempo, difficulty,
 * length and AR. No randomness: same data, same order.
 */
function tasteScore(map, preferences, target, taste) {
  if (!preferences) return 0;

  let score = 0;
  const creators = preferences.creators || [];
  const artists = preferences.artists || [];
  const maxCreator = creators[0]?.plays || 1;
  const maxArtist = artists[0]?.plays || 1;

  const creator = creators.find((item) => item.name.toLowerCase() === map.mapper.toLowerCase());
  if (creator) score += 34 + 26 * (creator.plays / maxCreator);

  const artist = artists.find((item) => item.name.toLowerCase() === map.artist.toLowerCase());
  if (artist) score += 30 + 24 * (artist.plays / maxArtist);

  const bpmMedian = preferences.bpm?.median;
  if (bpmMedian) score += 22 * Math.max(0, 1 - Math.abs(map.bpm - bpmMedian) / 45);

  if (target) score += 20 * Math.max(0, 1 - Math.abs(map.stars - target) / 1.2);

  const lengthMedian = preferences.length?.median;
  if (lengthMedian) score += 12 * Math.max(0, 1 - Math.abs(map.drainTime - lengthMedian) / 120);

  const arMedian = preferences.ar?.median;
  if (arMedian != null) score += 8 * Math.max(0, 1 - Math.abs(map.ar - arMedian) / 3);

  if (map.status === 'ranked' || map.status === 'approved') score += 4;

  if (taste) {
    if (taste.avoidJapanese) {
      if (map.languageId === LANG_ID.japanese) score -= 55;
      else if (isAnimeish(map)) score -= 24;
    }
    if (taste.languages.includes('russian') && map.languageId === LANG_ID.russian) score += 42;
    if (taste.languages.includes('english') && map.languageId === LANG_ID.english) score += 24;
    if (taste.artists.some((name) => name.toLowerCase() === map.artist.toLowerCase())) score += 20;
  }

  return score;
}

/**
 * Why this map fits the player's taste, as short human-readable reasons.
 */
function tasteReasons(map, preferences, target, taste) {
  const reasons = [];
  if (!preferences) return reasons;

  const creators = preferences.creators || [];
  const artists = preferences.artists || [];
  if (creators.some((item) => item.name.toLowerCase() === map.mapper.toLowerCase())) {
    reasons.push('любимый маппер');
  }
  if (artists.some((item) => item.name.toLowerCase() === map.artist.toLowerCase())) {
    reasons.push('любимый артист');
  }
  const bpmMedian = preferences.bpm?.median;
  if (bpmMedian && Math.abs(map.bpm - bpmMedian) <= 12) reasons.push('тот же темп');
  const lengthMedian = preferences.length?.median;
  if (lengthMedian && Math.abs(map.drainTime - lengthMedian) <= 30) reasons.push('такая же длина');
  if (target && Math.abs(map.stars - target) <= 0.35) reasons.push('твой уровень');

  if (taste) {
    if (map.languageId === LANG_ID.russian) reasons.push('русский трек');
    else if (map.languageId === LANG_ID.english) reasons.push('западный трек');
    else if (taste.avoidJapanese && isAnimeish(map)) reasons.push('похоже на аниме');
  }

  return reasons.slice(0, 3);
}

class OsuApi {
  constructor({ clientId, clientSecret, user, cacheFile }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.user = user;
    this.cacheFile = cacheFile;
    this.token = null;
    this.tokenExpires = 0;
    this.cache = readJson(cacheFile, null);
    this.loading = null;
    this.searchCache = new Map();
  }

  configured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  async getToken() {
    if (this.token && Date.now() < this.tokenExpires - 60000) return this.token;
    const res = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: Number(this.clientId),
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        scope: 'public',
      }),
    });
    if (!res.ok) throw new Error(`osu! token ${res.status}`);
    const json = await res.json();
    this.token = json.access_token;
    this.tokenExpires = Date.now() + (json.expires_in || 3600) * 1000;
    return this.token;
  }

  async request(pathname) {
    const token = await this.getToken();
    const res = await fetch(API + pathname, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`osu! api ${res.status} ${pathname}`);
    return res.json();
  }

  status() {
    return {
      configured: this.configured(),
      fetchedAt: this.cache?.fetchedAt || 0,
      error: this.cache?.error || null,
      user: this.user,
    };
  }

  async searchMaps({
    minStars = 0,
    maxStars = 10,
    bpmMin = 0,
    bpmMax = 1000,
    target = 0,
    excludeSetIds = [],
    limit = 24,
    cursor = '',
    force = false,
    preferences = null,
    music = '',
  } = {}) {
    if (!this.configured()) {
      return { ok: false, error: 'no credentials', total: 0, maps: [], next: null };
    }

    const taste = buildTaste(music, preferences);
    const creators = (preferences?.creators || []).slice(0, 2);
    const artists = (preferences?.artists || []).slice(0, 2);
    const prefKey = [
      creators[0]?.name || '',
      artists[0]?.name || '',
      taste.languages.join(','),
      taste.genres.join(','),
    ].join('|');

    const key = JSON.stringify([
      minStars,
      maxStars,
      bpmMin,
      bpmMax,
      target,
      limit,
      excludeSetIds.length,
      cursor,
      prefKey,
    ]);
    const cached = this.searchCache.get(key);
    if (!force && cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.value;

    const range = `stars>=${minStars} stars<=${maxStars} bpm>=${bpmMin} bpm<=${bpmMax}`;
    const queries = [range];

    // First page: also look directly at favourite mappers and artists,
    // so the list is about the player's taste, not just the global rating.
    if (!cursor) {
      for (const item of creators) {
        const name = String(item.name || '').replace(/"/g, '');
        if (name) queries.push(`creator="${name}" ${range}`);
      }
      for (const item of artists) {
        const name = String(item.name || '').replace(/"/g, '');
        if (name) queries.push(`artist="${name}" ${range}`);
      }
      // Pull real pools in the languages and genres the player asked for,
      // instead of relying on the anime-heavy global rating.
      for (const lang of taste.languages) queries.push(`language=${lang} ${range}`);
      for (const genre of taste.genres) queries.push(`genre=${genre} ${range}`);
    }

    const cursorPart = cursor ? `&cursor_string=${encodeURIComponent(cursor)}` : '';
    const responses = await Promise.all(
      queries.map((query) =>
        this.request(`/api/v2/beatmapsets/search?m=0&s=rating${cursorPart}&q=${encodeURIComponent(query)}`).catch(
          () => null,
        ),
      ),
    );

    const base = responses[0];
    if (!base) {
      const value = { ok: false, error: 'osu! api empty response', total: 0, maps: [], next: null };
      this.searchCache.set(key, { at: Date.now(), value });
      return value;
    }

    const excluded = new Set(excludeSetIds);
    const bySet = new Map();

    for (const data of responses) {
      for (const set of data?.beatmapsets || []) {
        if (excluded.has(set.id) || bySet.has(set.id)) continue;
        const diffs = (set.beatmaps || []).filter(
          (beatmap) =>
            beatmap.mode === 'osu' &&
            beatmap.difficulty_rating >= minStars &&
            beatmap.difficulty_rating <= maxStars &&
            beatmap.bpm >= bpmMin &&
            beatmap.bpm <= bpmMax,
        );
        if (!diffs.length) continue;
        const pick = diffs.reduce((best, beatmap) => {
          if (!best) return beatmap;
          return Math.abs(beatmap.difficulty_rating - target) < Math.abs(best.difficulty_rating - target)
            ? beatmap
            : best;
        }, null);
        bySet.set(set.id, {
          id: pick.id,
          setId: set.id,
          artist: set.artist || '',
          title: set.title || '',
          diff: pick.version || '',
          mapper: set.creator || '',
          stars: pick.difficulty_rating || 0,
          bpm: pick.bpm || 0,
          drainTime: pick.total_length || 0,
          ar: pick.ar ?? 0,
          cs: pick.cs ?? 0,
          od: pick.od ?? 0,
          cover: set.covers?.cover || set.covers?.list || set.covers?.card || '',
          status: set.status || '',
          languageId: set.language_id ?? null,
          genreId: set.genre_id ?? null,
          tags: set.tags || '',
        });
      }
    }

    const maps = [...bySet.values()].map((map) => ({
      map,
      score: tasteScore(map, preferences, target, taste),
    }));
    maps.sort((a, b) => b.score - a.score || Math.abs(a.map.stars - target) - Math.abs(b.map.stars - target));

    // Keep the list varied: no mapper or artist takes over the whole page.
    const picked = [];
    const perMapper = new Map();
    const perArtist = new Map();
    for (const entry of maps) {
      const mapper = entry.map.mapper.toLowerCase();
      const artist = entry.map.artist.toLowerCase();
      if ((perMapper.get(mapper) || 0) >= 2) continue;
      if ((perArtist.get(artist) || 0) >= 2) continue;
      perMapper.set(mapper, (perMapper.get(mapper) || 0) + 1);
      perArtist.set(artist, (perArtist.get(artist) || 0) + 1);
      picked.push({ ...entry.map, why: tasteReasons(entry.map, preferences, target, taste) });
      if (picked.length >= limit) break;
    }

    const value = {
      ok: true,
      total: base.total || maps.length,
      maps: picked,
      next: base.cursor_string || null,
    };
    this.searchCache.set(key, { at: Date.now(), value });
    return value;
  }

  snapshot() {
    if (!this.cache) return { status: this.status(), profile: null, best: [], recent: [], rankHistory: [] };
    return {
      status: { ...this.status(), fetchedAt: this.cache.fetchedAt, error: this.cache.error },
      profile: this.cache.profile || null,
      best: this.cache.best || [],
      recent: this.cache.recent || [],
      rankHistory: this.cache.rankHistory || [],
    };
  }

  async load(force = false) {
    if (!this.configured()) {
      this.cache = { fetchedAt: 0, error: 'no credentials', profile: null, best: [], recent: [], rankHistory: [] };
      return this.snapshot();
    }
    if (!force && this.cache?.fetchedAt && Date.now() - this.cache.fetchedAt < TTL) {
      return this.snapshot();
    }
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        const user = await this.request(`/api/v2/users/${encodeURIComponent(this.user)}/osu`);
        if (!user) throw new Error('user not found');
        const [best, recent] = await Promise.all([
          this.request(`/api/v2/users/${user.id}/scores/best?limit=100&mode=osu`).catch(() => []),
          this.request(`/api/v2/users/${user.id}/scores/recent?limit=50&mode=osu`).catch(() => []),
        ]);
        const stats = user.statistics || {};
        this.cache = {
          fetchedAt: Date.now(),
          error: null,
          profile: {
            id: user.id,
            username: user.username,
            avatar: user.avatar_url,
            cover: user.cover_url,
            country: user.country_code,
            pp: stats.pp ?? 0,
            rank: stats.global_rank ?? null,
            countryRank: stats.country_rank ?? null,
            accuracy: stats.hit_accuracy ?? 0,
            playCount: stats.play_count ?? 0,
            playTime: stats.play_time ?? 0,
            level: stats.level?.current ?? 0,
            maxCombo: stats.maximum_combo ?? 0,
          },
          best: (best || []).map(compactScore),
          recent: (recent || []).map(compactScore),
          rankHistory: (user.rank_history?.data || []).filter((v) => v != null).slice(-90),
        };
      } catch (err) {
        this.cache = {
          ...this.cache,
          fetchedAt: this.cache?.fetchedAt || 0,
          error: String(err.message || err),
        };
      }
      writeJson(this.cacheFile, this.cache);
      this.loading = null;
      return this.snapshot();
    })();

    return this.loading;
  }
}

module.exports = { OsuApi };
