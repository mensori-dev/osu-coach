import type { CSSProperties } from 'react';
import type { Bootstrap, LivePayload, Theme } from './types';

export interface ThemeChoice {
  key: Theme;
  label: string;
  hint: string;
  pink: string;
  violet: string;
}

export const THEMES: ThemeChoice[] = [
  { key: 'cover', label: 'обложка', hint: 'цвета текущей карты', pink: '#ff5fa2', violet: '#9b6bff' },
  { key: 'rose', label: 'роза', hint: 'тёплый розовый', pink: '#ff5fa2', violet: '#9b6bff' },
  { key: 'neon', label: 'неон', hint: 'мятный и голубой', pink: '#3ee6a4', violet: '#35d0ff' },
  { key: 'sunset', label: 'закат', hint: 'оранжевый и розовый', pink: '#ff8a5c', violet: '#ff5fa2' },
  { key: 'night', label: 'ночь', hint: 'индиго и фиолет', pink: '#7c8cff', violet: '#9b6bff' },
];

export function themeStyle(theme: Theme | undefined): CSSProperties | undefined {
  if (!theme || theme === 'cover') return undefined;
  const found = THEMES.find((item) => item.key === theme) ?? THEMES[0];
  return { '--pink': found.pink, '--violet': found.violet } as CSSProperties;
}

/** Two accent colours pulled from a cover, plus a deep background tint. */
export function accentStyle(a: string, b: string, tint?: string, soft?: string): CSSProperties {
  return {
    '--pink': a,
    '--violet': b,
    ...(soft ? { '--pink-soft': soft } : {}),
    ...(tint ? { '--cover-tint': tint } : {}),
  } as CSSProperties;
}

function coverOf(setId: number | null | undefined): string | null {
  if (!setId) return null;
  return `https://assets.ppy.sh/beatmaps/${setId}/covers/cover.jpg`;
}

/**
 * Which cover should drive the accent when the theme is «обложка»: the map that
 * is playing right now, then the run that just ended, then the last map in the
 * database. The middle step matters: osu! writes scores.db seconds later, so
 * without it the theme snaps back to yesterday's artwork the moment results close.
 */
export function themeCover(
  boot: Bootstrap | null,
  live: LivePayload | null,
  fresh?: { setId: number } | null,
): string | null {
  if (live?.cover) return live.cover;
  const freshCover = coverOf(fresh?.setId);
  if (freshCover) return freshCover;
  const recent = boot?.scan?.recent?.[0];
  if (!recent) return null;
  const entry = boot?.scan?.maps?.find((map) => map.id === recent.id);
  return coverOf(entry?.setId);
}
