import type { Bootstrap, ScanResult, Settings } from '../types';
import { fmtInt, fmtNum } from '../utils';
import { IconRefresh, IconSpark } from './Icons';

interface Props {
  boot: Bootstrap;
  onScan: () => void;
}

const DEVICE_LABEL: Record<string, string> = {
  mouse: 'мышь',
  tablet: 'планшет',
  touchpad: 'тачпад',
  unknown: 'не указано',
};
const TAP_LABEL: Record<string, string> = {
  single: 'одним пальцем',
  alternate: 'чередую',
  two: 'двумя руками',
  depends: 'по-разному',
  unknown: 'не указано',
};
const GOAL_LABEL: Record<string, string> = {
  accuracy: 'точность',
  pp: 'pp',
  consistency: 'стабильность',
  speed: 'скорость',
  fun: 'в кайф',
};

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function shareOf(plays: number, total: number): number {
  return total > 0 ? Math.round((plays / total) * 100) : 0;
}

function buildFacts(scan: ScanResult): { tag: string; big: string; text: string; tone: string }[] {
  const prefs = scan.preferences;
  const topArtist = prefs?.artists?.[0];
  const topCreator = prefs?.creators?.[0];
  const topRepeated = scan.topRepeated?.[0];
  const hours = scan.hours ?? Array.from({ length: 24 }, () => 0);
  const total = scan.playsTotal || 1;
  const night =
    hours.slice(22).reduce((sum, value) => sum + value, 0) + hours.slice(0, 6).reduce((sum, value) => sum + value, 0);
  const peakHour = hours.indexOf(Math.max(...hours));
  const hoursPlayed = (scan.playSeconds || 0) / 3600;
  const unplayed = (scan.maps ?? []).filter((map) => map.plays === 0);
  const example = unplayed[Math.floor(unplayed.length / 3)] ?? unplayed[0];
  const best = scan.bestPlay;
  const uniqueArtists = scan.uniqueArtists || prefs?.artists?.length || 0;
  const nightShare = Math.round((night / total) * 100);

  const facts: { tag: string; big: string; text: string; tone: string }[] = [];

  if (topArtist) {
    facts.push({
      tag: 'музыка',
      big: `${fmtInt(topArtist.plays)}`,
      text: `плеев на ${topArtist.name}. Это ${shareOf(topArtist.plays, total)}% твоих плеев. ${
        shareOf(topArtist.plays, total) >= 15
          ? 'Личный саундтрек, отрицать бесполезно.'
          : 'Но вкус не зациклен на одном.'
      }`,
      tone: 'var(--pink)',
    });
  }

  facts.push({
    tag: 'вкус',
    big: `${fmtInt(uniqueArtists)}`,
    text: `разных артистов на ${fmtInt(scan.playsTotal)} плеев. ${
      uniqueArtists > 100
        ? 'Плейлист длиннее, чем сессия.'
        : uniqueArtists > 40
          ? 'И новое пробуешь, и старое не бросаешь.'
          : 'Круг узкий: нашёл любимое и добиваешь до дыр.'
    }`,
    tone: 'var(--violet)',
  });

  if (topCreator) {
    facts.push({
      tag: 'маппер',
      big: `${fmtInt(topCreator.plays)}`,
      text: `плеев от ${topCreator.name}. Его паттерны ты узнаёшь с закрытыми глазами.`,
      tone: 'var(--blue)',
    });
  }

  if (topRepeated) {
    facts.push({
      tag: 'заезжено',
      big: `${fmtInt(topRepeated.plays)}`,
      text: `раз сыграна «${topRepeated.title}». Ещё один плей, и получишь абонемент.`,
      tone: 'var(--amber)',
    });
  }

  facts.push({
    tag: 'ночь',
    big: `${fmtInt(night)}`,
    text: `плеев после 22:00 (${nightShare}%). ${nightShare >= 20 ? 'Сон — это тоже навык.' : 'Днём ты собраннее, чем кажется.'}`,
    tone: 'var(--violet)',
  });

  facts.push({
    tag: 'час пик',
    big: `${peakHour}:00`,
    text: `чаще всего садишься играть. ${
      peakHour >= 22 || peakHour <= 4
        ? 'Ночная сессия, классика.'
        : peakHour <= 10
          ? 'Утренний игрок, редкий вид.'
          : 'Дневной график, уважаю.'
    }`,
    tone: 'var(--mint)',
  });

  facts.push({
    tag: 'в картах',
    big: `${fmtNum(hoursPlayed, 1)} ч`,
    text: `чистого времени. Это ${fmtNum(hoursPlayed / 24, 1)} ${plural(Math.round(hoursPlayed / 24), 'сутки', 'суток', 'суток')}. Можно было выучить язык, но зато стримы.`,
    tone: 'var(--pink)',
  });

  if (best) {
    facts.push({
      tag: 'рекорд',
      big: `${fmtNum(best.acc, 1)}%`,
      text: `«${best.title}» от ${best.artist}. Лучшая точность среди всех плеев. Руки помнят.`,
      tone: 'var(--mint)',
    });
  }

  if (unplayed.length) {
    facts.push({
      tag: 'жемчужины',
      big: `${fmtInt(unplayed.length)}`,
      text: `карт лежат в библиотеке и ни разу не открывались. Например, «${example?.title ?? 'одна из них'}». Там точно есть что-то твоё.`,
      tone: 'var(--amber)',
    });
  }

  if (scan.busiestDay) {
    facts.push({
      tag: 'марафон',
      big: `${fmtInt(scan.busiestDay.plays)}`,
      text: `плеев за день ${dayLabel(scan.busiestDay.day)}. Личный рекорд по усидчивости.`,
      tone: 'var(--blue)',
    });
  }

  return facts;
}

function MusicPortrait({ scan, settings }: { scan: ScanResult; settings: Settings }) {
  const artists = (scan.preferences?.artists ?? []).slice(0, 5);
  const topCreator = scan.preferences?.creators?.[0];
  const total = scan.playsTotal || 1;
  const topThree = artists.slice(0, 3);
  const topThreePlays = topThree.reduce((sum, item) => sum + item.plays, 0);
  const max = Math.max(1, artists[0]?.plays ?? 1);

  const conclusion = topThree.length
    ? `Твой топ-3: ${topThree.map((item) => item.name).join(', ')}. На них ${shareOf(topThreePlays, total)}% всех плеев. ${
        topThreePlays / total >= 0.35
          ? 'Круг узкий: ты нашёл любимое и добиваешь до дыр.'
          : 'Круг широкий: тебе заходит почти всё, что попадает в руки.'
      }${topCreator ? ` Любимый маппер — ${topCreator.name}, ${topCreator.plays} плеев.` : ''}${
        settings.music ? ` Сам ты говоришь, что слушаешь: ${settings.music}.` : ''
      }`
    : 'Пока мало данных для музыкального портрета. Сыграй ещё несколько карт и обнови сканирование.';

  return (
    <div className="card music-card">
      <div className="music-head">
        <div className="card-title">музыкальный портрет</div>
        <span className="music-note">по твоим локальным плеям, без ИИ</span>
      </div>

      <div className="music-body">
        <div className="music-bars">
          {artists.length ? (
            artists.map((artist, index) => (
              <div className="music-bar-row" key={artist.name}>
                <span className="music-rank">{index + 1}</span>
                <div className="music-bar-main">
                  <div className="music-bar-label">
                    <b>{artist.name}</b>
                    <span>{artist.plays}</span>
                  </div>
                  <div className="music-bar-track">
                    <i style={{ width: `${(artist.plays / max) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">Артисты появятся после сканирования.</div>
          )}
        </div>

        <div className="music-conclusion">
          <IconSpark size={15} />
          <p>{conclusion}</p>
        </div>
      </div>
    </div>
  );
}

function GoalCard({ boot }: { boot: Bootstrap }) {
  const scan = boot.scan;
  const goal = boot.settings.goal;
  const skills = scan?.skills;

  if (!scan?.ok || !skills) {
    return (
      <div className="card profile-goal">
        <div className="card-title">цель</div>
        <p className="note">Сначала просканируй osu!, чтобы я мог показать прогресс к цели.</p>
      </div>
    );
  }

  let current = 0;
  let target = 0;
  let text = '';
  let unit = '%';

  if (goal === 'accuracy') {
    current = scan.medianAcc;
    target = 95;
    text = 'медиана точности по всем плеям';
  } else if (goal === 'consistency') {
    current = Math.max(0, 10 - skills.gap);
    target = 6;
    text = `разрыв лучший/медиана ${fmtNum(skills.gap, 1)} п.п.`;
    unit = '';
  } else if (goal === 'speed') {
    current = skills.speed ?? 0;
    target = 90;
    text = 'медиана на быстрых картах';
  } else if (goal === 'pp') {
    const pp = boot.api.profile?.pp ?? 0;
    current = pp;
    target = Math.ceil((pp + 1) / 100) * 100;
    text = `${fmtInt(pp)} pp сейчас`;
    unit = ' pp';
  }

  if (goal === 'fun' || target <= 0) {
    return (
      <div className="card profile-goal">
        <div className="card-title">цель</div>
        <p className="goal-title">играть в кайф</p>
        <p className="note">Без цифры. Просто следи, чтобы точность не падала ниже 90% на комфорте.</p>
      </div>
    );
  }

  const progress = Math.max(0, Math.min(1, current / target));

  return (
    <div className="card profile-goal">
      <div className="card-title">цель</div>
      <div className="goal-line">
        <b>
          {fmtNum(current, 1)}
          {unit}
        </b>
        <span>
          из {fmtNum(target, 0)}
          {unit}
        </span>
      </div>
      <div className="goal-track">
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="note">{text}</p>
    </div>
  );
}

export function ProfileView({ boot, onScan }: Props) {
  const scan = boot.scan;
  const api = boot.api.profile;
  const name = boot.settings.user || scan?.player || api?.username || 'игрок';
  const facts = scan?.ok ? buildFacts(scan) : [];

  return (
    <div className="profile fade-in">
      <div className="card profile-hero">
        <div className="profile-avatar">{(name[0] || 'o').toUpperCase()}</div>
        <div className="profile-who">
          <b>{name}</b>
          <span>
            {DEVICE_LABEL[boot.settings.device]} · {TAP_LABEL[boot.settings.tapping]} · цель:{' '}
            {GOAL_LABEL[boot.settings.goal]}
          </span>
        </div>
        <div className="profile-hero-facts">
          {api && (
            <>
              <div>
                <span>pp</span>
                <b>{fmtInt(api.pp)}</b>
              </div>
              <div>
                <span>ранг</span>
                <b>#{fmtInt(api.rank)}</b>
              </div>
              <div>
                <span>часов</span>
                <b>{fmtInt(Math.round(api.playTime / 3600))}</b>
              </div>
            </>
          )}
        </div>
      </div>

      {scan?.ok ? (
        <>
          <MusicPortrait scan={scan} settings={boot.settings} />

          <div className="card profile-facts-card">
            <div className="facts-head">
              <div className="card-title">интересные факты</div>
              <span className="facts-note">всё считается по твоим скорам</span>
            </div>
            <div className="fact-cards">
              {facts.map((fact) => (
                <div className="fact-card" key={fact.tag + fact.big} style={{ borderColor: `${fact.tone}33` }}>
                  <span className="fact-tag" style={{ color: fact.tone }}>
                    {fact.tag}
                  </span>
                  <b className="fact-big" style={{ color: fact.tone }}>
                    {fact.big}
                  </b>
                  <p>{fact.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="profile-grid">
            <GoalCard boot={boot} />
            <div className="card profile-actions">
              <div className="card-title">как это считается</div>
              <p className="note">
                Всё, что видно на этой странице, считается по твоим локальным скорам и сохраняется в <b>profile.json</b>
                . Никакой ИИ и облака: только твои цифры и немного здравого смысла.
              </p>
              <div className="actions" style={{ justifyContent: 'flex-start' }}>
                <button className="btn ghost" onClick={onScan}>
                  <IconRefresh /> пересканировать
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card profile-facts-card">
          <div className="empty">Локальные данные не прочитаны. Проверь папку osu! и запусти сканирование.</div>
        </div>
      )}
    </div>
  );
}
