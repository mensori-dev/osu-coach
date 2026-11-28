import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bootstrap, CampaignStage, CampaignState } from '../types';
import { bridge } from '../hooks';
import { fmtNum, fmtTime, plural } from '../utils';
import { IconArrowRight, IconDownload, IconSpark, IconStar, IconTarget } from './Icons';
import { PreviewButton } from './Preview';
import { openInOsu } from '../openMap';

interface Props {
  boot: Bootstrap;
  onOpenMaps: () => void;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Consecutive days with at least one play, ending today or yesterday. */
function dayStreak(daily: { day: string }[]): number {
  const days = new Set(daily.map((item) => item.day));
  if (!days.size) return 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function attemptLine(acc: number, miss: number): string {
  return `${fmtNum(acc, 1)}% · ${miss} ${plural(miss, 'промах', 'промаха', 'промахов')}`;
}

interface Verdict {
  delta: number;
  improved: number;
  total: number;
  headline: string;
  body: string;
}

function avg(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function verdictOf(campaign: CampaignState): Verdict | null {
  const rows: { first: number; best: number }[] = [];
  for (const stage of campaign.stages) {
    const first = stage.attempts[0];
    const best = stage.best;
    if (!first || !best) continue;
    rows.push({ first: first.acc, best: best.acc });
  }
  if (rows.length < 3) return null;

  const firstAvg = avg(rows.map((row) => row.first));
  const bestAvg = avg(rows.map((row) => row.best));
  const delta = bestAvg - firstAvg;
  const improved = rows.filter((row) => row.best - row.first >= 0.25).length;

  if (delta >= 2) {
    return {
      delta,
      improved,
      total: rows.length,
      headline: 'заметно прибавил',
      body: `на тех же картах точность выросла на ${fmtNum(delta, 1)} п.п. — это уже не дрожание рук, а привычка.`,
    };
  }
  if (delta >= 0.6) {
    return {
      delta,
      improved,
      total: rows.length,
      headline: 'прибавил',
      body: `плюс ${fmtNum(delta, 1)} п.п. к первой попытке. Ровно то, что даёт спокойный повтор, а не новый скилл.`,
    };
  }
  if (delta >= 0.1) {
    return {
      delta,
      improved,
      total: rows.length,
      headline: 'освоился',
      body: `цифры почти те же (+${fmtNum(delta, 1)} п.п.). Карты перестали пугать, но потолок пока не сдвинулся.`,
    };
  }
  return {
    delta,
    improved,
    total: rows.length,
    headline: 'потолок рядом',
    body: 'на этих картах прибавки нет. Это не провал: значит, пора брать новые, а не дожимать старые.',
  };
}

export function Campaign({ boot, onOpenMaps }: Props) {
  const scan = boot.scan;
  const [local, setLocal] = useState<CampaignState | null>(null);
  const [clearedAt, setClearedAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [installed, setInstalled] = useState<number[]>([]);
  const [downloadId, setDownloadId] = useState(0);
  const asked = useRef(false);

  // The main process pushes a fresh campaign after every play. Prefer whichever
  // copy is newer: the pushed one or the one this screen just built.
  const campaign = useMemo(() => {
    const remote = boot.campaign && boot.campaign.createdAt > clearedAt ? boot.campaign : null;
    if (!local) return remote;
    if (!remote) return local;
    return remote.updatedAt > local.updatedAt ? remote : local;
  }, [local, boot.campaign, clearedAt]);

  const refreshInstalled = useCallback(() => {
    bridge
      .installedSets()
      .then(setInstalled)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshInstalled();
  }, [refreshInstalled]);

  const plan = useCallback(async () => {
    setLoading(true);
    setNote('');
    try {
      const result = await bridge.campaignPlan();
      if (result.campaign) setLocal(result.campaign);
      else setNote('Собрать забег не вышло: база карт не прочитана. Загляни в настройки и запусти сканирование.');
    } catch (err) {
      setNote(`Собрать забег не вышло: ${err instanceof Error ? err.message : String(err)}.`);
    } finally {
      setLoading(false);
    }
  }, []);

  // First visit with a readable library: build the run right away, no empty
  // screen with a button in the middle.
  useEffect(() => {
    if (campaign || loading || !scan?.ok || asked.current) return;
    asked.current = true;
    void plan();
  }, [campaign, loading, plan, scan?.ok]);

  const stages = useMemo(() => campaign?.stages ?? [], [campaign]);
  const done = campaign?.progress.done ?? 0;
  const total = campaign?.progress.total ?? 0;
  const current = stages.find((stage) => !stage.passed) ?? null;
  const allPassed = total > 0 && done === total;
  const verdict = campaign && allPassed ? verdictOf(campaign) : null;
  const streak = useMemo(() => dayStreak(scan?.daily ?? []), [scan?.daily]);
  const installedSets = useMemo(() => new Set(installed), [installed]);

  const records = useMemo(
    () =>
      (scan?.maps ?? [])
        .filter((map) => map.plays >= 2 && map.bestAcc > 0)
        .sort((a, b) => b.bestAcc - a.bestAcc)
        .slice(0, 4),
    [scan?.maps],
  );

  const minutes = useMemo(() => {
    if (!stages.length) return 0;
    const seconds = stages.reduce((sum, stage) => sum + stage.map.drainTime, 0);
    return Math.round((seconds / 60) * 1.4);
  }, [stages]);

  async function download(stage: CampaignStage) {
    setDownloadId(stage.map.setId);
    setNote('');
    try {
      const result = await bridge.downloadMap(stage.map.setId);
      if (result.ok && result.opened) {
        setNote(`«${stage.map.title}» ушла в osu!, он импортирует сам. Через пару секунд можно жать «в osu!».`);
        [2000, 6000, 12000].forEach((ms) => window.setTimeout(refreshInstalled, ms));
      } else if (result.ok) {
        setNote('Карта в загрузках, но osu! файл не подхватил. Открой его вручную из папки загрузок.');
      } else {
        setNote(`Скачать не вышло (${result.error || 'ошибка'}). Открою страницу карты в браузере.`);
        void bridge.openExternal(`https://osu.ppy.sh/beatmapsets/${stage.map.setId}`);
      }
    } catch (err) {
      setNote(`Скачать не вышло: ${err instanceof Error ? err.message : String(err)}.`);
    } finally {
      setDownloadId(0);
    }
  }

  async function open(stage: CampaignStage) {
    setNote('');
    const message = await openInOsu({ id: stage.map.id, title: stage.map.title });
    if (message) setNote(message.text);
  }

  async function rebuild() {
    setClearedAt(Date.now());
    setLocal(null);
    await bridge.campaignReset();
    asked.current = false;
    await plan();
  }

  if (!scan?.ok) {
    return (
      <div className="card maps-empty">
        <IconTarget size={22} />
        <b>Забег пока не собрать</b>
        <p className="note">Сначала прочитай базу osu! — этапы собираются из твоих карт и твоего комфорта.</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="run-intro card">
        <div className="run-intro-mark">
          <IconSpark size={18} />
        </div>
        <div>
          <b>{loading ? 'собираю забег…' : 'забег на вечер'}</b>
          <p>
            Семь карт подряд, от твоего комфорта и выше. Цель по точности и промахам считается из твоих же результатов,
            а не из таблицы сложности. Ретраи без лимита, в зачёт идёт лучшая попытка.
          </p>
          <p className="note">
            Этапы отмечаются сами, как только osu! запишет счёт. Финальная карта — новая, под твой вкус.
          </p>
          {!loading && (
            <button className="btn" onClick={() => void plan()}>
              <IconTarget size={14} /> собрать забег
            </button>
          )}
        </div>
        {note && <div className="bd-open-note">{note}</div>}
      </div>
    );
  }

  return (
    <div className="run">
      <div className="run-head card">
        <div className="run-head-main">
          <div className="run-title">
            забег · <b>{done}</b> из {total}
          </div>
          <div className="run-sub">
            комфорт {fmtNum(campaign.comfortStar, 1)}★ · база точности {fmtNum(campaign.baseAcc, 1)}% · ≈{minutes}{' '}
            {plural(minutes, 'минута', 'минуты', 'минут')}
            {streak > 1 ? ` · ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд` : ''}
          </div>
        </div>
        <div className="run-bar" aria-hidden>
          <i style={{ width: `${total ? Math.max(3, (done / total) * 100) : 0}%` }} />
        </div>
        <div className="run-track">
          {stages.map((stage) => {
            const state = stage.passed ? 'done' : stage === current ? 'current' : 'locked';
            return (
              <span
                key={stage.index}
                className={'run-node ' + state}
                title={`этап ${stage.index} · ${stage.map.title} [${stage.map.diff}]`}
              >
                {stage.passed ? '✓' : stage.index}
              </span>
            );
          })}
        </div>
      </div>

      {note && <div className="bd-open-note">{note}</div>}

      {allPassed && verdict && (
        <div className="run-verdict card">
          <div className="run-verdict-head">
            <IconSpark size={16} />
            <b>{verdict.headline}</b>
            <span className={verdict.delta >= 0 ? 'good' : 'dim'}>
              {verdict.delta >= 0 ? '+' : ''}
              {fmtNum(verdict.delta, 1)} п.п.
            </span>
          </div>
          <p>{verdict.body}</p>
          <p className="note">
            Улучшил {verdict.improved} из {verdict.total} карт. Считаю первую и лучшую попытку на каждой — поэтому часть
            прибавки это разогрев, а не новый скилл. Настоящий рост покажет только карта, которую ты ещё не играл.
          </p>
        </div>
      )}

      <div className="run-stages">
        {stages.map((stage) => {
          const state = stage.passed ? 'done' : stage === current ? 'current' : 'locked';
          const isNew = stage.source === 'new';
          const has = installedSets.has(stage.map.setId);
          return (
            <div className={'run-stage card ' + state} key={stage.index}>
              <div className="run-stage-head">
                <span className="run-stage-num">{stage.passed ? '✓' : stage.index}</span>
                <div className="run-stage-map">
                  <div className="map-line">
                    <b>{stage.map.title}</b>
                    <span className="map-diff-inline">[{stage.map.diff}]</span>
                  </div>
                  <div className="map-sub">
                    {stage.map.artist}
                    {stage.map.mapper ? ` · ${stage.map.mapper}` : ''}
                  </div>
                </div>
                <div className="run-stage-facts">
                  <span className="map-star">
                    <IconStar size={11} /> {fmtNum(stage.map.stars, 2)}
                  </span>
                  <span>{Math.round(stage.map.bpm)} BPM</span>
                  <span>{fmtTime(stage.map.drainTime * 1000)}</span>
                </div>
              </div>

              <div className="run-criteria">
                <span className="run-goal">
                  точность <b>≥ {fmtNum(stage.targetAcc, 1)}%</b>
                </span>
                <span className="run-goal">
                  промахов <b>≤ {stage.maxMiss}</b>
                </span>
                <span className="run-goal dim">≈{stage.notes} нот</span>
                {isNew && <span className="map-chip run-new">новая карта</span>}
                {stage.passed && stage.best && (
                  <span className="run-done-chip">лучшая {fmtNum(stage.best.acc, 1)}%</span>
                )}
              </div>

              {state === 'current' && (
                <>
                  <p className="run-hint">
                    {stage.attempts.length
                      ? `Пока не зачтено. Лучшая попытка: ${attemptLine(stage.best?.acc ?? 0, stage.best?.miss ?? 0)}. Ещё раз — и зачтётся.`
                      : 'Сыграй карту. Этап отметится сам, как только osu! запишет счёт — реплей и кнопки не нужны.'}
                  </p>
                  {stage.attempts.length > 0 && (
                    <div className="run-attempts">
                      {stage.attempts.slice(-4).map((attempt) => (
                        <span
                          key={`${attempt.at}-${attempt.acc}`}
                          className={'run-attempt ' + (attempt.passed ? 'ok' : 'bad')}
                        >
                          {attemptLine(attempt.acc, attempt.miss)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="run-actions">
                    {isNew && !has ? (
                      <button
                        className="btn"
                        onClick={() => void download(stage)}
                        disabled={downloadId === stage.map.setId}
                      >
                        <IconDownload size={14} /> {downloadId === stage.map.setId ? 'качаю…' : 'скачать карту'}
                      </button>
                    ) : (
                      <button className="btn" onClick={() => void open(stage)}>
                        <IconArrowRight size={14} /> в osu!
                      </button>
                    )}
                    <PreviewButton setId={stage.map.setId} className="online-preview" size={12} />
                    {isNew && (
                      <span className="run-new-note">
                        {campaign.newMapSource === 'osu'
                          ? 'подобрана под твой вкус'
                          : 'из твоей базы — osu! API сейчас недоступен'}
                      </span>
                    )}
                    {!isNew && stage.index === total && campaign.newMapSource === 'library' && (
                      <span className="run-new-note">новая карта не нашлась — эта из твоей базы</span>
                    )}
                  </div>
                </>
              )}

              {state === 'done' && stage.best && (
                <div className="run-attempts">
                  <span className="run-attempt ok">лучшая {attemptLine(stage.best.acc, stage.best.miss)}</span>
                  {stage.attempts.length > 1 && (
                    <span className="run-attempt dim">
                      {stage.attempts.length} {plural(stage.attempts.length, 'попытка', 'попытки', 'попыток')}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {records.length > 0 && (
        <section className="run-records">
          <div className="section-title">
            <IconStar size={13} /> личные рекорды
          </div>
          <div className="card run-record-list">
            {records.map((map) => (
              <div className="run-record" key={map.id}>
                <span className="run-record-acc">{fmtNum(map.bestAcc, 2)}%</span>
                <span className="run-record-name">
                  {map.title} <i>[{map.diff}]</i>
                </span>
                <span className="run-record-plays">
                  {map.plays} {plural(map.plays, 'плей', 'плея', 'плеев')}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="run-foot">
        <button className="link-btn" onClick={() => void rebuild()}>
          собрать забег заново
        </button>
        <button className="link-btn" onClick={onOpenMaps}>
          поискать новые карты
        </button>
      </div>
    </div>
  );
}
