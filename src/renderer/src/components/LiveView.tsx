import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BeatmapInfo, Bootstrap, LivePayload, PlayInfo } from '../types';
import { accTone, fmtInt, fmtNum, fmtRank, fmtTime, isRankedStatus } from '../utils';
import { useTween } from '../hooks';
import { buildTips } from '../tips';
import type { Tab } from './TitleBar';
import { TipCard } from './TipCard';
import { useCoverAccent } from './accent';
import { IconPlay, IconSpark, IconStar } from './Icons';
import { PreviewButton } from './Preview';

interface Props {
  live: LivePayload | null;
  demo: boolean;
  boot?: Bootstrap | null;
  accent?: boolean;
  onDemo: (on: boolean) => void;
  onOpenPlays?: (mapId?: number) => void;
  onTab?: (tab: Tab) => void;
}

export function LiveView({ live, demo, boot, accent = true, onDemo, onOpenPlays, onTab }: Props) {
  if (!live || live.state === 'idle' || live.state === 'menu' || !live.beatmap || !live.play) {
    return <IdleScreen live={live} demo={demo} boot={boot} onDemo={onDemo} onTab={onTab} />;
  }

  if (live.state === 'results') {
    return <ResultsScreen live={live} accent={accent} onOpenPlays={onOpenPlays} />;
  }

  return <PlayScreen live={live} accent={accent} />;
}

function PlayScreen({ live, accent }: { live: LivePayload; accent: boolean }) {
  const map = live.beatmap!;
  const play = live.play!;
  const coverAccent = useCoverAccent(live.cover);
  const theme = accent ? coverAccent : null;

  return (
    <motion.div
      className="live"
      key={map.id || 'map'}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={theme ? ({ '--pink': theme.a, '--violet': theme.b } as CSSProperties) : undefined}
    >
      <div className="col-left">
        <MapCard map={map} cover={live.cover} />
        {live.player && <PlayerMini player={live.player} />}
      </div>

      <div className="stage">
        <AccuracyRing acc={play.accuracy} ur={play.ur} />
        <HitsRow play={play} />
      </div>

      <div className="side">
        <PpCard play={play} status={map.status} />
        <ComboCard play={play} />
        <ScoreCard play={play} />
      </div>

      <div className="strip">
        <div className="card progress-card">
          <div className="progress-head">
            <span>
              <b>{fmtTime(play.elapsedMs)}</b> / {fmtTime(play.totalMs)}
            </span>
            <span className="tiny">прогресс карты</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(play.progress * 1000) / 10}%` }} />
          </div>
          <HitError errors={live.hitErrors} od={map.od} />
        </div>
        <div className="card ur-card">
          <span className="card-title">Unstable Rate</span>
          <span className="ur-num">{Math.round(play.ur)}</span>
          <span className="tiny">{biasText(live.hitErrors)}</span>
        </div>
      </div>
    </motion.div>
  );
}

function biasText(errors: number[]): string {
  if (!errors.length) return 'нет данных';
  const mean = errors.reduce((s, e) => s + e, 0) / errors.length;
  if (Math.abs(mean) < 4) return 'ровно по центру';
  return mean < 0 ? 'жмёшь раньше' : 'жмёшь позже';
}

function MapCard({ map, cover }: { map: BeatmapInfo; cover: string | null }) {
  const [failed, setFailed] = useState(false);
  const src = cover ? `${cover}${cover.includes('?') ? '&' : '?'}v=${map.id}` : null;

  return (
    <div className="card map-card card-glow">
      <div className="map-cover">
        {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <div className="fallback" />}
        <div className="scrim" />
        <div className="stars-badge">
          <IconStar />
          {fmtNum(map.stars, 2)}
        </div>
        <PreviewButton setId={map.setId} className="map-preview" size={12} label="трек" />
        <div className="map-meta">
          <div className="map-title">{map.title}</div>
          <div className="map-artist">{map.artist}</div>
          <div className="map-diff">[{map.version}]</div>
        </div>
      </div>

      <div className="map-body">
        <div className="mapper-row">
          mapped by <b>{map.mapper || 'unknown'}</b>
        </div>
        <div className="chips">
          <span className="chip">
            AR <b>{fmtNum(map.ar, 1)}</b>
          </span>
          <span className="chip">
            OD <b>{fmtNum(map.od, 1)}</b>
          </span>
          <span className="chip">
            CS <b>{fmtNum(map.cs, 1)}</b>
          </span>
          <span className="chip">
            HP <b>{fmtNum(map.hp, 1)}</b>
          </span>
          <span className="chip">
            <b>{Math.round(map.bpm)}</b> BPM
          </span>
          <span className="chip">
            <b>{fmtInt(map.objects)}</b> объектов
          </span>
        </div>
        {map.kiai && (
          <div className="chips">
            <span className="chip mod">KIAI</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerMini({ player }: { player: NonNullable<LivePayload['player']> }) {
  const initial = player.name.slice(0, 1).toUpperCase();
  return (
    <div className="card player-mini">
      <div className="player-avatar">{initial}</div>
      <div style={{ minWidth: 0 }}>
        <div className="player-name">{player.name}</div>
        <div className="player-sub">
          {fmtRank(player.rank)} · {fmtNum(player.accuracy, 2)}%
        </div>
      </div>
      <div className="player-pp">
        <b>{fmtNum(player.pp, 0)}</b>
        <span>pp</span>
      </div>
    </div>
  );
}

function AccuracyRing({ acc, ur }: { acc: number; ur: number }) {
  const shown = useTween(acc);
  const radius = 104;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, acc));
  const dash = (circumference * pct) / 100;
  const tone = accTone(acc);

  return (
    <div className="ring-wrap">
      <div className="ring-glow" />
      <svg className="ring" viewBox="0 0 240 240">
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9b6bff" />
            <stop offset="55%" stopColor="#ff5fa2" />
            <stop offset="100%" stopColor="#ffc0dc" />
          </linearGradient>
        </defs>
        <circle className="track" cx="120" cy="120" r={radius} strokeWidth="11" />
        <circle
          className="value"
          cx="120"
          cy="120"
          r={radius}
          strokeWidth="11"
          stroke="url(#ring-gradient)"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="ring-center">
        <div className="ring-value">
          {fmtNum(shown, 2)}
          <small>%</small>
        </div>
        <div className="ring-label">точность</div>
        <div className="ring-sub">
          <span className="dot" style={{ background: `var(--${tone})`, boxShadow: 'none', width: 6, height: 6 }} />
          UR {Math.round(ur)}
        </div>
      </div>
    </div>
  );
}

function HitsRow({ play }: { play: PlayInfo }) {
  const { hits } = play;
  return (
    <div className="hits-row">
      <div className="hit-pill c300">
        <span>300</span>
        <b>{fmtInt(hits['300'])}</b>
      </div>
      <div className="hit-pill c100">
        <span>100</span>
        <b>{fmtInt(hits['100'])}</b>
      </div>
      <div className="hit-pill c50">
        <span>50</span>
        <b>{fmtInt(hits['50'])}</b>
      </div>
      <div className="hit-pill cmiss">
        <span>MISS</span>
        <b>{fmtInt(hits.miss)}</b>
      </div>
    </div>
  );
}

function PpCard({ play, status }: { play: PlayInfo; status?: number }) {
  const ranked = isRankedStatus(status);
  const current = useTween(ranked ? play.pp.current : 0);
  const max = Math.max(play.pp.max, play.pp.fc, 1);
  const curPct = ranked ? Math.max(0, Math.min(100, (play.pp.current / max) * 100)) : 0;
  const fcPct = ranked ? Math.max(0, Math.min(100, (play.pp.fc / max) * 100)) : 0;
  const gain = Math.max(0, play.pp.fc - play.pp.current);

  if (!ranked) {
    return (
      <div className="card pp-card unranked">
        <span className="card-title">pp</span>
        <div className="pp-unranked">
          <b>не считается</b>
          <span>карта не ранкнута: pending, loved или graveyard. Играй на точность и комбо — pp тут не дадут.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card pp-card">
      <span className="card-title">pp сейчас</span>
      <div className="pp-main">
        <span className="num">{fmtNum(current, 0)}</span>
        <span className="unit">pp</span>
      </div>
      <div className="pp-delta">
        {gain >= 1 ? `+${fmtNum(gain, 0)} pp, если доиграешь чисто` : 'держишь максимум, не сломай'}
      </div>
      <div className="pp-bars">
        <div>
          <div className="pp-row">
            <span>потенциал FC</span>
            <b>{fmtNum(play.pp.fc, 0)} pp</b>
          </div>
          <div className="pp-track">
            <div className="pp-fill fc" style={{ width: `${fcPct}%` }} />
          </div>
        </div>
        <div>
          <div className="pp-row">
            <span>максимум карты</span>
            <b>{fmtNum(play.pp.max, 0)} pp</b>
          </div>
          <div className="pp-track">
            <div className="pp-fill" style={{ width: `${curPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ComboCard({ play }: { play: PlayInfo }) {
  return (
    <div className="card combo-card">
      <div className="combo-block">
        <span className="combo-sub">комбо</span>
        <span key={play.combo} className="combo-num pop">
          {fmtInt(play.combo)}
        </span>
        <span className="tiny">макс {fmtInt(play.maxCombo)}</span>
      </div>
      <div className="rank-letter">{play.rank || '—'}</div>
    </div>
  );
}

function ScoreCard({ play }: { play: PlayInfo }) {
  const score = useTween(play.score, 0.22);
  return (
    <div className="card score-card">
      <div>
        <span className="card-title">счёт</span>
        <div className="score-num">{fmtInt(score)}</div>
      </div>
      <div className="chips">
        {play.mods.length ? (
          play.mods.map((m) => (
            <span key={m} className="chip mod">
              {m}
            </span>
          ))
        ) : (
          <span className="chip">NM</span>
        )}
      </div>
    </div>
  );
}

function HitError({ errors, od }: { errors: number[]; od: number }) {
  const range = 140;
  const band = Math.min(60, Math.max(10, (139.5 - 8 * od) / 2));
  const recent = useMemo(() => errors.slice(-64), [errors]);

  return (
    <div className="hiterror">
      <div className="band" style={{ left: `${50 - (band / range) * 50}%`, width: `${(band / range) * 100}%` }} />
      <div className="center" />
      {recent.map((err, index) => {
        const clamped = Math.max(-range, Math.min(range, err));
        const x = 50 + (clamped / range) * 50;
        const weight = index / Math.max(1, recent.length - 1);
        return (
          <i
            key={index}
            className="tick"
            style={{
              left: `${x}%`,
              height: 8 + weight * 22,
              background: err < 0 ? 'var(--blue)' : 'var(--pink)',
              opacity: 0.25 + weight * 0.7,
            }}
          />
        );
      })}
      <span className="zero">0 ms</span>
    </div>
  );
}

function IdleScreen({
  live,
  demo,
  boot,
  onDemo,
  onTab,
}: {
  live: LivePayload | null;
  demo: boolean;
  boot?: Bootstrap | null;
  onDemo: (on: boolean) => void;
  onTab?: (tab: Tab) => void;
}) {
  const connected = Boolean(live?.tosu.connected);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const tips = useMemo(() => buildTips(boot ?? null), [boot]);
  const [tipIndex, setTipIndex] = useState(0);
  const tip = tips[tipIndex % tips.length];

  const title = demo ? 'Демо-режим' : connected ? 'Клиент на связи' : 'tosu не найден';
  const text = demo
    ? 'Так выглядит лайв во время игры. Когда включишь tosu, цифры будут настоящими.'
    : connected
      ? 'Выбери карту в osu! и нажми играть. Всё появится само.'
      : 'tosu читает состояние osu! и отдаёт его этой проге. Без него живых цифр не будет.';

  const launch = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await window.api?.launchTosu();
      if (!res || !res.ok) {
        if (res?.cancelled) setNote({ tone: 'bad', text: 'UAC закрыли, tosu не стартовал.' });
        else if (res?.notFound) setNote({ tone: 'bad', text: 'Не нашёл tosu.exe. Укажи путь вручную.' });
        else setNote({ tone: 'bad', text: res?.error || 'Не получилось запустить tosu.' });
      } else if (res.already) {
        setNote({ tone: 'ok', text: 'tosu уже работает, подключаюсь.' });
      } else if (res.up === false) {
        setNote({ tone: 'ok', text: 'tosu открылся, но ещё не отвечает. Дай ему пару секунд.' });
      } else {
        setNote({ tone: 'ok', text: 'tosu запущен от админа. Жду подключения…' });
      }
    } catch (err) {
      setNote({ tone: 'bad', text: String(err instanceof Error ? err.message : err) });
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    const res = await window.api?.pickTosu();
    if (res?.ok) setNote({ tone: 'ok', text: `Путь сохранён: ${res.path}` });
  };

  return (
    <div className="idle fade-in">
      <div className="idle-inner">
        <div className="idle-orb">
          <span className="ring1" />
          <span className="ring2" />
          <span className="core" />
        </div>
        <h1>{title}</h1>
        <p>{text}</p>

        <div className="actions">
          {!demo && !connected && (
            <>
              <button className="btn primary" onClick={() => void launch()} disabled={busy}>
                <IconPlay /> {busy ? 'Запускаю…' : 'Запустить tosu'}
              </button>
              <button className="btn ghost" onClick={() => void pick()} disabled={busy}>
                Указать tosu.exe
              </button>
            </>
          )}
          <button className={'btn ' + (demo ? 'ghost' : 'ghost')} onClick={() => onDemo(!demo)}>
            {demo ? 'Выключить демо' : 'Включить демо'}
          </button>
        </div>

        {note && <p className={'idle-note ' + note.tone}>{note.text}</p>}

        {!demo && !connected && (
          <p className="tiny" style={{ maxWidth: 460 }}>
            Если tosu ещё нет —{' '}
            <button
              className="link-btn"
              onClick={() => window.api?.openExternal('https://github.com/tosuapp/tosu/releases')}
            >
              скачать с GitHub
            </button>
            , распаковать куда угодно и нажать «Запустить tosu». Windows спросит UAC — согласись, иначе tosu не увидит
            osu!.
          </p>
        )}

        {demo && (
          <p className="tiny" style={{ maxWidth: 420 }}>
            Демо не трогает игру и ничего не отправляет на сервер.
          </p>
        )}

        {boot && (
          <div className="idle-tip">
            <TipCard
              variant="inline"
              tip={tip}
              onNext={() => setTipIndex((value) => (value + 1) % tips.length)}
              onGo={onTab}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ResultsScreen({
  live,
  accent,
  onOpenPlays,
}: {
  live: LivePayload;
  accent: boolean;
  onOpenPlays?: (mapId?: number) => void;
}) {
  const map = live.beatmap!;
  const play = live.play!;
  const acc = useTween(play.accuracy);
  const coverAccent = useCoverAccent(live.cover);
  const theme = accent ? coverAccent : null;

  return (
    <div className="results" style={theme ? ({ '--pink': theme.a, '--violet': theme.b } as CSSProperties) : undefined}>
      <AnimatePresence>
        <motion.div
          className="results-card"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        >
          <div className="tiny" style={{ letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            {map.artist} — {map.title}
          </div>
          <div className="results-rank">{play.rank || '—'}</div>
          <div className="hero-sub" style={{ justifyContent: 'center', marginTop: 6 }}>
            <span>[{map.version}]</span>
            <span>{fmtNum(map.stars, 2)}★</span>
            <span>{play.mods.length ? play.mods.join(' ') : 'NM'}</span>
          </div>

          <div className="results-grid">
            <div className="results-cell">
              <b>{fmtNum(acc, 2)}%</b>
              <span>точность</span>
            </div>
            <div className="results-cell">
              <b>{isRankedStatus(map.status) ? fmtNum(play.pp.current, 0) : '—'}</b>
              <span>{isRankedStatus(map.status) ? 'pp' : 'без pp'}</span>
            </div>
            <div className="results-cell">
              <b>{fmtInt(play.score)}</b>
              <span>счёт</span>
            </div>
            <div className="results-cell">
              <b>{fmtInt(play.maxCombo)}</b>
              <span>комбо</span>
            </div>
          </div>

          <div className="chips" style={{ justifyContent: 'center', marginTop: 16 }}>
            <span className="chip">
              300 <b>{fmtInt(play.hits['300'])}</b>
            </span>
            <span className="chip">
              100 <b>{fmtInt(play.hits['100'])}</b>
            </span>
            <span className="chip">
              50 <b>{fmtInt(play.hits['50'])}</b>
            </span>
            <span className="chip">
              miss <b>{fmtInt(play.hits.miss)}</b>
            </span>
          </div>

          <div className="results-actions">
            <button className="btn primary" onClick={() => onOpenPlays?.(map.id)}>
              <IconSpark size={14} /> открыть разбор
            </button>
            <PreviewButton setId={map.setId} size={12} label="послушать трек" />
          </div>

          <p className="tiny results-hint">
            <IconSpark size={12} /> разбор последних игр лежит во вкладке «Разборы». Вернёшься в osu! — этот экран
            сменится сам.
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
