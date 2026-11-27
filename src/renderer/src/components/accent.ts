import { useEffect, useState } from 'react';

export interface Accent {
  a: string;
  b: string;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;

  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;

  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return (
    '#' +
    rgb
      .map((value) => {
        const channel = Math.round((value + m) * 255);
        return Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0');
      })
      .join('')
  );
}

/**
 * Pulls two readable accent colours out of the map cover.
 * The cover is fetched through the main process, so the canvas stays untainted.
 */
export function useCoverAccent(cover: string | null): Accent | null {
  const [picked, setPicked] = useState<{ cover: string; accent: Accent } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!cover) return;

    const run = async () => {
      const data = await window.api?.coverData(cover);
      if (!alive || !data) return;

      const image = new Image();
      image.src = data;
      try {
        await image.decode();
      } catch {
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(image, 0, 0, 32, 32);
      const pixels = ctx.getImageData(0, 0, 32, 32).data;

      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const pr = pixels[i];
        const pg = pixels[i + 1];
        const pb = pixels[i + 2];
        const max = Math.max(pr, pg, pb);
        const min = Math.min(pr, pg, pb);
        const sat = max === 0 ? 0 : (max - min) / max;
        if (max < 46 || sat < 0.22) continue;
        r += pr;
        g += pg;
        b += pb;
        n += 1;
      }

      if (!alive || !n) return;
      const [h, s] = rgbToHsl(r / n, g / n, b / n);
      const saturation = Math.max(0.55, Math.min(0.9, s));
      setPicked({
        cover,
        accent: {
          a: hslToHex(h, saturation, 0.63),
          b: hslToHex(h + 38, Math.max(0.5, saturation - 0.08), 0.55),
        },
      });
    };

    void run();
    return () => {
      alive = false;
    };
  }, [cover]);

  return picked && picked.cover === cover ? picked.accent : null;
}
