'use strict';
// Dump the tail bytes of individual scores in scores.db to identify the
// timestamp field. Read-only probe.
const fs = require('node:fs');
const path = require('node:path');

const buf = fs.readFileSync(path.join(process.env.LOCALAPPDATA, 'osu!', 'scores.db'));
let o = 0;
const i32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
const u16 = () => { const v = buf.readUInt16LE(o); o += 2; return v; };
const u8 = () => buf[o++];
const str = () => {
  const m = buf[u8()];
  if (m === 0) return '';
  let len = 0, shift = 0, b;
  do { b = u8(); len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
  const s = buf.toString('utf8', o, o + len);
  o += len;
  return s;
};

console.log('version', i32());
const n = i32();
let shown = 0;
for (let i = 0; i < n && shown < 3; i++) {
  const key = str();
  const c = i32();
  for (let j = 0; j < c; j++) {
    u8(); i32(); str(); str(); str();
    for (let k = 0; k < 6; k++) u16();
    i32(); u16(); u8();
    const mods = i32();
    const tailStart = o;
    const a = buf.readBigInt64LE(o); o += 8;
    const flag = u8();
    const b = buf.readBigInt64LE(o); o += 8;
    const tail = i32();
    if (shown < 3) {
      shown++;
      console.log('\nscore', shown, 'mods', mods);
      console.log('  a    =', a.toString());
      console.log('  flag =', flag);
      console.log('  b    =', b.toString());
      console.log('  tail =', tail);
      console.log('  hex  =', buf.subarray(tailStart, o).toString('hex').replace(/(..)/g, '$1 '));
    }
  }
}
