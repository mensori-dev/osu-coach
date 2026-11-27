export function fmtInt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function fmtNum(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export function fmtRank(value: number | null | undefined): string {
  if (value == null) return '—';
  return '#' + fmtInt(value);
}

/** osu! beatmap status: 3 ranked, 4 approved, 5 qualified. Loved and pending give no pp. */
export function isRankedStatus(status: number | null | undefined): boolean {
  return status === 3 || status === 4 || status === 5;
}

/** Russian plural: plural(2, 'игра', 'игры', 'игр') → 'игры'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function fmtTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtPlayTime(seconds: number): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

export function accTone(acc: number): 'mint' | 'pink' | 'amber' | 'red' {
  if (acc >= 98) return 'mint';
  if (acc >= 95) return 'pink';
  if (acc >= 90) return 'amber';
  return 'red';
}

export function toneVar(tone: 'mint' | 'pink' | 'amber' | 'red' | 'violet' | 'blue'): string {
  return `var(--${tone})`;
}

export function shortMods(mods: string[]): string[] {
  return mods.filter((m) => m !== 'CL').slice(0, 4);
}

export function clock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
