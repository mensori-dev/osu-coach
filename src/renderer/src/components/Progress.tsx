import type { ScanBucket, ScanResult } from '../types';
import { fmtInt, fmtNum, plural } from '../utils';
import { IconChart, IconSpark, IconStar } from './Icons';

const COMFORT_ACC = 92;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function barTone(acc: number): string {
  if (acc >= 92) return 'var(--mint)';
  if (acc >= 89) return 'var(--pink)';
  if (acc >= 86) return 'var(--amber)';
  return 'var(--red)';
}

function dayLabel(day: string): string {
  const [, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS[(month || 1) - 1]}`;
}

function delta(value: number, unit: string, digits = 1): string {
  if (Math.abs(value) < 0.05) return 'без изменений';
  return `${value > 0 ? '+' : ''}${fmtNum(value, digits)}${unit}`;
}

/**
 * Accuracy per half-star step, with the current comfort level marked and the
 * next step spelled out. This is the honest answer to "how do I progress":
 * the goal is not pp, it is moving the comfort line one rung up.
 */
export function StarLadder({ scan }: { scan: ScanResult }) {
  const rows = scan.buckets.filter((bucket) => bucket.count >= 3 && bucket.star >= 2).sort((a, b) => a.star - b.star);
  if (!rows.length) {
    return <div className="empty">Ступени появятся, когда в базе будет больше плеев.</div>;
  }

  const comfort = scan.comfortStar;
  const next = comfort != null ? rows.find((row) => row.star > comfort && row.median < COMFORT_ACC) : undefined;
  const need = next ? COMFORT_ACC - next.median : 0;
  const targetLeft = ((COMFORT_ACC - 70) / 30) * 100;

  return (
    <div className="ladder">
      <div className="ladder-head">
        <div>
          <div className="card-title">ступени сложности</div>
          <div className="tiny" style={{ marginTop: 3 }}>
            медиана точности на каждом шаге в ползвезды · пунктир — 92%
          </div>
        </div>
        {comfort != null && <span className="ladder-now">ты здесь · {fmtNum(comfort, 1)}★</span>}
      </div>

      <div className="ladder-rows">
        {rows.map((row) => {
          const isNow = comfort != null && Math.abs(row.star - comfort) < 0.01;
          const isNext = next != null && row.star === next.star;
          const width = Math.max(4, Math.min(100, ((row.median - 70) / 30) * 100));
          return (
            <div className={'rung' + (isNow ? ' now' : '') + (isNext ? ' next' : '')} key={row.star}>
              <span className="rung-star">{fmtNum(row.star, 1)}★</span>
              <div className="rung-track">
                <i style={{ width: `${width}%`, background: barTone(row.median) }} />
                <span className="rung-target" style={{ left: `${targetLeft}%` }} />
              </div>
              <b className="rung-acc" style={{ color: barTone(row.median) }}>
                {fmtNum(row.median, 1)}%
              </b>
              <span className="rung-count">{fmtInt(row.count)}</span>
              {isNow && <span className="rung-tag now">сейчас</span>}
              {isNext && <span className="rung-tag next">цель</span>}
            </div>
          );
        })}
      </div>

      <p className="ladder-foot">
        {next ? (
          <>
            На <b>{fmtNum(next.star, 1)}★</b> медиана {fmtNum(next.median, 1)}%. Ещё <b>{fmtNum(need, 1)} п.п.</b> до
            92% — и ступень станет комфортной. Работай на {fmtNum(next.star - 0.2, 1)}–{fmtNum(next.star, 1)}★, пока
            цифра не выровняется.
          </>
        ) : comfort != null ? (
          <>Выше комфорта всё уже держится на 92%+. Следующая ступень откроется сама — просто играй.</>
        ) : (
          <>Пока мало данных, чтобы отметить комфорт. Сыграй несколько карт одной сложности подряд.</>
        )}
      </p>
    </div>
  );
}

/**
 * Daily accuracy over the last month, taken from scores.db. Unlike the profile
 * history (one point per scan, all inside a single day), this is a real time
 * series: it shows whether the ceiling actually moved.
 */
export function MomentumCard({ daily, scan }: { daily: ScanResult['daily']; scan: ScanResult | null }) {
  const points = (daily ?? []).filter((point) => point.plays > 0);
  const reliable = points.filter((point) => point.plays >= 3);
  const base = reliable[0] ?? points[0];
  const last = points[points.length - 1];

  if (!scan?.ok || !base || !last || points.length < 2) {
    return (
      <div className="card momentum">
        <div className="momentum-head">
          <div>
            <div className="card-title">динамика</div>
            <div className="tiny" style={{ marginTop: 3 }}>
              точность по дням
            </div>
          </div>
        </div>
        <div className="momentum-empty">
          <IconChart size={20} />
          <p>
            Пока один-два дня с плеями. Сыграй ещё пару сессий — здесь появится линия точности по дням, и будет видно,
            растёт она или стоит.
          </p>
        </div>
      </div>
    );
  }

  const gain = last.acc - base.acc;
  const totalPlays = points.reduce((sum, point) => sum + point.plays, 0);
  const best = reliable.length ? reliable.reduce((a, b) => (b.acc > a.acc ? b : a)) : last;
  const maxPlays = Math.max(...points.map((point) => point.plays));

  // Pad the vertical range: a flat line at the exact min/max looks like a wall.
  const values = points.map((point) => point.acc);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(0.6, (hi - lo) * 0.18);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const width = 560;
  const height = 84;
  const coords = values.map(
    (value, index) =>
      [(index / (values.length - 1)) * width, height - ((value - yMin) / (yMax - yMin)) * height] as const,
  );
  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const lastPoint = coords[coords.length - 1];

  const metrics = [
    { label: 'сейчас', value: `${fmtNum(last.acc, 1)}%`, note: dayLabel(last.day), tone: '' },
    {
      label: 'было',
      value: `${fmtNum(base.acc, 1)}%`,
      note: dayLabel(base.day),
      tone: '',
    },
    {
      label: 'прирост',
      value: `${gain >= 0 ? '+' : ''}${fmtNum(gain, 1)}`,
      note: gain >= 0 ? 'п.п. вверх' : 'п.п. вниз',
      tone: gain >= 0 ? 'up' : 'down',
    },
  ];

  return (
    <div className="card momentum">
      <div className="momentum-head">
        <div>
          <div className="card-title">динамика</div>
          <div className="tiny" style={{ marginTop: 3 }}>
            точность по дням · {points.length} активных {points.length === 1 ? 'день' : 'дней'} за месяц
          </div>
        </div>
        <span className={'momentum-badge' + (gain < 0 ? ' down' : '')}>
          <IconSpark size={12} /> {gain >= 0 ? 'вверх' : 'вниз'}
        </span>
      </div>

      <div className="momentum-body">
        <div className="momentum-chart">
          <svg viewBox="0 0 560 84" preserveAspectRatio="none">
            <defs>
              <linearGradient id="mom-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,95,162,0.24)" />
                <stop offset="100%" stopColor="rgba(255,95,162,0)" />
              </linearGradient>
              <linearGradient id="mom-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#9b6bff" />
                <stop offset="100%" stopColor="#ff5fa2" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((k) => (
              <line
                key={k}
                x1="0"
                x2="560"
                y1={84 * k}
                y2={84 * k}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {points.map((point, index) => {
              const x = (index / (points.length - 1)) * width;
              const bar = Math.max(2, (point.plays / maxPlays) * 13);
              return (
                <rect
                  key={point.day}
                  x={x - 1.6}
                  y={height - bar}
                  width={3.2}
                  height={bar}
                  rx={1.2}
                  fill="rgba(155,107,255,0.24)"
                />
              );
            })}
            <path d={area} fill="url(#mom-area)" />
            <path
              d={line}
              fill="none"
              stroke="url(#mom-line)"
              strokeWidth="2.4"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={lastPoint[0]} cy={lastPoint[1]} r="3" fill="#ff5fa2" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="momentum-scale">
            <span>{dayLabel(points[0].day)}</span>
            <span>{dayLabel(last.day)}</span>
          </div>
        </div>

        <div className="momentum-metrics">
          {metrics.map((metric) => (
            <div className="momentum-metric" key={metric.label}>
              <span>{metric.label}</span>
              <b>{metric.value}</b>
              <em className={metric.tone}>{metric.note}</em>
            </div>
          ))}
        </div>
      </div>

      <p className="momentum-foot">
        С {dayLabel(base.day)} точность поднялась с {fmtNum(base.acc, 1)}% до {fmtNum(last.acc, 1)}% — это{' '}
        <b>{delta(gain, ' п.п.')}</b> за {points.length} игровых дней и {fmtInt(totalPlays)} плеев. Лучший день —{' '}
        {dayLabel(best.day)}: {fmtNum(best.acc, 1)}% и {fmtInt(best.plays)}{' '}
        {plural(best.plays, 'плей', 'плея', 'плеев')}.
        {base.plays < 3 ? ' Первый день — один плей, так что смотри на линию, а не на цифру.' : ''}
      </p>
    </div>
  );
}

/** Compact "what to do next" banner reused by the plan and progress screens. */
export function NextStepBanner({ buckets, comfort }: { buckets: ScanBucket[]; comfort: number | null }) {
  if (comfort == null) return null;
  const rows = buckets.filter((bucket) => bucket.count >= 3).sort((a, b) => a.star - b.star);
  const next = rows.find((row) => row.star > comfort && row.median < COMFORT_ACC);
  if (!next) return null;
  const need = COMFORT_ACC - next.median;

  return (
    <div className="next-step">
      <span className="next-step-icon">
        <IconStar size={14} />
      </span>
      <div>
        <b>
          {fmtNum(next.star, 1)}★ · ещё {fmtNum(need, 1)} п.п. до комфорта
        </b>
        <p>
          Сейчас на этой ступени медиана {fmtNum(next.median, 1)}%. Держи 92% на {fmtNum(next.star - 0.3, 1)}–
          {fmtNum(next.star, 1)}★ — тогда {fmtNum(next.star, 1)}★ перестанет быть подвигом.
        </p>
      </div>
    </div>
  );
}
