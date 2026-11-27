const fs = require('node:fs');
const css = fs.readFileSync('src/renderer/src/styles.css', 'utf8').split(/\r?\n/);
let sel = '';
css.forEach((line, i) => {
  const t = line.trim();
  if (t.endsWith('{')) sel = t.slice(0, -1).trim();
  if (t.startsWith('font-size:')) console.log(String(i + 1).padStart(4), sel.padEnd(38), t);
});
