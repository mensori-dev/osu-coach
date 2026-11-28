import { useMemo, useState } from 'react';
import type { Bootstrap, MapEntry } from '../types';
import { fmtNum, fmtTime, plural } from '../utils';
import { IconArrowRight, IconSpark, IconStar, IconTarget } from './Icons';
import { PreviewButton } from './Preview';
import { NextStepBanner } from './Progress';
import { Campaign } from './Campaign';
import { openInOsu } from '../openMap';

interface Props {
  boot: Bootstrap;
  onOpenMaps: () => void;
  onShowFinale?: () => void;
}

interface Goal {
  key: string;
  label: string;
  value: number;
  target: number;
  tone: string;
  line: string;
}

const COMFORT_ACC = 92;

function skillGoals(boot: Bootstrap): Goal[] {
  const skills = boot.scan?.skills;
  const comfort = boot.scan?.comfortStar ?? 3.5;
  if (!skills) return [];

  const accuracy = Math.round(skills.accuracy);
  const speed = Math.round(skills.speed ?? skills.accuracy);
  const stamina = Math.round(skills.stamina ?? skills.accuracy);
  const consistency = Math.round(skills.consistency);

  return [
    {
      key: 'accuracy',
      label: 'точность',
      value: accuracy,
      target: 97,
      tone: accuracy < 90 ? 'bad' : accuracy < 96 ? 'ok' : 'good',
      line: `Играй карты на ${fmtNum(Math.max(2, comfort - 0.3), 1)}★, пока не будет 97%+ стабильно.`,
    },
    {
      key: 'speed',
      label: 'скорость',
      value: speed,
      target: 90,
      tone: speed < 75 ? 'bad' : speed < 88 ? 'ok' : 'good',
      line: `Две карты на ${Math.round(skills.speedCut + 10)}+ BPM за сессию, без гонки за комбо.`,
    },
    {
      key: 'stamina',
      label: 'выносливость',
      value: stamina,
      target: 90,
      tone: stamina < 75 ? 'bad' : stamina < 88 ? 'ok' : 'good',
      line: `Одна карта длиннее ${fmtTime((skills.staminaCut + 30) * 1000)} — держи руки расслабленными.`,
    },
    {
      key: 'consistency',
      label: 'стабильность',
      value: consistency,
      target: 90,
      tone: consistency < 70 ? 'bad' : consistency < 85 ? 'ok' : 'good',
      line: `Разрыв с лучшим ${fmtNum(skills.gap, 1)} п.п. — играй серии по 3–4 карты, а не одну на рекорд.`,
    },
  ];
}

/** Maps right below the comfort line where accuracy is close, but not there yet. */
function cleanList(maps: MapEntry[], comfort: number): MapEntry[] {
  return maps
    .filter((map) => map.plays > 0 && map.bestAcc > 0 && map.bestAcc < 97.5 && map.stars <= comfort + 0.2)
    .sort((a, b) => a.bestAcc - b.bestAcc || b.stars - a.stars)
    .slice(0, 6);
}

/** Maps one step above comfort: the place where the ceiling actually moves. */
function pushList(maps: MapEntry[], comfort: number, nextStar: number | null): MapEntry[] {
  const top = nextStar != null ? nextStar + 0.15 : comfort + 0.9;
  return maps
    .filter((map) => map.stars > comfort + 0.2 && map.stars <= top && map.plays <= 8)
    .sort((a, b) => a.stars - b.stars || b.bestAcc - a.bestAcc)
    .slice(0, 6);
}

function GoalCard({ goal }: { goal: Goal }) {
  const pct = Math.max(4, Math.min(100, goal.value));
  const targetPct = Math.max(4, Math.min(100, goal.target));

  return (
    <div className={'card goal-card ' + goal.tone}>
      <div className="goal-head">
        <span>{goal.label}</span>
        <b>{goal.value}</b>
      </div>
      <div className="goal-track">
        <div className="goal-fill" style={{ width: `${pct}%` }} />
        <i style={{ left: `${targetPct}%` }} title={`цель ${goal.target}`} />
      </div>
      <div className="goal-foot">
        <span>сейчас</span>
        <span>цель {goal.target}</span>
      </div>
      <p>{goal.line}</p>
    </div>
  );
}

function PlanRow({ map, reason, onOpen }: { map: MapEntry; reason: string; onOpen: () => void }) {
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
        </div>
        <div className="map-chips">
          <span className="map-chip plan-why">{reason}</span>
          <span className="map-chip">
            {map.plays} {plural(map.plays, 'игра', 'игры', 'игр')}
          </span>
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
        <button className="btn ghost map-go" onClick={onOpen}>
          <IconArrowRight size={14} /> в osu!
        </button>
      </div>
    </div>
  );
}

export function PlanView({ boot, onOpenMaps, onShowFinale }: Props) {
  const scan = boot.scan;
  const maps = useMemo(() => scan?.maps ?? [], [scan]);
  const comfort = scan?.comfortStar ?? 3.5;
  const goals = useMemo(() => skillGoals(boot), [boot]);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'run' | 'skills'>('run');

  const nextStar = useMemo(() => {
    const rows = (scan?.buckets ?? []).filter((bucket) => bucket.count >= 3).sort((a, b) => a.star - b.star);
    const next = rows.find((row) => row.star > comfort && row.median < COMFORT_ACC);
    return next ? next.star : null;
  }, [scan, comfort]);

  const clean = useMemo(() => cleanList(maps, comfort), [maps, comfort]);
  const push = useMemo(() => pushList(maps, comfort, nextStar), [maps, comfort, nextStar]);

  async function open(map: MapEntry) {
    setNote('');
    const message = await openInOsu({ id: map.id, title: map.title });
    if (message) setNote(message.text);
  }

  if (!scan?.ok) {
    return (
      <div className="plan fade-in">
        <div className="card maps-empty">
          <IconTarget size={22} />
          <b>Плана пока нет</b>
          <p className="note">Сначала прочитай базу osu! — тогда посчитаю, где ты проседаешь.</p>
        </div>
      </div>
    );
  }

  const weakest = goals.length ? [...goals].sort((a, b) => a.value - b.value)[0] : null;
  const strongest = goals.length ? [...goals].sort((a, b) => b.value - a.value)[0] : null;

  return (
    <div className="plan fade-in">
      <div className="plan-head">
        <div>
          <div className="card-title">{mode === 'run' ? 'забег по своим картам' : 'план до следующей ступени'}</div>
          <div className="maps-stats">
            <span>
              комфорт <b>{fmtNum(comfort, 1)}★</b>
            </span>
            <span>считаю по твоим скорам, без ИИ</span>
          </div>
        </div>
        <div className="plan-head-actions">
          <div className="seg">
            <button className={mode === 'run' ? 'on' : ''} onClick={() => setMode('run')}>
              забег
            </button>
            <button className={mode === 'skills' ? 'on' : ''} onClick={() => setMode('skills')}>
              навыки
            </button>
          </div>
          <button className="btn ghost" onClick={onOpenMaps}>
            <IconSpark size={13} /> новые карты
          </button>
        </div>
      </div>

      {note && <div className="bd-open-note">{note}</div>}

      {mode === 'run' && <Campaign boot={boot} onOpenMaps={onOpenMaps} onShowFinale={onShowFinale} />}

      {mode === 'skills' && (
        <>
          <NextStepBanner buckets={scan.buckets} comfort={scan.comfortStar} />

          {weakest && strongest && (
            <div className="plan-verdict">
              <IconTarget size={15} />
              <p>
                Слабое место — <b>{weakest.label}</b> ({weakest.value}). Сильное — <b>{strongest.label}</b> (
                {strongest.value}). Это не приговор, а порядок работы: сначала слабое, потом силу закрепляешь.
              </p>
            </div>
          )}

          <div className="goal-grid">
            {goals.map((goal) => (
              <GoalCard key={goal.key} goal={goal} />
            ))}
          </div>

          <section className="plan-section">
            <div className="section-title">
              <IconTarget size={13} /> чистые проходы
            </div>
            <p className="section-note">
              Карты, где ты уже близко к 97%. Здесь растёт точность, а сложность не мешает.
            </p>
            <div className="card map-list plan-list">
              {clean.length ? (
                clean.map((map) => (
                  <PlanRow
                    key={map.id}
                    map={map}
                    reason={`до 97% ещё ${fmtNum(Math.max(0.1, 97 - map.bestAcc), 1)} п.п.`}
                    onOpen={() => void open(map)}
                  />
                ))
              ) : (
                <div className="empty">Нет карт, где точность ниже 97.5% — уже чисто. Переходи к шагу вверх.</div>
              )}
            </div>
          </section>

          <section className="plan-section">
            <div className="section-title">
              <IconStar size={13} /> шаг вверх
            </div>
            <p className="section-note">
              {nextStar != null
                ? `Чуть выше комфорта, но не сразу ${fmtNum(nextStar, 1)}★. Здесь поднимается потолок, а не цифра на табло.`
                : 'Сложность выше комфорта: один-два прохода, чтобы тело привыкло к темпу.'}
            </p>
            <div className="card map-list plan-list">
              {push.length ? (
                push.map((map) => (
                  <PlanRow
                    key={map.id}
                    map={map}
                    reason={`лучшая ${fmtNum(map.bestAcc, 1)}% · цель 92%`}
                    onOpen={() => void open(map)}
                  />
                ))
              ) : (
                <div className="empty">
                  Подходящих карт в базе нет. Открой «Карты» и скачай что-нибудь на {fmtNum(comfort + 0.3, 1)}–
                  {fmtNum(comfort + 0.7, 1)}★.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
