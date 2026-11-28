import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { CampaignAttempt, CampaignState, CampaignStage } from '../types';
import { fmtNum, plural } from '../utils';
import { IconSpark } from './Icons';

interface Props {
  campaign: CampaignState;
  onClose: () => void;
}

function coverOf(setId: number): string {
  return `https://assets.ppy.sh/beatmaps/${setId}/covers/card.jpg`;
}

function bestOf(stage: CampaignStage): CampaignAttempt | null {
  return stage.best ?? stage.attempts[stage.attempts.length - 1] ?? null;
}

interface Stat {
  label: string;
  value: string;
  note: string;
}

/**
 * The end of the run. Seven covers arrive, collapse, and give way to the
 * numbers: what the run actually was, not another card in the list.
 */
export function Finale({ campaign, onClose }: Props) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [window.setTimeout(() => setPhase(1), 1900), window.setTimeout(() => setPhase(2), 2600)];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const data = useMemo(() => {
    const stages = [...campaign.stages].sort((a, b) => a.index - b.index);
    const rows = stages.map((stage) => ({ stage, best: bestOf(stage) }));
    const judged = rows.filter((row): row is { stage: CampaignStage; best: CampaignAttempt } => Boolean(row.best));

    const avgAcc = judged.length ? judged.reduce((sum, row) => sum + row.best.acc, 0) / judged.length : 0;
    const misses = judged.reduce((sum, row) => sum + row.best.miss, 0);
    const attempts = stages.reduce((sum, stage) => sum + stage.attempts.length, 0);

    const strong = judged.reduce<{ stage: CampaignStage; best: CampaignAttempt } | null>(
      (best, row) => (!best || row.best.acc > best.best.acc ? row : best),
      null,
    );

    const firsts = stages
      .map((stage) => stage.attempts[0])
      .filter((attempt): attempt is CampaignAttempt => Boolean(attempt));
    const firstAvg = firsts.length ? firsts.reduce((sum, attempt) => sum + attempt.acc, 0) / firsts.length : 0;
    const delta = firsts.length ? avgAcc - firstAvg : 0;
    const clean = judged.filter((row) => row.best.miss === 0).length;

    const times = stages.flatMap((stage) => stage.attempts.map((attempt) => attempt.at)).filter((at) => at > 0);
    const first = times.length ? Math.min(...times) : 0;
    const last = times.length ? Math.max(...times) : 0;
    const days = first ? Math.max(1, Math.round((last - first) / 86_400_000)) : 0;

    const growth: Stat =
      delta >= 0.3
        ? {
            label: 'прибавка',
            value: `${delta >= 0 ? '+' : ''}${fmtNum(delta, 1)} п.п.`,
            note: 'первая → лучшая',
          }
        : {
            label: 'чистых карт',
            value: `${clean} из ${stages.length}`,
            note: 'без единого промаха',
          };

    const stats: Stat[] = [
      { label: 'средняя точность', value: `${fmtNum(avgAcc, 2)}%`, note: 'по лучшим попыткам' },
      growth,
      {
        label: 'сильнейшая карта',
        value: strong ? `${fmtNum(strong.best.acc, 2)}%` : '—',
        note: strong ? strong.stage.map.title : '—',
      },
      { label: 'промахов', value: String(misses), note: misses === 0 ? 'ни одного за забег' : 'за весь забег' },
      {
        label: 'попыток',
        value: String(attempts),
        note: `${plural(attempts, 'заход', 'захода', 'заходов')} на ${stages.length} карт`,
      },
      {
        label: 'времени',
        value: days <= 1 ? 'один вечер' : `${days} ${plural(days, 'день', 'дня', 'дней')}`,
        note: 'от первой попытки до последней',
      },
    ];

    return { stages, rows, avgAcc, stats, attempts };
  }, [campaign]);

  const { stages, rows, stats, attempts } = data;
  const done = campaign.progress.done;
  const total = campaign.progress.total;

  return (
    <motion.div
      className="finale"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
    >
      <div className="finale-scrim" onClick={onClose} />
      <motion.div
        className="finale-box"
        role="dialog"
        aria-modal="true"
        aria-label="забег пройден"
        initial={{ opacity: 0, y: 26, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      >
        <div className="finale-top">
          <span className="finale-kicker">
            <IconSpark size={13} /> забег пройден
          </span>
          <span className="finale-sub">
            {stages.length} карт · {attempts} {plural(attempts, 'заход', 'захода', 'заходов')}
          </span>
        </div>

        <div className="finale-stage">
          <motion.div
            className="finale-row"
            animate={phase === 0 ? { opacity: 1 } : { opacity: 0, scale: 0.55, filter: 'blur(8px)' }}
            transition={{ duration: 0.45, ease: 'easeIn' }}
          >
            {rows.map(({ stage }, index) => (
              <motion.div
                key={stage.index}
                className="finale-card"
                initial={{ opacity: 0, y: 70, rotate: index % 2 ? 2.5 : -2.5 }}
                animate={phase === 0 ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 0, y: -24, scale: 0.75 }}
                transition={
                  phase === 0
                    ? { delay: 0.14 + index * 0.07, type: 'spring', stiffness: 230, damping: 22 }
                    : { delay: index * 0.02, duration: 0.32 }
                }
              >
                <div className="finale-cover" style={{ backgroundImage: `url("${coverOf(stage.map.setId)}")` }}>
                  <span className="finale-check">✓</span>
                </div>
                <span className="finale-card-name">{stage.map.title}</span>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            className="finale-result"
            initial={{ opacity: 0 }}
            animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="finale-count"
              initial={{ opacity: 0, scale: 0.72 }}
              animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.72 }}
              transition={{ type: 'spring', stiffness: 190, damping: 17 }}
            >
              {done}
              <i>/</i>
              {total}
            </motion.div>
            <div className="finale-label">этапов закрыто</div>

            <motion.div
              className="finale-stats"
              initial="hidden"
              animate={phase >= 2 ? 'show' : 'hidden'}
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
            >
              {stats.map((stat) => (
                <motion.div
                  className="finale-stat"
                  key={stat.label}
                  variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span>{stat.label}</span>
                  <b>{stat.value}</b>
                  <em>{stat.note}</em>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        <div className="finale-foot">
          <button className="btn primary" onClick={onClose}>
            закрыть
          </button>
          <span className="finale-hint">Esc — закрыть. Открыть снова можно в «Плане».</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
