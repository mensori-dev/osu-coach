import type { CSSProperties } from 'react';
import type { Theme } from './types';

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
