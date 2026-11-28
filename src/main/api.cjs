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

/**
 * The osu! search endpoint only understands `status=`, star/bpm ranges, artist,
 * creator and plain text. `genre=` and `language=` are parsed as ordinary
 * words, so «genre=metal» finds a track called Metal Pipe. Real genre and
 * language filtering has to happen on our side, using the ids every beatmapset
 * already carries.
 */
function normalizeFilters(filters) {
  const ids = (value, max) =>
    Array.isArray(value)
      ? value
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item) && item > 0)
          .slice(0, max)
      : [];
  const names = (value) =>
    Array.isArray(value)
      ? value
          .map((item) =>
            String(item || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean)
          .slice(0, 60)
      : [];
  return {
    genres: ids(filters?.genres, 12),
    languages: ids(filters?.languages, 12),
    rankedOnly: Boolean(filters?.rankedOnly),
    hideArtists: names(filters?.hideArtists),
    hideMappers: names(filters?.hideMappers),
  };
}

function hasCjk(name) {
  return /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/.test(name);
}

function hasCyrillic(name) {
  return /[а-яё]/i.test(name);
}

function isAnimeish(map) {
  if (map.languageId === LANG_ID.japanese) return true;
  const uni = `${map.artistUnicode || ''} ${map.titleUnicode || ''}`;
  if (hasCjk(uni)) return true;
  if (hasCjk(`${map.artist || ''} ${map.title || ''}`)) return true;
  return ANIME_TAGS.test(`${map.tags || ''} ${map.title || ''} ${map.artist || ''}`.toLowerCase());
}

function buildTaste(music, preferences) {
  const text = String(music || '').toLowerCase();
  const artists = [...new Set((preferences?.artists || []).map((item) => item.name).filter(Boolean))];
  const top = artists.slice(0, 5);
  const cjkShare = top.length >= 3 ? top.filter(hasCjk).length / top.length : 0;
  const cyrShare = top.length ? top.filter(hasCyrillic).length / top.length : 0;
  const languages = [];
  const genres = [];

  for (const rule of LANGUAGE_RULES) {
    if (rule.words.some((word) => text.includes(word))) languages.push(rule.lang);
  }
  for (const rule of GENRE_RULES) {
    if (rule.words.some((word) => text.includes(word))) genres.push(rule.genre);
  }

  // Japanese is only assumed when it is actually a majority of what the player
  // plays. Two CJK artists in a top-5 is normal for any osu! library and used
  // to switch the anime filter off for everyone — that is how a Capsize listener
  // ended up with vocaloid farm maps.
  if (!languages.includes('japanese') && cjkShare >= 0.5) languages.push('japanese');
  if (!languages.includes('russian') && cyrShare >= 0.35) languages.push('russian');
  if (!languages.length) languages.push('english');

  const japanese = languages.includes('japanese');
  return {
    languages: [...new Set(languages)],
    genres,
    artists,
    cjkShare,
    avoidJapanese: !japanese,
  };
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

  // Artist and mapper are the strongest signals of taste: they are what the
  // player actually chose to listen to and play, not what the global rating
  // happened to push.
  const creator = creators.find((item) => item.name.toLowerCase() === map.mapper.toLowerCase());
  if (creator) score += 40 + 20 * (creator.plays / maxCreator);

  const artist = artists.find((item) => item.name.toLowerCase() === map.artist.toLowerCase());
  if (artist) score += 58 + 26 * (artist.plays / maxArtist);

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
      if (map.languageId === LANG_ID.japanese) score -= 90;
      if (isAnimeish(map)) score -= 45;
    }
    if (taste.languages.includes('russian') && map.languageId === LANG_ID.russian) score += 46;
    if (taste.languages.includes('english') && map.languageId === LANG_ID.english) score += 20;
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
  const creator = creators.find((item) => item.name.toLowerCase() === map.mapper.toLowerCase());
  const artist = artists.find((item) => item.name.toLowerCase() === map.artist.toLowerCase());
  if (artist) reasons.push(`твой артист · ${artist.plays} ${artist.plays === 1 ? 'плей' : 'плеев'}`);
  if (creator) reasons.push(`твой маппер · ${creator.plays} ${creator.plays === 1 ? 'плей' : 'плеев'}`);
  const bpmMedian = preferences.bpm?.median;
  if (bpmMedian && Math.abs(map.bpm - bpmMedian) <= 12) reasons.push('тот же темп');
  const lengthMedian = preferences.length?.median;
  if (lengthMedian && Math.abs(map.drainTime - lengthMedian) <= 30) reasons.push('такая же длина');
  if (target && Math.abs(map.stars - target) <= 0.35) reasons.push('твой уровень');

  if (taste) {
    if (map.languageId === LANG_ID.russian) reasons.push('русский трек');
    else if (map.languageId === LANG_ID.english) reasons.push('западный трек');
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
    filters = null,
  } = {}) {
    if (!this.configured()) {
      return { ok: false, error: 'no credentials', total: 0, maps: [], next: null };
    }

    const wanted = normalizeFilters(filters);
    const hideArtists = new Set(wanted.hideArtists);
    const hideMappers = new Set(wanted.hideMappers);
    // Genre, language and ranked-only are handled by the osu! search endpoint
    // itself. Only the hide lists need filtering on our side.
    const needsFiltering = hideArtists.size > 0 || hideMappers.size > 0;

    const taste = buildTaste(music, preferences);
    // An explicit anime/japanese choice overrides the «not your genre» guard.
    const explicitAnime = wanted.genres.includes(3) || wanted.languages.includes(3);
    const avoidJapanese = taste.avoidJapanese && !explicitAnime;
    const scoringTaste = avoidJapanese === taste.avoidJapanese ? taste : { ...taste, avoidJapanese };

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
      wanted.genres,
      wanted.languages,
      wanted.rankedOnly,
      wanted.hideArtists,
      wanted.hideMappers,
    ]);
    const cached = this.searchCache.get(key);
    if (!force && cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.value;

    const range = `stars>=${minStars} stars<=${maxStars} bpm>=${bpmMin} bpm<=${bpmMax}${
      wanted.rankedOnly ? ' status=ranked' : ''
    }`;

    // Genre and language *are* real filters in the osu! search endpoint, but as
    // the `g=` and `l=` query params — not as `genre=`/`language=` words inside
    // `q=` (those are read as plain text). One request per combination.
    const combos = [];
    if (wanted.genres.length && wanted.languages.length) {
      for (const genre of wanted.genres.slice(0, 3)) {
        for (const language of wanted.languages.slice(0, 3)) combos.push({ g: genre, l: language });
      }
    } else if (wanted.genres.length) {
      for (const genre of wanted.genres) combos.push({ g: genre });
    } else if (wanted.languages.length) {
      for (const language of wanted.languages) combos.push({ l: language });
    }

    const queries = combos.length
      ? combos.slice(0, 6).map((combo) => ({ query: range, ...combo }))
      : [{ query: range }];

    // First page: also look directly at favourite mappers and artists,
    // so the list is about the player's taste, not just the global rating.
    if (!cursor && !combos.length) {
      for (const item of creators) {
        const name = String(item.name || '').replace(/"/g, '');
        if (name) queries.push({ query: `creator="${name}" ${range}` });
      }
      for (const item of artists) {
        const name = String(item.name || '').replace(/"/g, '');
        if (name) queries.push({ query: `artist="${name}" ${range}` });
      }
    }

    const url = (item, pageCursor) =>
      `/api/v2/beatmapsets/search?m=0&s=rating&q=${encodeURIComponent(item.query)}${
        item.g ? `&g=${item.g}` : ''
      }${item.l ? `&l=${item.l}` : ''}${pageCursor ? `&cursor_string=${encodeURIComponent(pageCursor)}` : ''}`;

    const responses = await Promise.all(queries.map((item) => this.request(url(item, cursor)).catch(() => null)));

    const base = responses[0];
    if (!base) {
      const value = { ok: false, error: 'osu! api empty response', total: 0, maps: [], next: null };
      this.searchCache.set(key, { at: Date.now(), value });
      return value;
    }

    const excluded = new Set(excludeSetIds);
    const bySet = new Map();

    const addSets = (data) => {
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
          artistUnicode: set.artist_unicode || '',
          titleUnicode: set.title_unicode || '',
          tags: set.tags || '',
        });
      }
    };

    for (const data of responses) addSets(data);

    const rankedStatus = new Set(['ranked', 'approved', 'qualified']);
    const keep = (map) => {
      if (wanted.genres.length && !wanted.genres.includes(Number(map.genreId))) return false;
      if (wanted.languages.length && !wanted.languages.includes(Number(map.languageId))) return false;
      if (wanted.rankedOnly && !rankedStatus.has(map.status)) return false;
      if (hideArtists.has(String(map.artist || '').toLowerCase())) return false;
      if (hideMappers.has(String(map.mapper || '').toLowerCase())) return false;
      return true;
    };
    const passing = () => {
      let count = 0;
      for (const map of bySet.values()) if (keep(map)) count += 1;
      return count;
    };

    // Hiding an artist or mapper is our own filter, so pull a couple of extra
    // pages when the current pool thins out.
    let pageCursor = base.cursor_string || '';
    let pages = 0;
    while (needsFiltering && passing() < limit * 2 && pageCursor && pages < 3) {
      const more = await this.request(url(queries[0], pageCursor)).catch(() => null);
      if (!more) break;
      addSets(more);
      pageCursor = more.cursor_string || '';
      pages += 1;
    }

    const maps = [...bySet.values()]
      .filter(keep)
      .map((map) => ({ map, score: tasteScore(map, preferences, target, scoringTaste) }))
      .sort((a, b) => b.score - a.score || Math.abs(a.map.stars - target) - Math.abs(b.map.stars - target));

    // When the player is not into Japanese music, anime/doujin maps never take
    // the main list. If there is not enough else, they go to a separate
    // «ближайшее» block, honestly labelled, instead of quietly filling the page.
    const anime = maps.filter((entry) => isAnimeish(entry.map));
    const mainPool = avoidJapanese ? maps.filter((entry) => !isAnimeish(entry.map)) : maps;

    const pickFrom = (pool, max) => {
      const picked = [];
      const perMapper = new Map();
      const perArtist = new Map();
      const seen = new Set();
      for (const entry of pool) {
        if (seen.has(entry.map.setId)) continue;
        const mapper = entry.map.mapper.toLowerCase();
        const artist = entry.map.artist.toLowerCase();
        if ((perMapper.get(mapper) || 0) >= 2) continue;
        if ((perArtist.get(artist) || 0) >= 2) continue;
        perMapper.set(mapper, (perMapper.get(mapper) || 0) + 1);
        perArtist.set(artist, (perArtist.get(artist) || 0) + 1);
        seen.add(entry.map.setId);
        picked.push(entry.map);
        if (picked.length >= max) break;
      }
      return picked;
    };

    const main = pickFrom(mainPool, limit).map((map) => ({
      ...map,
      why: tasteReasons(map, preferences, target, taste),
    }));

    const fallback = avoidJapanese
      ? pickFrom(anime, 6).map((map) => ({
          ...map,
          why: ['не твой жанр', 'ближайшее из остального'],
        }))
      : [];

    const value = {
      ok: true,
      // With several genre/language combos the total is the sum of the pools.
      total: responses.reduce((sum, data) => sum + (data?.total || 0), 0) || maps.length,
      maps: main,
      fallback,
      next: base.cursor_string || null,
    };
    this.searchCache.set(key, { at: Date.now(), value });
    return value;
  }

  /**
   * Plain text search over osu! beatmapsets: «Capsize», «tigah woods», a mapper.
   * The fastest way to stop arguing with recommendations — type what you want.
   */
  async quickSearch(text, { limit = 20, target = 0, excludeSetIds = [], cursor = '', rankedOnly = false } = {}) {
    if (!this.configured()) return { ok: false, error: 'no credentials', maps: [], total: 0, next: null };
    const query = String(text || '')
      .trim()
      .slice(0, 80);
    if (query.length < 2) return { ok: true, maps: [], total: 0, next: null };

    const key = `q:${query.toLowerCase()}:${limit}:${Math.round(target * 10)}:${cursor}:${rankedOnly ? 1 : 0}`;
    const cached = this.searchCache.get(key);
    if (cached && Date.now() - cached.at < 2 * 60 * 1000) return cached.value;

    try {
      // `status=ranked` is one of the few filters the osu! search endpoint does
      // understand, unlike genre/language.
      const text2 = rankedOnly ? `${query} status=ranked` : query;
      const data = await this.request(
        `/api/v2/beatmapsets/search?m=0&s=any&q=${encodeURIComponent(text2)}${
          cursor ? `&cursor_string=${encodeURIComponent(cursor)}` : ''
        }`,
      );
      const excluded = new Set(excludeSetIds);
      const maps = [];
      for (const set of data?.beatmapsets || []) {
        if (excluded.has(set.id)) continue;
        const diffs = (set.beatmaps || []).filter((beatmap) => beatmap.mode === 'osu');
        if (!diffs.length) continue;
        const pick = diffs.reduce((best, beatmap) => {
          if (!best) return beatmap;
          return Math.abs(beatmap.difficulty_rating - target) < Math.abs(best.difficulty_rating - target)
            ? beatmap
            : best;
        }, null);
        maps.push({
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
          genreId: set.genre_id ?? null,
          languageId: set.language_id ?? null,
          why: [],
        });
        if (maps.length >= limit) break;
      }
      const value = {
        ok: true,
        maps,
        total: data?.total || maps.length,
        next: data?.cursor_string || null,
      };
      this.searchCache.set(key, { at: Date.now(), value });
      return value;
    } catch (err) {
      return { ok: false, error: String(err.message || err), maps: [], total: 0, next: null };
    }
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
