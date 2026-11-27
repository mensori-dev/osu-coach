import { useMemo, useState, type ReactNode } from 'react';
import type { ApiScore, Bootstrap, LivePayload, ScanResult, SegmentStat, SkillProfile } from '../types';
import { fmtInt, fmtNum, fmtPlayTime, fmtRank, fmtTime } from '../utils';
import { buildTips } from '../tips';
import type { Tab } from './TitleBar';
import { MomentumCard, StarLadder } from './Progress';
import { TipCard } from './TipCard';
import { WarmupCard } from './WarmupCard';
import { IconChart, IconRefresh, IconSpark, IconTarget } from './Icons';

interface Props {
  boot: Bootstrap;
  live?: LivePayload | null;
  onRefresh: () => void;
  onTab: (tab: Tab) => void;
}

export function Dashboard({ boot, live, onRefresh, onTab }: Props) {
  const scan = boot.scan;
  const profile = boot.api.profile;
  // tosu pushes the profile with every frame; the osu! API is cached for ten
  // minutes. When the game is open, prefer the live numbers so pp and rank
  // move the moment a play ends.
  const player = live?.player ?? null;
  const name = player?.name || profile?.username || scan?.player || boot.settings.user;
  const initial = name.slice(0, 1).toUpperCase();
  const rank = player?.rank ?? profile?.rank;
  const pp = player?.pp ?? profile?.pp;
  const accuracy = player?.accuracy ?? profile?.accuracy;
  const playCount = player?.playCount ?? profile?.playCount ?? scan?.playsTotal;

  const tips = useMemo(() => buildTips(boot), [boot]);
  const [tipIndex, setTipIndex] = useState(0);
  const tip = tips[tipIndex % tips.length];

  return (
    <div className="dash fade-in">
      <div className="card dash-hero">
        <div className="avatar">{profile?.avatar ? <img src={profile.avatar} alt="" /> : initial}</div>
        <div style={{ minWidth: 0 }}>
          <div className="hero-name">{name}</div>
          <div className="hero-sub">
            {profile?.country && <span>{profile.country}</span>}
            <span>уровень {profile?.level ?? '—'}</span>
            <span>{fmtInt(playCount)} игр</span>
            <span>{fmtPlayTime(profile?.playTime ?? 0)} в игре</span>
          </div>
        </div>
        <div className="hero-stats">
          <Stat label="ранг" value={fmtRank(rank)} />
          <Stat label="pp" value={pp != null ? fmtNum(pp, 0) : '—'} />
          <Stat label="точность" value={accuracy != null ? fmtNum(accuracy, 1) + '%' : '—'} />
          <Stat label="ср. точность" value={scan?.ok ? fmtNum(scan.avgAcc, 1) + '%' : '—'} />
        </div>
      </div>

      <MomentumCard daily={scan?.daily ?? []} scan={scan} />

      <div className="dash-grid">
        <div className="card chart-card ladder-card">
          {scan?.ok ? (
            <StarLadder scan={scan} />
          ) : (
            <div className="empty">
              {scan?.error
                ? `Не удалось прочитать osu!.db: ${scan.error}`
                : 'Нет данных. Запусти сканирование в настройках.'}
            </div>
          )}
        </div>

        <div className="card insight">
          <div className="chart-head" style={{ marginBottom: 2 }}>
            <div className="card-title">что это значит</div>
          </div>
          <InsightList boot={boot} />
        </div>
      </div>

      {scan?.ok && <WarmupCard boot={boot} />}

      <TipCard tip={tip} onNext={() => setTipIndex((value) => (value + 1) % tips.length)} onGo={onTab} />

      {scan?.ok && scan.skills && <SkillProfileCard scan={scan} />}

      <div className="card plays">
        <div className="plays-head">
          <div>
            <div className="card-title">лучшие плеи</div>
            <div className="tiny" style={{ marginTop: 3 }}>
              {boot.api.status.error
                ? 'osu! API: ' + boot.api.status.error
                : boot.api.best.length
                  ? 'по данным osu! API'
                  : 'пока пусто'}
            </div>
          </div>
          <button className="btn ghost" style={{ padding: '7px 12px' }} onClick={onRefresh}>
            <IconRefresh size={13} /> обновить
          </button>
        </div>

        {boot.api.best.length ? (
          <div>
            {boot.api.best.slice(0, 8).map((score, index) => (
              <PlayRow key={score.id} score={score} index={index} />
            ))}
          </div>
        ) : (
          <div className="empty">Нет данных API. Проверь ключи и ник в настройках, потом нажми обновить.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function InsightList({ boot }: { boot: Bootstrap }) {
  const scan = boot.scan;
  const items: { icon: ReactNode; text: ReactNode }[] = [];

  if (!scan?.ok) {
    items.push({
      icon: <IconTarget size={14} />,
      text: <>Локальные данные не прочитаны. Проверь путь к osu! в настройках.</>,
    });
  } else {
    if (scan.comfortStar != null) {
      items.push({
        icon: <IconTarget size={14} />,
        text: (
          <>
            До <b>{fmtNum(scan.comfortStar, 1)}★</b> типичная точность держится на{' '}
            <b>{fmtNum(scan.comfortAcc ?? 0, 1)}%</b>. Это твой текущий потолок.
          </>
        ),
      });
    }

    if (scan.hardStar != null) {
      items.push({
        icon: <IconChart size={14} />,
        text: (
          <>
            На <b>{fmtNum(scan.hardStar, 1)}★</b> медиана падает до <b>{fmtNum(scan.hardAcc ?? 0, 1)}%</b>. Вот где
            уходят pp.
          </>
        ),
      });
    }

    if (scan.playsAboveHard > 0 && scan.hardStar != null) {
      items.push({
        icon: <IconSpark size={14} />,
        text: (
          <>
            <b>{fmtInt(scan.playsAboveHard)}</b> из <b>{fmtInt(scan.playsWithStars)}</b> плеев — на{' '}
            {fmtNum(scan.hardStar, 1)}★ и выше. Выше потолка ты играешь чаще, чем внутри него.
          </>
        ),
      });
    }

    const gap = 95 - scan.avgAcc;
    items.push({
      icon: <IconRefresh size={14} />,
      text: (
        <>
          Средняя точность по всем скорам: <b>{fmtNum(scan.avgAcc, 1)}%</b>.
          {gap > 0 ? (
            <>
              {' '}
              До 95% не хватает <b>{fmtNum(gap, 1)} п.п.</b>
            </>
          ) : (
            ' Это уже хорошо.'
          )}
        </>
      ),
    });
  }

  return (
    <>
      {items.map((item, index) => (
        <div className="insight-item" key={index}>
          <span className="insight-icon">{item.icon}</span>
          <p>{item.text}</p>
        </div>
      ))}
    </>
  );
}

function PlayRow({ score, index }: { score: ApiScore; index: number }) {
  const tone =
    score.acc >= 98 ? 'var(--mint)' : score.acc >= 95 ? 'var(--pink)' : score.acc >= 90 ? 'var(--amber)' : 'var(--red)';

  return (
    <div className="play-row">
      <span className="idx">{index + 1}</span>
      <div className="play-map">
        <b>{score.map.title}</b>
        <span>
          {score.map.artist} · [{score.map.version}]{score.mods.length ? ' · ' + score.mods.join('') : ''}
        </span>
      </div>
      <span className="play-stars">{fmtNum(score.stars, 1)}★</span>
      <span className="play-acc" style={{ color: tone }}>
        {fmtNum(score.acc, 2)}%
      </span>
      <span className="play-pp">
        {fmtNum(score.pp, 0)}
        <span className="tiny"> pp</span>
      </span>
    </div>
  );
}

function skillAxes(s: SkillProfile) {
  return [
    { key: 'accuracy', label: 'точность', value: s.accuracy, note: `медиана по ${fmtInt(s.n)} плеям` },
    {
      key: 'speed',
      label: 'скорость',
      value: s.speed ?? s.accuracy,
      note: `от ${Math.round(s.speedCut)} BPM · ${fmtInt(s.speedN)} плеев`,
    },
    {
      key: 'stamina',
      label: 'выносливость',
      value: s.stamina ?? s.accuracy,
      note: `длиннее ${fmtTime(s.staminaCut * 1000)} · ${fmtInt(s.staminaN)} плеев`,
    },
    { key: 'combo', label: 'комбо', value: s.combo, note: `${fmtNum(s.missRate, 1)}% нот в мисс` },
    {
      key: 'consistency',
      label: 'стабильность',
      value: s.consistency,
      note: `разрыв лучший/медиана ${fmtNum(s.gap, 1)} п.п.`,
    },
  ];
}

function axisTone(value: number): string {
  if (value >= 85) return 'var(--mint)';
  if (value >= 70) return 'var(--pink)';
  if (value >= 55) return 'var(--amber)';
  return 'var(--red)';
}

function SkillRadar({ axes }: { axes: { label: string; value: number }[] }) {
  const width = 380;
  const height = 300;
  const cx = 190;
  const cy = 150;
  const radius = 92;

  const point = (index: number, r: number) => {
    const angle = ((-90 + index * 72) * Math.PI) / 180;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const;
  };

  const ring = (k: number) => axes.map((_, index) => point(index, radius * k).join(',')).join(' ');

  const shape = axes
    .map((axis, index) => point(index, radius * (Math.max(4, Math.min(100, axis.value)) / 100)).join(','))
    .join(' ');

  return (
    <svg className="radar" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="skill-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(155,107,255,0.42)" />
          <stop offset="60%" stopColor="rgba(255,95,162,0.38)" />
          <stop offset="100%" stopColor="rgba(255,192,220,0.22)" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon key={k} points={ring(k)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}

      {axes.map((_, index) => {
        const [x, y] = point(index, radius);
        return <line key={index} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.07)" />;
      })}

      <polygon
        points={shape}
        fill="url(#skill-fill)"
        stroke="rgba(255,143,190,0.9)"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {axes.map((axis, index) => {
        const [x, y] = point(index, radius * (Math.max(4, Math.min(100, axis.value)) / 100));
        return <circle key={index} cx={x} cy={y} r="3.6" fill="#fff" stroke="rgba(255,95,162,0.8)" strokeWidth="2" />;
      })}

      {axes.map((axis, index) => {
        const angle = ((-90 + index * 72) * Math.PI) / 180;
        const x = cx + Math.cos(angle) * (radius + 24);
        const y = cy + Math.sin(angle) * (radius + 24);
        const anchor = Math.abs(Math.cos(angle)) < 0.3 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
        return (
          <text key={axis.label} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="radar-label">
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}

interface Signal {
  key: string;
  title: string;
  detail: string;
  delta: number;
  neutral: boolean;
}

function buildSignals(scan: ScanResult): { strengths: Signal[]; weaknesses: Signal[] } {
  const s = scan.skills;
  const strengths: Signal[] = [];
  const weaknesses: Signal[] = [];

  const add = (signal: Signal) => {
    if (signal.delta >= 1.2) strengths.push(signal);
    else if (signal.delta <= -1.2) weaknesses.push(signal);
    else strengths.push(signal);
  };

  const seg = (key: keyof ScanResult['segments'], title: string, describe: (seg: SegmentStat) => string) => {
    const st = scan.segments?.[key];
    if (!st || st.delta == null || st.high == null || st.low == null) return;
    add({ key, title, detail: describe(st), delta: st.delta, neutral: Math.abs(st.delta) < 1.2 });
  };

  seg(
    'ar',
    `чтение AR ${scan.segments?.ar?.cut ?? ''}+`,
    (st) => `${fmtNum(st.high!, 1)}% против ${fmtNum(st.low!, 1)}% на низком AR`,
  );
  seg(
    'cs',
    `мелкие круги CS ${scan.segments?.cs?.cut ?? ''}+`,
    (st) => `${fmtNum(st.high!, 1)}% против ${fmtNum(st.low!, 1)}% на крупных`,
  );
  seg(
    'bpm',
    `высокий BPM`,
    (st) => `${fmtNum(st.high!, 1)}% на ${Math.round(st.cut)}+ BPM, ${fmtNum(st.low!, 1)}% на остальных`,
  );
  seg('drain', `выносливость`, (st) => `${fmtNum(st.high!, 1)}% на картах длиннее ${fmtTime(st.cut * 1000)}`);

  add({
    key: 'combo',
    title: 'комбо',
    detail: `${fmtNum(100 - s.zeroMiss, 0)}% плеев с миссами · ${fmtNum(s.missRate, 1)}% нот мимо`,
    delta: (s.zeroMiss - 30) / 5,
    neutral: false,
  });

  add({
    key: 'consistency',
    title: 'стабильность',
    detail: `разрыв лучший/медиана ${fmtNum(s.gap, 1)} п.п.`,
    delta: 5 - s.gap,
    neutral: false,
  });

  strengths.sort((a, b) => b.delta - a.delta);
  weaknesses.sort((a, b) => a.delta - b.delta);
  return { strengths: strengths.slice(0, 3), weaknesses: weaknesses.slice(0, 3) };
}

function SkillProfileCard({ scan }: { scan: ScanResult }) {
  const axes = skillAxes(scan.skills);
  const ranked = [...axes].sort((a, b) => b.value - a.value);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const { strengths, weaknesses } = buildSignals(scan);

  return (
    <div className="card profile-card">
      <div className="profile-head">
        <div>
          <div className="card-title">профиль навыков</div>
          <div className="tiny" style={{ marginTop: 3 }}>
            без ИИ: медианы, разрывы и доля миссов по твоим локальным скорам
          </div>
        </div>
        <div className="profile-chips">
          <span className="verdict ok">
            сильно · {best.label} <b>{fmtNum(best.value, 0)}</b>
          </span>
          <span className="verdict warn">
            слабо · {worst.label} <b>{fmtNum(worst.value, 0)}</b>
          </span>
        </div>
      </div>

      <div className="profile-body">
        <SkillRadar axes={axes} />

        <div className="axis-list">
          {axes.map((axis) => (
            <div className="axis-item" key={axis.key}>
              <div className="axis-top">
                <span>{axis.label}</span>
                <b style={{ color: axisTone(axis.value) }}>{fmtNum(axis.value, 0)}</b>
              </div>
              <div className="axis-track">
                <i style={{ width: `${Math.max(3, Math.min(100, axis.value))}%`, background: axisTone(axis.value) }} />
              </div>
              <div className="axis-note">{axis.note}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="signal-grid">
        <div className="signal-col">
          <div className="signal-head good">сильные стороны</div>
          {strengths.map((signal) => (
            <div className="signal-item" key={signal.key}>
              <span className="signal-dot" />
              <div>
                <b>{signal.title}</b>
                <span>{signal.detail}</span>
              </div>
              <em className={signal.neutral ? 'flat' : 'up'}>
                {signal.neutral ? 'ровно' : `${signal.delta > 0 ? '+' : ''}${fmtNum(signal.delta, 1)}`}
              </em>
            </div>
          ))}
        </div>

        <div className="signal-col">
          <div className="signal-head bad">слабые стороны</div>
          {weaknesses.length ? (
            weaknesses.map((signal) => (
              <div className="signal-item" key={signal.key}>
                <span className="signal-dot" />
                <div>
                  <b>{signal.title}</b>
                  <span>{signal.detail}</span>
                </div>
                <em className="down">
                  {signal.delta > 0 ? '+' : ''}
                  {fmtNum(signal.delta, 1)}
                </em>
              </div>
            ))
          ) : (
            <div className="signal-item">
              <span className="signal-dot" />
              <div>
                <b>явных провалов нет</b>
                <span>ни один срез не проседает больше 1 п.п.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="note profile-note">
        {scan.hardStar != null
          ? `На ${fmtNum(scan.hardStar, 1)}★ медиана ${fmtNum(scan.hardAcc ?? 0, 1)}%, а лучший плей — ${fmtNum(
              scan.buckets.find((b) => Math.abs(b.star - scan.hardStar!) < 0.01)?.best ?? 0,
              1,
            )}%. Разрыв между «могу» и «делаю стабильно» и есть точка роста.`
          : 'Держи 97%+ на комфортной сложности — и потолок поднимется сам.'}
      </p>
    </div>
  );
}
