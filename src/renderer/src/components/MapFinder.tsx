import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Bootstrap, MapEntry, MapSearchResult, MapSuggestion } from '../types';
import { bridge, useLive, useNow } from '../hooks';
import { fmtInt, fmtNum, fmtTime } from '../utils';
import { IconArrowRight, IconDownload, IconExternal, IconRefresh, IconSearch, IconSpark, IconStar } from './Icons';
import { PreviewButton } from './Preview';
import { openInOsu } from '../openMap';

interface Props {
  boot: Bootstrap;
  onScan: () => void;
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
}: {
  map: MapSuggestion;
  downloading: boolean;
  downloaded: boolean;
  installed: boolean;
  onDownload: () => void;
  onOpen: () => void;
}) {
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

export function MapFinder({ boot, onScan }: Props) {
  const scan = boot.scan;
  const live = useLive();
  const [onlyNew, setOnlyNew] = useState(true);
  const [online, setOnline] = useState<MapSearchResult | null>(null);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [cursor, setCursor] = useState('');
  const [cursorDepth, setCursorDepth] = useState(0);
  const [downloadId, setDownloadId] = useState(0);
  const [downloaded, setDownloaded] = useState<number[]>([]);
  const [installedSets, setInstalledSets] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const now = useNow(60_000);
  const maps = useMemo(() => scan?.maps ?? [], [scan]);
  const liveMapId = live?.beatmap?.id ?? 0;

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
    return {
      minStars: Math.max(1, Math.round((comfort - 0.1) * 10) / 10),
      maxStars: Math.round((comfort + 1.1) * 10) / 10,
      bpmMin: Math.max(60, Math.round((bpm?.p25 ?? 120) - 10)),
      bpmMax: Math.min(320, Math.round((bpm?.p75 ?? 200) + 10)),
      target: Math.round((comfort + 0.35) * 10) / 10,
      excludeSetIds: maps
        .filter((map) => map.plays > 0)
        .map((map) => map.setId)
        .filter(Boolean),
      limit: 12,
      cursor,
    };
  }, [comfort, maps, scan?.preferences?.bpm, cursor]);

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
        setNotice(`Скачать не вышло (${result.error || 'ошибка'}). Открываю страницу карты в браузере.`);
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
    <div className="maps fade-in">
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
