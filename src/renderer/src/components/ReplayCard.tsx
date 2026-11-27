import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { ReplayDetail, ReplayResult } from '../types';
import { bridge } from '../hooks';
import { fmtNum, plural } from '../utils';
import { IconExternal, IconRefresh, IconSearch } from './Icons';

const KIND_LABEL: Record<string, string> = {
  stream: 'стрим',
  burst: 'бёрст',
  jump: 'джамп',
  flow: 'ровно',
};

function secs(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function errorText(error: string | null | undefined): string {
  if (error === 'no-replays-folder') return 'osu! ещё не сохранил ни одного реплея.';
  if (error === 'empty') return 'Папка Replays пустая — сыграй карту, и файл появится.';
  if (error === 'parse-failed') return 'Реплей нашёлся, но не читается (возможно, другая версия osu!).';
  return 'Не удалось прочитать реплей.';
}

/** A real breakdown of the newest .osr: taps, streams, aim jumps and where it broke. */
export function ReplayCard() {
  const [data, setData] = useState<ReplayResult | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    bridge
      .replayLatest()
      .then((res) => {
        if (alive) setData(res);
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await bridge.replayLatest());
    } finally {
      setLoading(false);
    }
  }, []);

  const pick = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bridge.replayPick();
      if (res.error !== 'cancelled') setData(res);
    } finally {
      setLoading(false);
    }
  }, []);

  const a = data?.analysis ?? null;

  return (
    <div className="card replay-card">
      <div className="replay-head">
        <div>
          <div className="card-title">разбор реплея</div>
          <div className="replay-sub">
            {a
              ? `${a.player} · ${data?.file ?? 'последний'} · ${secs(a.durationMs)}`
              : 'по файлу .osr — где сыпется тап и аим'}
          </div>
        </div>
        <div className="replay-actions">
          <button className="btn ghost replay-refresh" onClick={() => void pick()} disabled={loading}>
            <IconSearch /> выбрать .osr
          </button>
          <button className="btn ghost replay-refresh" onClick={() => void bridge.replayOpenFolder()}>
            <IconExternal /> папка Replays
          </button>
          <button className="btn ghost replay-refresh" onClick={() => void refresh()} disabled={loading}>
            <IconRefresh /> {loading ? 'читаю…' : 'последний'}
          </button>
        </div>
      </div>

      {data && !a && !loading && (
        <div className="replay-empty">
          <b>{errorText(data?.error)}</b>
          <span>
            osu! обычно кладёт реплеи в <code>{data?.path || 'osu!\\Replays'}</code> сам после доигранной карты. Если
            папка пустая — нажми «выбрать .osr» и подсунуть файл руками.
          </span>
        </div>
      )}

      {a && (
        <motion.div
          className="replay-body"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="replay-stats">
            <Stat
              label="точность"
              value={`${fmtNum(a.accuracy, 2)}%`}
              tone={a.accuracy >= 97 ? 'good' : a.accuracy >= 92 ? 'ok' : 'bad'}
            />
            <Stat
              label="промахи"
              value={String(a.counts.miss)}
              tone={a.counts.miss === 0 ? 'good' : a.counts.miss <= 3 ? 'ok' : 'bad'}
            />
            <Stat label="комбо" value={`${a.maxCombo}×`} />
            <Stat label="темп тапа" value={a.tapBpm ? `${a.tapBpm} bpm` : '—'} />
            <Stat label="чередование" value={`${Math.round(a.alternate * 100)}%`} />
            <Stat label="стримов" value={String(a.streams)} />
            <Stat label="макс. джамп" value={`${a.maxJump}px`} tone={a.maxJump > 240 ? 'bad' : 'ok'} />
            <Stat label="нажатий" value={String(a.taps)} />
          </div>

          <ReplayChart taps={a.timeline.tapSeries} speed={a.timeline.speedSeries} />

          {a.detail && <ReplayDetailBlock detail={a.detail} counts={a.counts} />}
          {!a.detail && a.detailNote && (
            <div className="replay-caveat">
              {a.detailNote === 'map-not-found'
                ? 'детальный разбор не построить: этой карты нет в твоей базе osu!. Скачай её, и разбор появится.'
                : a.detailNote === 'osu-missing'
                  ? 'карта в базе есть, а файла .osu в Songs не нашлось. Итоги из реплея выше всё равно верные.'
                  : 'карту не получилось разобрать, но итоги из реплея выше верные.'}
            </div>
          )}

          <div className="replay-notes">
            <div className="replay-verdicts">
              {a.summary.verdicts.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <div className="replay-tips">
              {a.summary.tips.map((line) => (
                <p key={line}>
                  <b>совет.</b> {line}
                </p>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ReplayDetailBlock({
  detail,
  counts,
}: {
  detail: ReplayDetail;
  counts: { n300: number; n100: number; n50: number; miss: number };
}) {
  const m = detail.map;
  const { streamAbs, jumpAbs, verdict } = detail.profile;
  return (
    <div className="replay-detail">
      {m && (
        <div className="replay-map">
          <span className="replay-map-title">
            {m.artist} — {m.title}
          </span>
          <span className="replay-map-meta">
            [{m.version}] · {fmtNum(m.stars, 2)}★ · OD {fmtNum(m.od, 1)}
            {m.bpm ? ` · ${Math.round(m.bpm)} bpm` : ''} · {m.objects} нот
          </span>
        </div>
      )}

      <div className="replay-profile">
        <div className="replay-profile-item">
          <span>стримы</span>
          <b className={streamAbs > jumpAbs + 5 ? 'tone-bad' : ''}>{streamAbs} мс</b>
        </div>
        <div className="replay-profile-item">
          <span>джампы</span>
          <b className={jumpAbs > streamAbs + 5 ? 'tone-bad' : ''}>{jumpAbs} мс</b>
        </div>
        <div className="replay-profile-verdict">{verdict ?? 'мало данных для сравнения'}</div>
      </div>

      <div className="replay-moments">
        <div className="replay-moments-title">где сыпалось</div>
        {detail.moments.length ? (
          detail.moments.map((moment) => (
            <div className="replay-moment" key={`${moment.at}-${moment.text}`}>
              <span className={'rm-kind rm-' + moment.kind}>{KIND_LABEL[moment.kind] ?? moment.kind}</span>
              <span className="rm-text">{moment.text}</span>
            </div>
          ))
        ) : (
          <div className="replay-moment-empty">
            {counts.miss || counts.n100 || counts.n50
              ? 'в тапах явного провала не нашлось: в стримах окна перекрываются, поэтому такие промахи тут не видны. Итоги выше — из самого реплея.'
              : 'ни одного промаха в реплее — сыграно чисто, разбирать нечего.'}
          </div>
        )}
      </div>

      <OffsetChart timeline={detail.offsetTimeline} />

      <div className="replay-caveat">
        позиции считаны по тапам и сетке карты (окно 50: {detail.windows.w50} мс). В самом реплее: {counts.miss}{' '}
        {plural(counts.miss, 'промах', 'промаха', 'промахов')}, {counts.n100}{' '}
        {plural(counts.n100, 'сотка', 'сотки', 'соток')}, {counts.n50}{' '}
        {plural(counts.n50, 'пятидесятка', 'пятидесятки', 'пятидесяток')}. Это официальный счёт из файла.
      </div>
    </div>
  );
}

function OffsetChart({ timeline }: { timeline: ReplayDetail['offsetTimeline'] }) {
  const avg = timeline.avg;
  if (!avg.length) return null;
  const w = 600;
  const h = 76;
  const mid = h / 2;
  const peak = Math.max(20, ...avg.map((v) => (v == null ? 0 : Math.abs(v))));
  const bw = w / avg.length;
  return (
    <div className="replay-offsets">
      <div className="replay-offsets-legend">
        <span>
          <i className="ro-early" /> рано
        </span>
        <span>тайминг по ходу карты</span>
        <span>
          поздно <i className="ro-late" />
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <line x1="0" y1={mid} x2={w} y2={mid} className="ro-axis" />
        {avg.map((v, i) => {
          if (v == null) return null;
          const bh = (Math.abs(v) / peak) * (mid - 6);
          const late = v >= 0;
          return (
            <rect
              key={i}
              x={i * bw + 0.5}
              y={late ? mid : mid - bh}
              width={Math.max(1, bw - 1)}
              height={bh}
              rx="1.5"
              className={late ? 'ro-late' : 'ro-early'}
            />
          );
        })}
      </svg>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'ok' | 'bad' }) {
  return (
    <div className={'replay-stat' + (tone ? ' tone-' + tone : '')}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
function ReplayChart({ taps, speed }: { taps: number[]; speed: number[] }) {
  const n = Math.max(taps.length, speed.length);
  if (n < 2) return null;
  const w = 600;
  const h = 110;
  const maxTap = Math.max(1, ...taps);
  const maxSpeed = Math.max(1, ...speed);
  const bw = w / n;

  const line = speed.map((v, i) => `${(i + 0.5) * bw},${h - (v / maxSpeed) * (h - 14) - 6}`).join(' ');

  return (
    <div className="replay-chart">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {taps.map((v, i) => {
          const bh = (v / maxTap) * (h - 12);
          return (
            <rect
              key={i}
              x={i * bw + 0.5}
              y={h - bh}
              width={Math.max(1, bw - 1)}
              height={bh}
              rx="2"
              className="rc-bar"
            />
          );
        })}
        <polyline points={line} className="rc-line" />
      </svg>
      <div className="replay-chart-legend">
        <span>
          <i className="rc-dot-bar" /> тапы
        </span>
        <span>
          <i className="rc-dot-line" /> скорость аима
        </span>
      </div>
    </div>
  );
}
