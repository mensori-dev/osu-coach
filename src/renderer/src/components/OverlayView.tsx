import { useLive } from '../hooks';
import { fmtNum, fmtTime } from '../utils';

export function OverlayView() {
  const live = useLive();
  const map = live?.beatmap;
  const play = live?.play;
  const active = Boolean(map && play && (live?.state === 'playing' || live?.state === 'paused'));

  if (!active || !map || !play) {
    return (
      <div className="ov ov-idle">
        <span className="ov-dot" />
        osu! coach · жду игру
      </div>
    );
  }

  const progress = Math.max(0, Math.min(1, play.progress));
  const misses = play.hits.miss;

  return (
    <div className="ov">
      <div className="ov-top">
        <div className="ov-map">
          <b>{map.title}</b>
          <span>
            {map.artist} · [{map.version}]
          </span>
        </div>
        <div className="ov-stars">{fmtNum(map.stars, 1)}★</div>
      </div>

      <div className="ov-mid">
        <div className="ov-acc">
          <b>{fmtNum(play.accuracy, 2)}</b>
          <span>%</span>
        </div>
        <div className="ov-combo">
          комбо <b>{play.combo}</b>
          <i>/{map.maxCombo}</i>
        </div>
        <div className="ov-stats">
          <div>
            <span>pp</span>
            <b>{fmtNum(play.pp.current, 0)}</b>
          </div>
          <div>
            <span>FC</span>
            <b>{fmtNum(play.pp.fc, 0)}</b>
          </div>
          <div>
            <span>UR</span>
            <b>{fmtNum(play.ur, 0)}</b>
          </div>
        </div>
      </div>

      <div className="ov-hits">
        <span className="h300">{play.hits['300']}</span>
        <span className="h100">{play.hits['100']}</span>
        <span className="h50">{play.hits['50']}</span>
        <span className={misses ? 'hmiss bad' : 'hmiss'}>{misses}</span>
        <div className="ov-mods">{play.mods.length ? play.mods.join('') : 'NM'}</div>
      </div>

      <div className="ov-foot">
        <span>{fmtTime(play.elapsedMs)}</span>
        <div className="ov-bar">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
        <span>{fmtTime(play.totalMs)}</span>
      </div>
    </div>
  );
}
