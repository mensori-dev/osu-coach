/**
 * App icon generator (reproducible, no extra dependencies).
 *
 *   node scripts/make-icon.mjs            -> build/icon-{16,24,32,48,64,128,256}.png,
 *                                            build/icon.png (512), build/icon.svg, build/icon.ico
 *   node scripts/make-icon.mjs --preview  -> build/.preview/*.png (for eyeballing)
 *
 * The SVG is rasterized by the Electron that is already in node_modules:
 * a transparent offscreen BrowserWindow per size, captured with capturePage.
 * The same file doubles as the Electron entry point (process.versions.electron).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(here), '..');
const buildDir = path.join(root, 'build');
const previewMode = process.argv.includes('--preview');

/* ------------------------------------------------------------------ palette */

const C = {
  bgTop: '#241638',
  bgBottom: '#0b0813',
  pink: '#ff5fa2',
  pinkLight: '#ffb3d1',
  violet: '#9b6bff',
  mint: '#3ee6a4',
};

/* -------------------------------------------------------------- svg pieces */

const ringGradient = (id) => `
    <linearGradient id="${id}" x1="0.08" y1="0.92" x2="0.92" y2="0.08">
      <stop offset="0" stop-color="${C.violet}"/>
      <stop offset="0.5" stop-color="${C.pink}"/>
      <stop offset="1" stop-color="${C.pinkLight}"/>
    </linearGradient>`;

const bgGradient = (id) => `
    <linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${C.bgTop}"/>
      <stop offset="1" stop-color="${C.bgBottom}"/>
    </linearGradient>`;

const glowGradient = (id, color, opacity) => `
    <radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>`;

/** Four-point sparkle with concave sides. */
const sparkle = (cx, cy, r) => {
  const k = r * 0.14;
  return (
    `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} ` +
    `Q${cx + k} ${cy + k} ${cx} ${cy + r} ` +
    `Q${cx - k} ${cy + k} ${cx - r} ${cy} ` +
    `Q${cx - k} ${cy - k} ${cx} ${cy - r} Z`
  );
};

/**
 * The icon: the osu! hit circle opened into a "C" for coach, with a mint hit
 * spark at its center. 256x256 design box, per-size-bucket geometry so the
 * silhouette survives 16 px (thicker arc, wider mouth, flat caps, plain dot).
 */
function iconSVG(size) {
  const bucket = size <= 32 ? 'small' : size <= 48 ? 'mid' : 'big';
  const geo = {
    small: { r: 73, w: 42, gap: 32, cap: 'butt', spark: 29 },
    mid: { r: 75, w: 37, gap: 24, cap: 'round', spark: 25 },
    big: { r: 76, w: 32, gap: 18, cap: 'round', spark: 22 },
  }[bucket];

  const halo = bucket === 'big' ? `<circle cx="128" cy="128" r="${geo.spark * 2.2}" fill="url(#sparkGlow)"/>` : '';
  const spark =
    bucket === 'small'
      ? `<circle cx="128" cy="128" r="${geo.spark * 0.86}" fill="${C.mint}"/>`
      : `<path d="${sparkle(128, 128, geo.spark)}" fill="${C.mint}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
  <defs>
    ${bgGradient('bg')}
    ${ringGradient('ring')}
    ${glowGradient('glow', C.violet, 0.55)}
    ${glowGradient('sparkGlow', C.mint, 0.35)}
  </defs>
  <rect width="256" height="256" rx="58" fill="url(#bg)"/>
  <circle cx="128" cy="124" r="104" fill="url(#glow)"/>
  <rect x="1.5" y="1.5" width="253" height="253" rx="57" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="3"/>
  <circle cx="128" cy="128" r="${geo.r}" fill="none" stroke="url(#ring)" stroke-width="${geo.w}"
    stroke-linecap="${geo.cap}" stroke-dasharray="${100 - geo.gap} ${geo.gap}" pathLength="100"
    transform="rotate(30 128 128)"/>
  ${halo}
  ${spark}
</svg>`;
}

/* ------------------------------------------------------------------- plan */

function plan() {
  if (previewMode) {
    const dir = path.join(buildDir, '.preview');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const items = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
      size,
      svg: iconSVG(size),
      out: path.join(dir, `icon-${size}.png`),
    }));
    items.push({ size: 512, svg: iconSVG(512), out: path.join(dir, 'icon-512.png') });
    return items;
  }

  const items = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
    size,
    svg: iconSVG(size),
    out: path.join(buildDir, `icon-${size}.png`),
  }));
  // build/icon.png is the 512 px store/readme image
  items.push({ size: 512, svg: iconSVG(512), out: path.join(buildDir, 'icon.png') });
  return items;
}

/* ------------------------------------------------------- electron renderer */

async function renderInElectron(items) {
  const { app, BrowserWindow } = await import('electron');
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('force-device-scale-factor', '1');

  const html = (svg, size) => `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${svg}</body></html>`;

  const tmpDir = path.join(buildDir, '.icon-tmp');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  await app.whenReady();
  // destroying a window must not end the batch early
  app.on('window-all-closed', () => {});

  for (const [index, item] of items.entries()) {
    const htmlPath = path.join(tmpDir, `icon-${item.size}-${index}.html`);
    fs.writeFileSync(htmlPath, html(item.svg, item.size), 'utf8');

    const win = new BrowserWindow({
      width: item.size,
      height: item.size,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      backgroundColor: '#00000000',
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });

    await win.loadFile(htmlPath);
    await new Promise((r) => setTimeout(r, 160));
    const image = await win.webContents.capturePage({
      x: 0,
      y: 0,
      width: item.size,
      height: item.size,
    });
    const png = image.toPNG();
    if (!png.length) throw new Error(`empty capture for ${item.out}`);
    fs.mkdirSync(path.dirname(item.out), { recursive: true });
    fs.writeFileSync(item.out, png);

    const { width, height } = image.getSize();
    if (width !== item.size || height !== item.size) {
      throw new Error(`wrong capture size for ${item.out}: ${width}x${height}`);
    }
    const bitmap = image.toBitmap(); // BGRA
    const alphaAt = (x, y) => bitmap[(y * width + x) * 4 + 3];
    console.log(
      `render ${path.basename(item.out)} ${width}x${height} ${png.length}b ` +
        `cornerA=${alphaAt(0, 0)} centerA=${alphaAt(width >> 1, height >> 1)}`,
    );

    win.destroy();
    await new Promise((r) => setTimeout(r, 60));
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  app.quit();
}

/* -------------------------------------------------------------------- main */

if (process.versions.electron) {
  renderInElectron(plan()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  fs.mkdirSync(buildDir, { recursive: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const res = spawnSync(require('electron'), [here, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);

  if (previewMode) {
    console.log('preview written to build/.preview');
  } else {
    // keep an editable vector master next to the rasters
    fs.writeFileSync(path.join(buildDir, 'icon.svg'), iconSVG(256), 'utf8');

    const ico = spawnSync(process.execPath, [path.join(root, 'scripts', 'make-ico.mjs')], {
      stdio: 'inherit',
    });
    if (ico.status !== 0) process.exit(ico.status ?? 1);
    console.log('icon set updated');
  }
}
