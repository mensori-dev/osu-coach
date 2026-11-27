import type { Bootstrap } from './types';
import { fmtInt, fmtNum } from './utils';

export interface Greeting {
  title: string;
  sub: string;
}

/**
 * A line for this launch. Picked at random, but built only from things the app
 * can actually see: the nick, the hour, the local database. Two launches in a
 * row should not sound the same, so the caller re-rolls on every open.
 */
export function buildGreeting(boot: Bootstrap | null, now = new Date()): Greeting {
  const nick = boot?.api.profile?.username || boot?.live?.player?.name || boot?.settings.user || '';
  const who = nick || 'брат';

  const hour = now.getHours();
  const daypart = hour < 5 ? 'ночь' : hour < 12 ? 'утро' : hour < 18 ? 'день' : 'вечер';
  const timeWord = hour < 5 ? 'ночью' : hour < 12 ? 'с утра' : hour < 18 ? 'днём' : 'вечером';

  const scan = boot?.scan;
  const plays = scan?.playsTotal ?? 0;
  const rank = boot?.api.profile?.rank ?? null;
  const pp = boot?.api.profile?.pp ?? 0;
  const acc = scan?.avgAcc ?? null;
  const activeDays = scan?.daily?.filter((point) => point.plays > 0).length ?? 0;

  const intros = [
    `Привет, ${who}`,
    `О, ${who}`,
    `Здорово, ${who}`,
    `Йо, ${who}`,
    `Снова ты, ${who}`,
    `На связи, ${who}`,
    `Хэй, ${who}`,
  ];

  const subs: string[] = [];

  if (activeDays >= 2 && acc != null) {
    subs.push(`держишь ${fmtNum(acc, 1)}% за последние дни`);
  }
  if (rank) {
    subs.push(`сейчас #${fmtInt(rank)} в мире`);
  }
  if (pp > 0) {
    subs.push(`${fmtInt(pp)} pp в кармане`);
  }
  if (plays > 0) {
    subs.push(`${fmtInt(plays)} ${plays === 1 ? 'плей' : 'плеев'} уже разобрано`);
  }
  subs.push(`сегодня ${daypart} — самое время для пары карт`);
  subs.push(`${timeWord} osu! заходит особенно`);

  const introsLeft = [...intros];
  const title = introsLeft[Math.floor(Math.random() * introsLeft.length)];
  const sub = subs[Math.floor(Math.random() * subs.length)];

  return { title, sub };
}
