import { useMemo, useState } from 'react';
import type { Bootstrap, FreshPlay, ScanBucket, ScanPlay } from '../types';
import { accTone, fmtNum, fmtTime, plural } from '../utils';
import { IconArrowRight, IconSpark, IconStar, IconTarget } from './Icons';
import { PreviewButton } from './Preview';
import { openInOsu } from '../openMap';

interface Props {
  boot: Bootstrap;
  fresh: FreshPlay | null;
  onScan: () => void;
}

const MOD_LABEL: Record<string, string> = {
  NM: 'NM',
  HD: 'HD',
  HR: 'HR',
  DT: 'DT',
  EZ: 'EZ',
  FL: 'FL',
  HT: 'HT',
  NC: 'NC',
  SO: 'SO',
  SD: 'SD',
  PF: 'PF',
};

function when(at: number): string {
  if (!at) return 'только что';
  return new Date(at).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function modsText(mods: string[]): string {
  if (!mods.length) return 'NM';
  return mods.map((mod) => MOD_LABEL[mod] ?? mod).join('');
}

/** Expected accuracy on this star rating, from the player's own buckets. */
function expectedAcc(buckets: ScanBucket[] | undefined, stars: number | null) {
  if (!buckets?.length || stars == null) return null;
  const sorted = [...buckets].filter((bucket) => bucket.count > 0).sort((a, b) => a.star - b.star);
  if (!sorted.length) return null;

  let best = sorted[0];
  for (const bucket of sorted) {
    if (Math.abs(bucket.star - stars) < Math.abs(best.star - stars)) best = bucket;
  }
  return best.median || best.acc || null;
}

interface Verdict {
  tone: 'good' | 'ok' | 'bad';
  title: string;
  text: string;
  advice: string;
}

function verdictFor(play: ScanPlay, expected: number | null, repeated: number): Verdict {
  const delta = expected == null ? null : play.acc - expected;

  if (play.miss >= 5) {
    return {
      tone: 'bad',
      title: 'миссы съели карту',
      text: `Промахов ${play.miss}. При такой точности ${fmtNum(play.acc, 2)}% комбо рвётся постоянно, и pp уходит в ноль.`,
      advice:
        'Скинь 0.2–0.3★ и сыграй эту же карту на чистоту. Один прогон без миссов даст больше, чем пять с промахами.',
    };
  }

  if (delta != null && delta >= 1.5 && play.miss === 0) {
    return {
      tone: 'good',
      title: 'сильнее обычного',
      text: `Точность ${fmtNum(play.acc, 2)}% — на ${fmtNum(delta, 1)} пункта выше твоего обычного уровня на ${fmtNum(play.stars ?? 0, 1)}★.`,
      advice: 'Закрепляй: сыграй её ещё 2–3 раза, пока результат стабильный. Потом можно шагнуть на +0.2★.',
    };
  }

  if (delta != null && delta <= -1.5) {
    return {
      tone: 'bad',
      title: 'ниже твоего уровня',
      text: `Точность ${fmtNum(play.acc, 2)}% — на ${fmtNum(Math.abs(delta), 1)} пункта ниже обычного.`,
      advice:
        play.miss > 0
          ? 'Сначала убери промахи: играй медленнее по рукам, а не по глазам. Карта пока не твоя.'
          : 'Скорее всего устал или карта неудобная по ритму. Вернись к ней в начале сессии, на свежих руках.',
    };
  }

  if (play.miss > 0) {
    return {
      tone: 'ok',
      title: 'почти, но промахи',
      text: `Точность ${fmtNum(play.acc, 2)}% держится, но ${play.miss} ${plural(play.miss, 'промах', 'промаха', 'промахов')} ${play.miss === 1 ? 'ломает' : 'ломают'} комбо.`,
      advice: 'Найди место, где сыпешься: обычно это самый плотный участок. Прогони карту в редакторе или на 0.9x.',
    };
  }

  return {
    tone: 'ok',
    title: 'ровно, в своём коридоре',
    text:
      expected == null
        ? `Точность ${fmtNum(play.acc, 2)}%, промахов нет.`
        : `Точность ${fmtNum(play.acc, 2)}% при обычных ${fmtNum(expected, 1)}% на этой сложности.`,
    advice:
      repeated > 15
        ? 'Ты играешь её часто. Попробуй соседнюю карту того же маппера — навык перенесётся, а свежесть вернётся.'
        : 'Это рабочий результат. Чтобы росло, добавь чуть больше скорости или длины, а не сложности.',
  };
}

function goalAcc(play: ScanPlay, expected: number | null): number {
  const base = expected == null ? play.acc + 2 : Math.max(play.acc + 1, expected);
  return Math.min(99.5, base);
}

/** Three concrete things to try on the next run. Deterministic, same numbers as the verdict. */
function nextSteps(play: ScanPlay, expected: number | null): string[] {
  const stars = play.stars ?? 3.5;

  if (play.miss > 0) {
    return [
      `Сбрось до ${fmtNum(Math.max(1.5, stars - 0.3), 1)}★ — на этой сложности миссы ещё лезут.`,
      `Цель — ноль промахов и ${fmtNum(Math.min(99.5, Math.max(play.acc + 2, expected ?? play.acc + 2)), 1)}% точности.`,
      'Три карты подряд без миссов, и только потом возвращайся сюда.',
    ];
  }

  if (play.acc < 95) {
    return [
      'Комбо чистое — не хватает ритма. Слушай бит, а не смотри на круги.',
      `Держи ${fmtNum(Math.min(99.5, play.acc + 1.5), 1)}% — это уже следующий уровень.`,
      'Одна карта на +0.2★ за сессию, без спешки.',
    ];
  }

  return [
    `Держи эту же карту — ${fmtNum(Math.min(99.5, play.acc + 1), 1)}% уже рядом.`,
    'Добавь одну карту на +0.2★: комбо и точность держатся.',
    'Не гонись за pp — сначала стабильность на этой сложности.',
  ];
}

export function PlaysView({ boot, fresh, onScan }: Props) {
  const scan = boot.scan;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mapNote, setMapNote] = useState('');
  const [opening, setOpening] = useState(false);

  // A run that osu! has not written to scores.db yet. Once the db has it,
  // the db copy wins and the in-memory one is dropped.
  const showFresh = useMemo(() => {
    if (!fresh) return false;
    return !(scan?.recent ?? []).some((play) => play.id === fresh.id && Math.abs(play.acc - fresh.acc) < 0.01);
  }, [fresh, scan]);

  const recent = useMemo<ScanPlay[]>(() => {
    const base = scan?.recent ?? [];
    const freshRow = showFresh && fresh ? [fresh] : [];
    return [...freshRow, ...base].slice(0, 10);
  }, [scan, fresh, showFresh]);

  const byId = useMemo(() => new Map((scan?.maps ?? []).map((map) => [map.id, map])), [scan]);

  const selected = useMemo(() => {
    if (!recent.length) return null;
    return recent.find((play) => play.id === selectedId) ?? recent[0];
  }, [recent, selectedId]);

  const meta = useMemo(() => {
    if (!selected) return undefined;
    const known = byId.get(selected.id);
    if (known) return known;
    if (showFresh && fresh && selected.id === fresh.id) {
      return {
        setId: fresh.setId,
        bpm: fresh.bpm,
        ar: fresh.ar,
        drainTime: fresh.drainTime,
        plays: 0,
        bestAcc: 0,
      };
    }
    return undefined;
  }, [byId, selected, showFresh, fresh]);

  if (!scan?.ok) {
    return (
      <div className="bd fade-in">
        <div className="card maps-empty">
          <IconTarget size={22} />
          <b>Пока нечего разбирать</b>
          <p className="note">Сначала прочитай базу osu! — тогда появятся последние игры.</p>
          <button className="btn" onClick={onScan}>
            сканировать
          </button>
        </div>
      </div>
    );
  }

  if (!recent.length) {
    return (
      <div className="bd fade-in">
        <div className="card maps-empty">
          <IconTarget size={22} />
          <b>Игр пока нет</b>
          <p className="note">Сыграй пару карт, и здесь появятся разборы последних десяти.</p>
        </div>
      </div>
    );
  }

  const expected = expectedAcc(scan.buckets, selected?.stars ?? null);
  const verdict = selected ? verdictFor(selected, expected, meta?.plays ?? 0) : null;

  return (
    <div className="bd fade-in">
      <div className="bd-head">
        <div>
          <div className="card-title">разборы игр</div>
          <div className="maps-stats">
            <span>
              последние <b>{recent.length}</b> {plural(recent.length, 'игра', 'игры', 'игр')}
            </span>
            <span>{showFresh ? 'свежая — уже из tosu' : 'без ИИ, только цифры'}</span>
          </div>
        </div>
      </div>

      <div className="bd-grid">
        <div className="card bd-list">
          {recent.map((play) => (
            <button
              key={`${play.id}-${play.at}`}
              className={'bd-row tone-' + accTone(play.acc) + (selected?.at === play.at ? ' on' : '')}
              onClick={() => {
                setSelectedId(play.id);
                setMapNote('');
              }}
            >
              <div className="bd-row-main">
                <b>{play.title}</b>
                <span>
                  {play.artist || 'карта не в базе'}
                  {play.diff ? ` · [${play.diff}]` : ''}
                </span>
              </div>
              <div className="bd-row-facts">
                <span className="bd-acc">{fmtNum(play.acc, 2)}%</span>
                {play.stars ? <span>{fmtNum(play.stars, 1)}★</span> : null}
                <span className={play.miss > 0 ? 'bd-miss' : 'bd-clean'}>
                  {play.miss > 0 ? `${play.miss} miss` : 'FC'}
                </span>
              </div>
              <div className="bd-row-time">{when(play.at)}</div>
            </button>
          ))}
        </div>

        {selected && verdict && (
          <div className="card bd-detail">
            <div className="bd-detail-top">
              <div className="bd-title-wrap">
                <div className="bd-title">{selected.title}</div>
                <div className="bd-sub">
                  {selected.artist || 'карта не в базе'}
                  {selected.diff ? ` · [${selected.diff}]` : ''}
                  {selected.mapper ? ` · ${selected.mapper}` : ''}
                </div>
                <div className="bd-tags">
                  {selected.stars ? <span>{fmtNum(selected.stars, 2)}★</span> : null}
                  {meta && <span>{Math.round(meta.bpm)} BPM</span>}
                  {meta && <span>AR {fmtNum(meta.ar, 1)}</span>}
                  <span>{modsText(selected.mods)}</span>
                  <span>
                    {meta?.plays ? `${meta.plays} ${plural(meta.plays, 'раз', 'раза', 'раз')}` : 'первый раз'}
                  </span>
                </div>
              </div>
              <div className="bd-actions">
                <PreviewButton setId={meta?.setId ?? 0} size={12} label="трек" />
                <button
                  className="btn ghost bd-open"
                  disabled={!selected.id || opening}
                  title={selected.id ? 'Открыть карту в osu!' : 'Карты нет в базе osu! — открывать нечего'}
                  onClick={() => {
                    if (!selected.id || opening) return;
                    setMapNote('');
                    setOpening(true);
                    void openInOsu({ id: selected.id, title: selected.title }).then((note) => {
                      setOpening(false);
                      if (note) setMapNote(note.text);
                    });
                  }}
                >
                  <IconArrowRight size={14} /> {opening ? 'открываю…' : 'в osu!'}
                </button>
              </div>
            </div>

            {mapNote && <div className="bd-open-note">{mapNote}</div>}

            <div className={'bd-hero ' + verdict.tone}>
              <span className="bd-hero-mark">
                {verdict.tone === 'bad' ? <IconTarget size={19} /> : <IconSpark size={19} />}
              </span>
              <div className="bd-hero-body">
                <b>{verdict.title}</b>
                <p>{verdict.text}</p>
              </div>
              {expected != null && (
                <div className="bd-hero-delta">
                  <b className={selected.acc >= expected ? 'up' : 'down'}>
                    {selected.acc >= expected ? '+' : ''}
                    {fmtNum(selected.acc - expected, 1)}
                  </b>
                  <span>п.п. к обычному</span>
                </div>
              )}
            </div>

            <div className="bd-metrics">
              <div className="bd-metric acc">
                <span>точность</span>
                <b>
                  {fmtNum(selected.acc, 2)}
                  <i>%</i>
                </b>
                <div className="bd-meter">
                  <i style={{ width: `${Math.max(2, Math.min(100, selected.acc))}%` }} />
                </div>
              </div>
              <div className="bd-metric">
                <span>промахи</span>
                <b>{selected.miss}</b>
                <em>{selected.miss === 0 ? 'чисто' : 'рвут комбо'}</em>
              </div>
              <div className="bd-metric">
                <span>комбо</span>
                <b>{selected.combo}</b>
                <em>{modsText(selected.mods)}</em>
              </div>
              <div className="bd-metric">
                <span>длина</span>
                <b>{meta ? fmtTime(meta.drainTime * 1000) : '—'}</b>
                <em>
                  {meta?.plays ? `играл ${meta.plays} ${plural(meta.plays, 'раз', 'раза', 'раз')}` : 'первый раз'}
                </em>
              </div>
            </div>

            <div className="bd-next">
              <div className="bd-next-head">
                <IconTarget size={13} />
                <b>следующая попытка</b>
                <span className="bd-next-goal">цель {fmtNum(goalAcc(selected, expected), 1)}%</span>
              </div>
              <ol>
                {nextSteps(selected, expected).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="bd-see">
              <IconStar size={12} />
              <p>
                Приложение видит твои нажатия, тайминги, точность и комбо. Расположение кругов и паттерны карты оно не
                разбирает — для этого нужен разбор самого файла карты, этого пока нет.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
