import type { MapEntry, ScanResult } from './types';
import { dayKey, stableHash } from './tips';

export interface WarmupStep {
  key: 'warm' | 'shape' | 'push';
  label: string;
  hint: string;
  map: MapEntry;
}

/**
 * Three real maps from the player's own library: one to wake up, one at the
 * usual level, one a step above. Chosen from maps that are already installed,
 * so every row can be opened in osu! right away. The set changes once a day.
 */
export function buildWarmup(scan: ScanResult | null, at = Date.now()): WarmupStep[] {
  if (!scan?.ok) return [];
  const comfort = scan.comfortStar ?? 3.5;
  const pool = (scan.maps ?? []).filter((map) => map.id > 0 && map.stars > 0 && map.plays > 0);
  if (pool.length < 3) return [];

  const seed = dayKey(at);
  const used = new Set<number>();

  const pick = (lo: number, hi: number, tag: string): MapEntry | null => {
    const inBand = pool.filter((map) => !used.has(map.id) && map.stars >= lo && map.stars <= hi);
    const fallback = pool.filter((map) => !used.has(map.id) && map.stars < comfort + 0.2);
    const band = inBand.length ? inBand : fallback.length ? fallback : pool.filter((map) => !used.has(map.id));
    if (!band.length) return null;
    // A warm-up should not be a gamble: prefer maps the player already holds.
    const top = [...band].sort((a, b) => b.bestAcc - a.bestAcc || b.plays - a.plays).slice(0, 6);
    const chosen = top[stableHash(tag + seed) % top.length];
    used.add(chosen.id);
    return chosen;
  };

  const steps: WarmupStep[] = [];
  const warm = pick(comfort - 0.6, comfort - 0.05, 'warm');
  if (warm) steps.push({ key: 'warm', label: 'разогрев', hint: 'держи 97%+, тут важна чистота', map: warm });

  const shape = pick(comfort - 0.05, comfort + 0.4, 'shape');
  if (shape) steps.push({ key: 'shape', label: 'в форме', hint: 'ровно, без погони за рекордом', map: shape });

  const push = pick(comfort + 0.4, comfort + 1.1, 'push');
  if (push) steps.push({ key: 'push', label: 'на выносливость', hint: 'точность можно отпустить', map: push });

  return steps;
}
