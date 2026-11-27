const fs = require('node:fs');
const file = 'src/renderer/src/styles.css';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const sizes = {
  '.brand small': '11px',
  '.tab': '13.5px',
  '.status-pill': '12.5px',
  '.card-title': '11.5px',
  '.player-sub': '12px',
  '.player-pp span': '10.5px',
  '.map-artist': '13.5px',
  '.map-diff': '12.5px',
  '.mapper-row': '12.5px',
  '.chip': '11.5px',
  '.ring-label': '11px',
  '.ring-sub': '12.5px',
  '.hit-pill span': '11px',
  '.pp-row': '12.5px',
  '.combo-sub': '11.5px',
  '.progress-head': '12.5px',
  '.results-cell span': '11px',
  '.hero-sub': '12.5px',
  '.stat span': '10.5px',
  '.chart-legend': '11.5px',
  '.insight-item p': '13px',
  '.play-row': '12.5px',
  '.play-row .idx': '11.5px',
  '.play-map b': '13px',
  '.play-map span': '11.5px',
  '.play-stars': '11.5px',
  '.set-title .badge': '10.5px',
  '.set-desc': '13px',
  '.field label': '11.5px',
  '.input': '13.5px',
  '.switch-row p': '13px',
  '.switch-row p b': '13.5px',
  '.path': '11.5px',
  '.note': '12.5px',
  '.kv': '13px',
  '.empty': '13px',
  '.tiny': '12px',
  '.hiterror .zero': '10px',
};

let selector = '';
let changed = 0;
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (trimmed.endsWith('{')) selector = trimmed.slice(0, -1).trim();
  if (trimmed.startsWith('font-size:') && sizes[selector]) {
    const indent = lines[i].match(/^\s*/)[0];
    lines[i] = `${indent}font-size: ${sizes[selector]};`;
    changed++;
  }
}

let css = lines.join('\n');
css = css.replace('--dim: #948cab;', '--dim: #9d95b2;');
fs.writeFileSync(file, css);
console.log('changed', changed);
