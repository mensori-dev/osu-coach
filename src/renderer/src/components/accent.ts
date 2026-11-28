import { useEffect, useState } from 'react';

export interface Accent {
  a: string;
  b: string;
  /** Lighter sibling of `a`, used for soft text and chips. */
  soft: string;
  /** A deep, slightly tinted background derived from the same cover. */
  tint: string;
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

function rgbaStr(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hue = ((h % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rgbv: [number, number, number];
  if (hue < 60) rgbv = [c, x, 0];
  else if (hue < 120) rgbv = [x, c, 0];
  else if (hue < 180) rgbv = [0, c, x];
  else if (hue < 240) rgbv = [0, x, c];
  else if (hue < 300) rgbv = [x, 0, c];
  else rgbv = [c, 0, x];
  return rgbv.map((value) => (value + m) * 255) as [number, number, number];
}

/**
 * Pulls a small palette out of the map cover.
 *
 * Dark and washed-out covers used to give nothing and the whole app fell back
 * to the same purple. Now the dominant hue is taken even from a dim cover, the
 * accent is lifted so it stays readable, and a deep background tint is derived
 * from the cover's average colour so the app feels like the artwork.
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

      const buckets = Array.from({ length: 36 }, () => 0);
      let vivid = 0;
      let ar = 0;
      let ag = 0;
      let ab = 0;
      let n = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        const pr = pixels[i];
        const pg = pixels[i + 1];
        const pb = pixels[i + 2];
        ar += pr;
        ag += pg;
        ab += pb;
        n += 1;

        const [h, s, l] = rgbToHsl(pr, pg, pb);
        if (l < 0.04 || l > 0.97) continue;
        // Keep even dim colours, but the weight favours the vivid ones.
        const weight = (0.25 + s) * (0.3 + l);
        if (s < 0.06 && l < 0.25) continue;
        buckets[Math.floor((((h % 360) + 360) % 360) / 10) % 36] += weight;
        vivid += s * l;
      }

      if (!alive || !n) return;

      const [avgH, avgS, avgL] = rgbToHsl(ar / n, ag / n, ab / n);

      let topBucket = -1;
      let topWeight = 0;
      for (let i = 0; i < buckets.length; i++) {
        if (buckets[i] > topWeight) {
          topWeight = buckets[i];
          topBucket = i;
        }
      }

      // A colourful cover picks its dominant hue; a flat/dark one keeps the
      // average hue, so it still matches the artwork instead of going purple.
      const dominant = topBucket >= 0 && topWeight > 1.5 && avgS > 0.05;
      const primaryHue = dominant ? topBucket * 10 + 5 : avgH;

      // The second colour sits at least 45° away on the wheel. Two neighbours
      // read as a palette; two shades of one hue read as the default theme.
      let secondBucket = -1;
      let secondWeight = 0;
      if (dominant) {
        for (let i = 0; i < buckets.length; i++) {
          if (i === topBucket) continue;
          const distance = Math.min(Math.abs(i - topBucket), 36 - Math.abs(i - topBucket)) * 10;
          if (distance < 45) continue;
          if (buckets[i] > secondWeight) {
            secondWeight = buckets[i];
            secondBucket = i;
          }
        }
      }
      const hasSecond = secondBucket >= 0 && secondWeight > topWeight * 0.22;
      const secondaryHue = hasSecond ? secondBucket * 10 + 5 : primaryHue + 38;

      // Keep the cover's own depth. A dark red cover stays red instead of being
      // lifted into the same pink as every other cover.
      const lightness = Math.max(0.52, Math.min(0.66, 0.56 + (avgL - 0.45) * 0.25));
      const saturation = Math.max(0.5, Math.min(0.95, Math.max(avgS, 0.35) * 1.25 + 0.1));

      const tintHue = dominant ? primaryHue : avgH;
      const tintSat = Math.min(0.55, Math.max(0.18, avgS * 0.8));
      const [tr, tg, tb] = hslToRgb(tintHue, tintSat, 0.13);

      setPicked({
        cover,
        accent: {
          a: hslToHex(primaryHue, saturation, lightness),
          b: hslToHex(secondaryHue, Math.max(0.55, saturation - 0.06), Math.max(0.46, lightness - 0.08)),
          soft: hslToHex(primaryHue, Math.min(0.9, saturation), Math.min(0.8, lightness + 0.16)),
          tint: rgbaStr(tr, tg, tb, 0.9),
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
