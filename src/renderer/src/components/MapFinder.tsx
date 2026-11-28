import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Bootstrap, MapEntry, MapFilters, MapSearchResult, MapSuggestion } from '../types';
import { bridge, useNow } from '../hooks';
import { fmtInt, fmtNum, fmtTime, plural } from '../utils';
import {
  IconArrowRight,
  IconClose,
  IconDownload,
  IconExternal,
  IconGear,
  IconRefresh,
  IconSearch,
  IconSpark,
  IconStar,
} from './Icons';
import { PreviewButton } from './Preview';
import { openInOsu } from '../openMap';

interface Props {
  boot: Bootstrap;
  onScan: () => void;
  liveMapId?: number;
}

function similarity(map: MapEntry, seed: MapEntry): number {
  let score = 0;
  score -= Math.abs(map.stars - seed.stars) * 5;
  score -= Math.abs(map.bpm - seed.bpm) / 45;
  score -= Math.abs(map.ar - seed.ar) * 1.4;
  score -= Math.abs(map.drainTime - seed.drainTime) / 70;
  if (map.mapper && map.mapper === seed.mapper) score += 3;
  if (map.artist === seed.artist) score += 2;
  if (map.plays === 0) score += 1.2;
  return score;
}

function matchReasons(map: MapEntry, seed: MapEntry): string[] {
  const out: string[] = [];
  if (Math.abs(map.stars - seed.stars) <= 0.35) out.push(`та же сложность ${fmtNum(map.stars, 1)}★`);
  if (Math.abs(map.bpm - seed.bpm) <= 12) out.push(`похожий темп ${Math.round(map.bpm)} BPM`);
  if (map.mapper && map.mapper === seed.mapper) out.push('тот же маппер');
  if (map.artist === seed.artist) out.push('тот же артист');
  if (map.plays === 0) out.push('ещё не играл');
  return out.slice(0, 3);
}

function daysAgo(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн. назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  return `${Math.floor(days / 30)} мес. назад`;
}

// osu! genre and language ids, straight from the beatmapset payload.
const GENRE_CHIPS = [
  { id: 7, label: 'электроника' },
  { id: 5, label: 'рок' },
  { id: 4, label: 'поп' },
  { id: 6, label: 'хип-хоп' },
  { id: 8, label: 'метал' },
  { id: 9, label: 'классика' },
  { id: 10, label: 'фолк' },
  { id: 11, label: 'джаз' },
  { id: 3, label: 'аниме' },
  { id: 2, label: 'игровая' },
  { id: 12, label: 'новинки' },
];

const LANGUAGE_CHIPS = [
  { id: 5, label: 'инструментал' },
  { id: 2, label: 'английский' },
  { id: 12, label: 'русский' },
  { id: 3, label: 'японский' },
];

const STAR_MODES = [
  { id: 'comfort', label: 'мой уровень' },
  { id: 'hard', label: 'чуть выше' },
  { id: 'wide', label: 'пошире' },
] as const;

type StarMode = (typeof STAR_MODES)[number]['id'];

const EMPTY_FILTERS: MapFilters = {
  genres: [],
  languages: [],
  rankedOnly: false,
  hideArtists: [],
  hideMappers: [],
};

function statusChip(status: string): { text: string; tone: string } | null {
  const value = String(status || '').toLowerCase();
  if (value === 'ranked' || value === 'approved') return { text: 'ранкед', tone: 'ok' };
  if (value === 'qualified') return { text: 'квалифай', tone: 'mid' };
  if (value === 'loved') return { text: 'лавд', tone: 'loved' };
  if (value === 'pending') return { text: 'на модерации', tone: 'dim' };
  if (value === 'wip') return { text: 'в работе', tone: 'dim' };
  if (!value) return null;
  return { text: 'не ранкед', tone: 'dim' };
}

function MapRow({
  map,
  reasons,
  note,
  onOpen,
}: {
  map: MapEntry;
  reasons: string[];
  note?: string;
  onOpen: () => void;
}) {
  return (
    <div className="map-row">
      <div className="map-main">
        <div className="map-line">
          <b>{map.title}</b>
          <span className="map-diff-inline">[{map.diff}]</span>
        </div>
        <div className="map-sub">
          {map.artist}
          {map.mapper ? ` · ${map.mapper}` : ''}
          {note ? ` · ${note}` : ''}
        </div>
        <div className="map-chips">
          {reasons.map((reason) => (
            <span className="map-chip" key={reason}>
              {reason}
            </span>
          ))}
        </div>
      </div>

      <div className="map-facts">
        <span className="map-star">
          <IconStar size={11} /> {fmtNum(map.stars, 2)}
        </span>
        <span>{Math.round(map.bpm)} BPM</span>
        <span>{fmtTime(map.drainTime * 1000)}</span>
        <span>AR {fmtNum(map.ar, 1)}</span>
      </div>

      <PreviewButton setId={map.setId} className="online-preview" size={12} />
      <button className="btn ghost map-go" onClick={onOpen} title="Карта уже в osu! — открыть её">
        <IconArrowRight size={14} /> в osu!
      </button>
    </div>
  );
}

function OnlineRow({
  map,
  downloading,
  downloaded,
  installed,
  onDownload,
  onOpen,
  onHide,
  hideOpen,
  onHideToggle,
}: {
  map: MapSuggestion;
  downloading: boolean;
  downloaded: boolean;
  installed: boolean;
  onDownload: () => void;
  onOpen: () => void;
  onHide?: (kind: 'artist' | 'mapper') => void;
  hideOpen?: boolean;
  onHideToggle?: () => void;
}) {
  const status = statusChip(map.status);
  return (
    <div className="online-row">
      <div className="online-cover">
        {map.cover ? <img src={map.cover} alt="" loading="lazy" /> : <span>osu!</span>}
      </div>

      <div className="map-main">
        <div className="map-line">
          <b>{map.title}</b>
          <span className="map-diff-inline">[{map.diff}]</span>
        </div>
        <div className="map-sub">
          {map.artist} · {map.mapper}
        </div>
        <div className="map-chips">
          <span className="map-chip online-chip">{downloaded ? 'скачана' : installed ? 'уже в osu!' : 'не играл'}</span>
          {status && <span className={'map-chip map-status ' + status.tone}>{status.text}</span>}
          {map.why?.slice(0, 2).map((reason) => (
            <span className="map-chip" key={reason}>
              {reason}
            </span>
          ))}
        </div>
      </div>

      <div className="map-facts">
        <span className="map-star">
          <IconStar size={11} /> {fmtNum(map.stars, 2)}
        </span>
        <span>{Math.round(map.bpm)} BPM</span>
        <span>{fmtTime(map.drainTime * 1000)}</span>
      </div>

      <div className="online-actions">
        <PreviewButton setId={map.setId} className="online-preview" size={12} />
        {downloaded || installed ? (
          <button className="btn ghost online-dl online-open" onClick={onOpen}>
            <IconArrowRight size={14} /> в osu!
          </button>
        ) : (
          <button className="btn ghost online-dl" onClick={onDownload} disabled={downloading}>
            <IconDownload size={14} /> {downloading ? 'качаю…' : 'скачать'}
          </button>
        )}
        {onHide && (
          <div className="map-hide-wrap">
            <button
              className="map-hide"
              title="больше не предлагать"
              aria-label="больше не предлагать"
              onClick={onHideToggle}
            >
              <IconClose size={11} />
            </button>
            {hideOpen && (
              <div className="map-hide-menu">
                <button onClick={() => onHide('artist')}>
                  скрыть артиста <span>{map.artist}</span>
                </button>
                <button onClick={() => onHide('mapper')}>
                  скрыть маппера <span>{map.mapper}</span>
                </button>
              </div>
            )}
          </div>
        )}
        <button
          className="map-open"
          title="Открыть страницу карты"
          onClick={() => bridge.openExternal(`https://osu.ppy.sh/beatmapsets/${map.setId}`)}
        >
          <IconExternal size={14} />
        </button>
      </div>
    </div>
  );
}

export function MapFinder({ boot, onScan, liveMapId = 0 }: Props) {
  const scan = boot.scan;
  const [onlyNew, setOnlyNew] = useState(true);
  const [online, setOnline] = useState<MapSearchResult | null>(null);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [cursor, setCursor] = useState('');
  const [cursorDepth, setCursorDepth] = useState(0);
  const [downloadId, setDownloadId] = useState(0);
  const [downloaded, setDownloaded] = useState<number[]>([]);
  const [installedSets, setInstalledSets] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MapSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [rankedOnly, setRankedOnly] = useState(false);
  const [searchMore, setSearchMore] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(() => ({ ...EMPTY_FILTERS, ...boot.settings.mapFilters }));
  const [showFilters, setShowFilters] = useState(false);
  const [starMode, setStarMode] = useState<StarMode>('comfort');
  const [hideFor, setHideFor] = useState(0);
  const now = useNow(60_000);
  const maps = useMemo(() => scan?.maps ?? [], [scan]);

  // Filters are a player preference, not a per-session whim: remember them.
  useEffect(() => {
    bridge.setSettings({ mapFilters: filters }).catch(() => {});
  }, [filters]);

  const refreshInstalled = useCallback(() => {
    bridge
      .installedSets()
      .then(setInstalledSets)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    bridge
      .installedSets()
      .then((ids) => {
        if (alive) setInstalledSets(ids);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const installed = useMemo(() => new Set(installedSets), [installedSets]);

  const byId = useMemo(() => new Map(maps.map((map) => [map.id, map])), [maps]);

  const seed = useMemo(() => {
    const fromLive = liveMapId ? byId.get(liveMapId) : undefined;
    if (fromLive) return fromLive;
    const fromRecent = scan?.recent?.map((item) => byId.get(item.id)).find(Boolean);
    return fromRecent ?? null;
  }, [byId, liveMapId, scan?.recent]);

  const playedCount = useMemo(() => maps.filter((map) => map.plays > 0).length, [maps]);
  const comfort = scan?.comfortStar ?? 3.5;

  const searchValue = query.trim();
  const searchingNow = searchValue.length >= 2;

  useEffect(() => {
    if (!searchingNow) return;
    let alive = true;
    const id = window.setTimeout(() => {
      setSearching(true);
      bridge
        .quickSearch({
          text: searchValue,
          limit: 50,
          target: Math.round((comfort + 0.35) * 10) / 10,
          rankedOnly,
        })
        .then((value) => {
          if (alive) setResults(value);
        })
        .catch((err) => {
          if (alive) setResults({ ok: false, error: String(err), total: 0, maps: [] });
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 320);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [searchValue, searchingNow, comfort, rankedOnly]);

  const localHits = useMemo(() => {
    if (!searchingNow) return [];
    const needle = searchValue.toLowerCase();
    return maps
      .filter((map) => `${map.title} ${map.artist} ${map.mapper} ${map.diff}`.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [maps, searchValue, searchingNow]);

  const tasteLine = useMemo(() => {
    const creators = (scan?.preferences?.creators ?? []).slice(0, 2).map((item) => item.name);
    const artists = (scan?.preferences?.artists ?? []).slice(0, 2).map((item) => item.name);
    const parts: string[] = [];
    if (creators.length) parts.push(`мапперы ${creators.join(', ')}`);
    if (artists.length) parts.push(`артисты ${artists.join(', ')}`);
    return parts.join(' · ');
  }, [scan?.preferences]);

  const onlineParams = useMemo(() => {
    const bpm = scan?.preferences?.bpm;
    const span =
      starMode === 'hard' ? { lo: 0.25, hi: 1.6 } : starMode === 'wide' ? { lo: -0.7, hi: 1.9 } : { lo: -0.1, hi: 1.1 };
    return {
      minStars: Math.max(1, Math.round((comfort + span.lo) * 10) / 10),
      maxStars: Math.round((comfort + span.hi) * 10) / 10,
      bpmMin: Math.max(60, Math.round((bpm?.p25 ?? 120) - 10)),
      bpmMax: Math.min(320, Math.round((bpm?.p75 ?? 200) + 10)),
      target: Math.round((comfort + 0.35) * 10) / 10,
      excludeSetIds: maps
        .filter((map) => map.plays > 0)
        .map((map) => map.setId)
        .filter(Boolean),
      limit: 12,
      cursor,
      filters,
    };
  }, [comfort, maps, scan?.preferences?.bpm, cursor, starMode, filters]);

  const loadOnline = useCallback(
    async (force = false) => {
      setOnlineLoading(true);
      try {
        const result = await bridge.searchMaps({ ...onlineParams, force });
        setOnline(result);
      } catch (err) {
        setOnline({ ok: false, error: String(err instanceof Error ? err.message : err), total: 0, maps: [] });
      } finally {
        setOnlineLoading(false);
      }
    },
    [onlineParams],
  );

  useEffect(() => {
    if (!scan?.ok) return;
    const timer = window.setTimeout(() => void loadOnline(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOnline, scan?.ok]);

  const similar = useMemo(() => {
    if (!seed) return [];
    return maps
      .filter((map) => map.id !== seed.id && (!onlyNew || map.plays === 0))
      .map((map) => ({ map, score: similarity(map, seed) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .map(({ map }) => ({ map, reasons: matchReasons(map, seed) }));
  }, [maps, seed, onlyNew]);

  const similarIds = useMemo(() => new Set(similar.map((item) => item.map.id)), [similar]);

  const level = useMemo(() => {
    const target = Math.min(6.5, comfort + 0.5);
    return maps
      .filter((map) => map.plays === 0 && !similarIds.has(map.id) && Math.abs(map.stars - target) <= 0.45)
      .sort((a, b) => Math.abs(a.stars - target) - Math.abs(b.stars - target))
      .slice(0, 6)
      .map((map) => ({
        map,
        reasons: [`цель ${fmtNum(target, 1)}★`, `комфорт ${fmtNum(comfort, 1)}★`, 'новое для тебя'],
      }));
  }, [maps, comfort, similarIds]);

  const forgotten = useMemo(
    () =>
      maps
        .filter((map) => map.plays > 0 && map.lastAt > 0 && now - map.lastAt > 14 * 86_400_000)
        .sort((a, b) => a.lastAt - b.lastAt)
        .slice(0, 5)
        .map((map) => ({
          map,
          reasons: [`лучший ${fmtNum(map.bestAcc, 1)}%`, `${fmtInt(map.plays)} плеев`],
        })),
    [maps, now],
  );

  const activeFilters =
    filters.genres.length +
    filters.languages.length +
    (filters.rankedOnly ? 1 : 0) +
    filters.hideArtists.length +
    filters.hideMappers.length;

  function patchFilters(update: (prev: MapFilters) => MapFilters) {
    setFilters(update);
    setCursor('');
    setCursorDepth(0);
    setHideFor(0);
  }

  function chooseStarMode(mode: StarMode) {
    setStarMode(mode);
    setCursor('');
    setCursorDepth(0);
    setHideFor(0);
  }

  function toggleId(kind: 'genres' | 'languages', id: number) {
    patchFilters((prev) => ({
      ...prev,
      [kind]: prev[kind].includes(id) ? prev[kind].filter((item) => item !== id) : [...prev[kind], id],
    }));
  }

  function hideValue(kind: 'hideArtists' | 'hideMappers', value: string) {
    const clean = String(value || '').trim();
    if (!clean) return;
    patchFilters((prev) => ({
      ...prev,
      [kind]: prev[kind].some((item) => item.toLowerCase() === clean.toLowerCase())
        ? prev[kind]
        : [...prev[kind], clean],
    }));
  }

  function unhide(kind: 'hideArtists' | 'hideMappers', value: string) {
    patchFilters((prev) => ({ ...prev, [kind]: prev[kind].filter((item) => item !== value) }));
  }

  async function moreSearch() {
    if (!results?.next || searchMore) return;
    setSearchMore(true);
    try {
      const value = await bridge.quickSearch({
        text: searchValue,
        limit: 50,
        target: Math.round((comfort + 0.35) * 10) / 10,
        cursor: results.next,
        rankedOnly,
      });
      setResults((prev) => {
        if (!prev) return value;
        const known = new Set(prev.maps.map((map) => map.setId));
        return {
          ...prev,
          maps: [...prev.maps, ...value.maps.filter((map) => !known.has(map.setId))],
          next: value.next ?? null,
          total: value.total || prev.total,
        };
      });
    } catch {
      // keep what is already on screen
    } finally {
      setSearchMore(false);
    }
  }

  async function download(map: MapSuggestion) {
    setDownloadId(map.setId);
    setNotice('');
    try {
      const result = await bridge.downloadMap(map.setId);
      if (result.ok && result.opened) {
        setDownloaded((prev) => (prev.includes(map.setId) ? prev : [...prev, map.setId]));
        setNotice(`«${map.title}» ушла в osu! — он импортирует её сам. Через пару секунд можно жать «в osu!».`);
        [2000, 6000, 12000].forEach((ms) => window.setTimeout(refreshInstalled, ms));
      } else if (result.ok) {
        setNotice(`«${map.title}» лежит в загрузках, но osu! файл не подхватил. Открой его вручную.`);
      } else {
        const why = result.error || 'ошибка';
        const unranked = Boolean(map.status) && !['ranked', 'approved', 'qualified', 'loved'].includes(map.status);
        setNotice(
          unranked
            ? `«${map.title}» нет ни в одном зеркале (${why}). Такие карты (${map.status === 'graveyard' ? 'graveyard' : 'не ранкед'}) архивы хранят не все. Открыл страницу osu! — скачать можно после входа в аккаунт.`
            : `Скачать не вышло (${why}). Открываю страницу карты в браузере.`,
        );
        void bridge.openExternal(`https://osu.ppy.sh/beatmapsets/${map.setId}`);
      }
    } catch (err) {
      setNotice(`Скачать не вышло: ${err instanceof Error ? err.message : String(err)}. Открываю страницу карты.`);
      void bridge.openExternal(`https://osu.ppy.sh/beatmapsets/${map.setId}`);
    } finally {
      setDownloadId(0);
    }
  }

  async function open(target: { id: number; title: string }) {
    setNotice('');
    const note = await openInOsu(target);
    if (note) setNotice(note.text);
  }

  if (!scan?.ok) {
    return (
      <div className="maps fade-in">
        <div className="card maps-empty">
          <IconSearch size={22} />
          <b>Карты пока не прочитаны</b>
          <p className="note">
            Проверь папку osu! в настройках и запусти сканирование. Без него я не знаю, что у тебя есть.
          </p>
          <button className="btn" onClick={onScan}>
            <IconRefresh /> сканировать
          </button>
        </div>
      </div>
    );
  }

  const onlineError =
    online?.error === 'no credentials'
      ? 'В .env нет ключей osu! API — новые карты искать негде. Локальные подборки ниже работают и без них.'
      : online?.error
        ? `osu! не ответил: ${online.error}. Чаще всего это лимит запросов или сеть — попробуй ещё раз.`
        : '';

  return (
    <div className={'maps fade-in' + (searchingNow ? ' searching' : '')}>
      <div className="maps-head">
        <div>
          <div className="card-title">подбор карт</div>
          <div className="maps-stats">
            <span>
              <b>{fmtInt(maps.length)}</b> карт в базе
            </span>
            <span>
              <b>{fmtInt(playedCount)}</b> играл
            </span>
            <span>
              комфорт <b>{fmtNum(comfort, 1)}★</b>
            </span>
          </div>
        </div>
        <div className="maps-actions">
          <button className={'btn ghost' + (onlyNew ? ' active' : '')} onClick={() => setOnlyNew((value) => !value)}>
            {onlyNew ? 'только новое' : 'включая знакомое'}
          </button>
          <button className="btn ghost" onClick={onScan}>
            <IconRefresh /> обновить
          </button>
        </div>
      </div>

      <div className="map-search">
        <IconSearch size={15} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResults(null);
            setSearching(false);
          }}
          placeholder="найти карту: название, артист или маппер"
          spellCheck={false}
        />
        {query && (
          <button
            className="map-search-clear"
            onClick={() => {
              setQuery('');
              setResults(null);
              setSearching(false);
            }}
            aria-label="очистить"
          >
            ×
          </button>
        )}
      </div>

      {searchingNow && (
        <section className="map-section search-section">
          <div className="section-title">
            <IconSearch size={14} /> поиск · «{searchValue}»
            <button
              className={'section-action' + (rankedOnly ? ' active' : '')}
              onClick={() => setRankedOnly((value) => !value)}
            >
              {rankedOnly ? 'только ранкед' : 'все статусы'}
            </button>
          </div>
          {results?.ok && (
            <p className="online-why">
              в osu! {fmtInt(results.total)} {plural(results.total, 'карта', 'карты', 'карт')} · показано{' '}
              {results.maps.length}
            </p>
          )}
          {localHits.length > 0 && (
            <div className="card map-list">
              {localHits.map((map) => (
                <MapRow
                  key={map.id}
                  map={map}
                  reasons={[
                    map.plays ? `${map.plays} ${plural(map.plays, 'плей', 'плея', 'плеев')}` : 'ещё не играл',
                    'уже в базе',
                  ]}
                  onOpen={() => void open(map)}
                />
              ))}
            </div>
          )}
          <div className="card map-list online-list">
            {searching && !results ? (
              <div className="online-skeleton">
                <i />
                <i />
                <i />
              </div>
            ) : results?.ok && results.maps.length ? (
              results.maps.map((map) => (
                <OnlineRow
                  key={map.id}
                  map={map}
                  downloading={downloadId === map.setId}
                  downloaded={downloaded.includes(map.setId)}
                  installed={installed.has(map.setId)}
                  onDownload={() => download(map)}
                  onOpen={() => void open(map)}
                />
              ))
            ) : (
              <div className="online-state">
                <span className="online-state-icon">
                  <IconSearch size={17} />
                </span>
                <b>{results?.ok ? 'в osu! такого не нашлось' : 'поиск не отвечает'}</b>
                <p>
                  {results?.error === 'no credentials'
                    ? 'Без ключей osu! API ищу только по своей базе — она выше.'
                    : results?.error || 'Попробуй другое название или проверь сеть.'}
                </p>
              </div>
            )}
          </div>
          {results?.ok && results.next && (
            <button className="btn ghost map-more" onClick={() => void moreSearch()} disabled={searchMore}>
              {searchMore ? 'тяну…' : 'показать ещё'}
            </button>
          )}
        </section>
      )}

      {seed && (
        <div className="card seed-card">
          <div className="seed-label">точка отсчёта</div>
          <div className="seed-main">
            <b>{seed.title}</b>
            <span>
              {seed.artist} · [{seed.diff}]
            </span>
          </div>
          <div className="seed-facts">
            <span>{fmtNum(seed.stars, 2)}★</span>
            <span>{Math.round(seed.bpm)} BPM</span>
            <span>{fmtTime(seed.drainTime * 1000)}</span>
            {seed.lastAt > 0 && <span>{daysAgo(seed.lastAt, now)}</span>}
          </div>
          <p className="seed-hint">
            Это твоя последняя карта. От неё считаю похожие: темп, сложность и длина рядом — значит играется знакомо.
          </p>
        </div>
      )}

      <section className="map-section">
        <div className="section-title">
          <IconSpark size={13} /> новое из osu! · под твой вкус
          <button
            className={'section-action' + (activeFilters ? ' active' : '')}
            onClick={() => setShowFilters((value) => !value)}
          >
            <IconGear size={12} /> фильтры{activeFilters ? ` · ${activeFilters}` : ''}
          </button>
          <button
            className="section-action"
            onClick={() => {
              if (online?.next) {
                setCursor(online.next);
                setCursorDepth((value) => value + 1);
                return;
              }
              setCursor('');
              setCursorDepth(0);
              setNotice(
                cursorDepth > 0
                  ? 'Дальше выдача пустая — вернул в начало.'
                  : 'Дальше новых карт нет. Это вся подборка под твой вкус.',
              );
            }}
          >
            <IconRefresh size={12} /> другие
          </button>
        </div>
        {tasteLine && <p className="online-why">учитываю: {tasteLine}, темп и длину</p>}
        {showFilters && (
          <div className="card map-filters">
            <div className="filter-group">
              <span className="filter-label">жанр</span>
              <div className="filter-chips">
                {GENRE_CHIPS.map((genre) => (
                  <button
                    key={genre.id}
                    className={'filter-chip' + (filters.genres.includes(genre.id) ? ' on' : '')}
                    onClick={() => toggleId('genres', genre.id)}
                  >
                    {genre.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">язык</span>
              <div className="filter-chips">
                {LANGUAGE_CHIPS.map((language) => (
                  <button
                    key={language.id}
                    className={'filter-chip' + (filters.languages.includes(language.id) ? ' on' : '')}
                    onClick={() => toggleId('languages', language.id)}
                  >
                    {language.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">сложность</span>
              <div className="filter-chips">
                {STAR_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    className={'filter-chip' + (starMode === mode.id ? ' on' : '')}
                    onClick={() => chooseStarMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">ещё</span>
              <div className="filter-chips">
                <button
                  className={'filter-chip' + (filters.rankedOnly ? ' on' : '')}
                  onClick={() => patchFilters((prev) => ({ ...prev, rankedOnly: !prev.rankedOnly }))}
                >
                  только ранкед
                </button>
                <button className="filter-chip" onClick={() => patchFilters(() => ({ ...EMPTY_FILTERS }))}>
                  сбросить
                </button>
              </div>
            </div>
            {(filters.hideArtists.length > 0 || filters.hideMappers.length > 0) && (
              <div className="filter-group">
                <span className="filter-label">скрыто</span>
                <div className="filter-chips">
                  {filters.hideArtists.map((artist) => (
                    <button
                      key={'a' + artist}
                      className="filter-chip on"
                      title="вернуть в подборку"
                      onClick={() => unhide('hideArtists', artist)}
                    >
                      {artist} ×
                    </button>
                  ))}
                  {filters.hideMappers.map((mapper) => (
                    <button
                      key={'m' + mapper}
                      className="filter-chip on"
                      title="вернуть в подборку"
                      onClick={() => unhide('hideMappers', mapper)}
                    >
                      {mapper} ×
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="note filter-note">
              пусто — значит любой. Жанр и язык берутся из метаданных карты, а не из названия. Крестик на карте скрывает
              артиста или маппера из подборки.
            </p>
          </div>
        )}
        <div className="card map-list online-list">
          {onlineLoading && !online?.maps.length ? (
            <div className="online-skeleton">
              <i />
              <i />
              <i />
            </div>
          ) : online?.ok && online.maps.length ? (
            online.maps.map((map) => (
              <OnlineRow
                key={map.id}
                map={map}
                downloading={downloadId === map.setId}
                downloaded={downloaded.includes(map.setId)}
                installed={installed.has(map.setId)}
                onDownload={() => download(map)}
                onOpen={() => void open(map)}
                onHide={(kind) =>
                  hideValue(
                    kind === 'artist' ? 'hideArtists' : 'hideMappers',
                    kind === 'artist' ? map.artist : map.mapper,
                  )
                }
                hideOpen={hideFor === map.setId}
                onHideToggle={() => setHideFor((value) => (value === map.setId ? 0 : map.setId))}
              />
            ))
          ) : onlineError ? (
            <div className="online-state bad">
              <span className="online-state-icon">
                <IconExternal size={17} />
              </span>
              <b>osu! не ответил</b>
              <p>{onlineError}</p>
              <div className="online-state-actions">
                <button className="btn ghost" onClick={() => void loadOnline(true)}>
                  <IconRefresh size={13} /> повторить
                </button>
                <button className="btn ghost" onClick={onScan}>
                  пересканировать базу
                </button>
              </div>
            </div>
          ) : (
            <div className="online-state">
              <span className="online-state-icon">
                <IconSearch size={17} />
              </span>
              <b>{cursorDepth > 0 ? 'Дальше пусто' : 'Подходящих карт не нашлось'}</b>
              <p>
                {cursorDepth > 0
                  ? 'Нажми «другие» ещё раз — вернёт в начало подборки.'
                  : 'Всё, что подходило под вкус, уже в базе. Сыграй что-нибудь новое — подберу заново.'}
              </p>
              <div className="online-state-actions">
                <button
                  className="btn ghost"
                  onClick={() => {
                    if (cursorDepth > 0) {
                      setCursor('');
                      setCursorDepth(0);
                      return;
                    }
                    void loadOnline(true);
                  }}
                >
                  {cursorDepth > 0 ? 'в начало' : 'обновить подборку'}
                </button>
              </div>
            </div>
          )}
        </div>
        {online && online.maps.length < 6 && (online.fallback?.length ?? 0) > 0 && (
          <div className="online-fallback">
            <div className="online-fallback-note">
              подходящего под твой вкус мало — вот ближайшее, но это не твой жанр
            </div>
            <div className="card map-list online-list">
              {online.fallback?.map((map) => (
                <OnlineRow
                  key={map.id}
                  map={map}
                  downloading={downloadId === map.setId}
                  downloaded={downloaded.includes(map.setId)}
                  installed={installed.has(map.setId)}
                  onDownload={() => download(map)}
                  onOpen={() => void open(map)}
                  onHide={(kind) =>
                    hideValue(
                      kind === 'artist' ? 'hideArtists' : 'hideMappers',
                      kind === 'artist' ? map.artist : map.mapper,
                    )
                  }
                  hideOpen={hideFor === map.setId}
                  onHideToggle={() => setHideFor((value) => (value === map.setId ? 0 : map.setId))}
                />
              ))}
            </div>
          </div>
        )}
        {notice && <div className="bd-open-note map-notice">{notice}</div>}
      </section>

      {seed && (
        <section className="map-section">
          <div className="section-title">
            <IconSearch size={14} /> похожие по темпу и сложности
          </div>
          <div className="card map-list">
            {similar.length ? (
              similar.map(({ map, reasons }) => (
                <MapRow key={map.id} map={map} reasons={reasons} onOpen={() => void open(map)} />
              ))
            ) : (
              <div className="empty">Похожего не нашлось. Выключи «только новое» или обнови базу карт.</div>
            )}
          </div>
        </section>
      )}

      <section className="map-section">
        <div className="section-title">
          <IconStar size={13} /> следующий шаг
        </div>
        <div className="card map-list">
          {level.length ? (
            level.map(({ map, reasons }) => (
              <MapRow key={map.id} map={map} reasons={reasons} onOpen={() => void open(map)} />
            ))
          ) : (
            <div className="empty">Все карты этого уровня уже сыграны. Загляни в «похожие».</div>
          )}
        </div>
      </section>

      {forgotten.length > 0 && (
        <section className="map-section">
          <div className="section-title">
            <IconRefresh size={13} /> давно не играл
          </div>
          <div className="card map-list">
            {forgotten.map(({ map, reasons }) => (
              <MapRow
                key={map.id}
                map={map}
                reasons={reasons}
                note={daysAgo(map.lastAt, now)}
                onOpen={() => void open(map)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
