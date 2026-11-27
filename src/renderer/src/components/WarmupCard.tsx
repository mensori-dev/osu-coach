import { useMemo, useState } from 'react';
import type { Bootstrap, MapEntry } from '../types';
import { buildWarmup } from '../warmup';
import { fmtNum, fmtTime, plural } from '../utils';
import { openInOsu } from '../openMap';
import { IconArrowRight, IconStar } from './Icons';
import { PreviewButton } from './Preview';

/**
 * Three maps from the player's own library: wake up, play at the usual level,
 * step above it. Built from installed maps only, so every row opens in osu!.
 */
export function WarmupCard({ boot }: { boot: Bootstrap }) {
  const steps = useMemo(() => buildWarmup(boot.scan), [boot.scan]);
  const [note, setNote] = useState('');

  if (!steps.length) return null;

  const open = async (map: MapEntry) => {
    setNote('');
    const result = await openInOsu({ id: map.id, title: map.title });
    if (result) setNote(result.text);
  };

  return (
    <div className="card warmup">
      <div className="warmup-head">
        <div>
          <div className="card-title">разминка на сегодня</div>
          <div className="tiny" style={{ marginTop: 3 }}>
            три карты из твоей базы · набор меняется раз в день
          </div>
        </div>
        <span className="warmup-total">
          {steps.length} {plural(steps.length, 'шаг', 'шага', 'шагов')}
        </span>
      </div>

      <div className="warmup-list">
        {steps.map((step, index) => (
          <div className="warmup-row" key={step.key}>
            <span className="warmup-idx">{index + 1}</span>
            <div className="warmup-main">
              <div className="warmup-label">{step.label}</div>
              <b>
                {step.map.title}
                <span className="map-diff-inline">[{step.map.diff}]</span>
              </b>
              <div className="warmup-sub">
                {step.map.artist} · лучшая {fmtNum(step.map.bestAcc, 1)}% · {step.hint}
              </div>
            </div>
            <div className="warmup-facts">
              <span className="map-star">
                <IconStar size={11} /> {fmtNum(step.map.stars, 2)}
              </span>
              <span>{Math.round(step.map.bpm)} BPM</span>
              <span>{fmtTime(step.map.drainTime * 1000)}</span>
            </div>
            <div className="warmup-actions">
              <PreviewButton setId={step.map.setId} className="online-preview" size={12} />
              <button className="btn ghost map-go" onClick={() => void open(step.map)} title="Открыть карту в osu!">
                <IconArrowRight size={14} /> в osu!
              </button>
            </div>
          </div>
        ))}
      </div>

      {note && <div className="bd-open-note warmup-note">{note}</div>}
    </div>
  );
}
