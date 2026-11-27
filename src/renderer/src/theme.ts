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

/** Two accent colours pulled from a cover, applied app-wide. */
export function accentStyle(a: string, b: string): CSSProperties {
  return { '--pink': a, '--violet': b } as CSSProperties;
}

/**
 * Which cover should drive the accent when the theme is «обложка»: the map that
 * is playing right now if there is one, otherwise the last one played.
 */
export function themeCover(boot: Bootstrap | null, live: LivePayload | null): string | null {
  if (live?.cover) return live.cover;
  const recent = boot?.scan?.recent?.[0];
  if (!recent) return null;
  const entry = boot?.scan?.maps?.find((map) => map.id === recent.id);
  if (!entry) return null;
  return `https://assets.ppy.sh/beatmaps/${entry.setId}/covers/cover.jpg`;
}
