const fs = require('node:fs');
const t = fs.readFileSync('src/renderer/src/components/Dashboard.tsx', 'utf8');
console.log('has signals:', t.includes('сильные стороны'));
console.log('has grid:', t.includes('signal-grid'));
const bad = (t.match(/\uFFFD/g) || []).length;
console.log('replacement chars:', bad);
const m = t.match(/<div className="signal-head good">([^<]*)<\/div>/);
console.log('head text:', JSON.stringify(m && m[1]));
console.log('bytes:', fs.statSync('src/renderer/src/components/Dashboard.tsx').size);
