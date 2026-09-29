// Dev helper: node scripts/dump-shape.mjs heart 65536 out.bin
import { writeFileSync } from 'node:fs';
import { mulberry32 } from '../src/gl/shapes/util.js';
const [name, n = '65536', out = 'shape.bin'] = process.argv.slice(2);
const mod = await import(`../src/gl/shapes/${name}.js`);
const fn = Object.values(mod).find((v) => typeof v === 'function' && v.name.startsWith('generate'));
const t0 = performance.now();
const data = fn(Number(n), mulberry32(7));
console.log(`${name}: ${data.length / 4} pts in ${(performance.now() - t0).toFixed(0)} ms`);
let nan = 0; for (const v of data) if (!Number.isFinite(v)) nan++;
if (nan) console.log('NaNs:', nan);
writeFileSync(out, Buffer.from(data.buffer));
