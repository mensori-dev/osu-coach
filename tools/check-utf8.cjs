const fs = require('node:fs');
const t = fs.readFileSync('src/renderer/src/components/SettingsView.tsx', 'utf8');
console.log('has zivye:', t.includes('Живые данные'));
console.log('has port label:', t.includes('порт'));
const lines = t.split(/\r?\n/).filter((l) => l.includes('set-title') || l.includes('порт'));
console.log(lines.slice(0, 3).map((l) => JSON.stringify(l.trim())).join('\n'));
