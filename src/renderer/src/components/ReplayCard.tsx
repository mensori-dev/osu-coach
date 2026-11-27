import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { ReplayResult } from '../types';
import { bridge } from '../hooks';
import { fmtNum } from '../utils';
import { IconRefresh } from './Icons';

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
        <button className="btn ghost replay-refresh" onClick={() => void refresh()} disabled={loading}>
          <IconRefresh /> {loading ? 'читаю…' : 'обновить'}
        </button>
      </div>

      {data && !a && !loading && (
        <div className="replay-empty">
          <b>{errorText(data?.error)}</b>
          <span>
            Положи реплеи в <code>{data?.path || 'osu!\\Replays'}</code> — osu! пишет их сама, когда ты доигрываешь
            карту.
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
            <Stat label="нот сыграно" value={String(a.taps)} />
          </div>

          <ReplayChart taps={a.timeline.tapSeries} speed={a.timeline.speedSeries} />

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
