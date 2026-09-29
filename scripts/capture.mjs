// Screenshots (and optional frame sequences) of the real page in headless Chromium.
// node scripts/capture.mjs --url http://localhost:5173/ --out shots --w 1440 --h 900 --particles 256 \
//   --plan "intro@0:30,hero@0:90,history:#history@0:90"
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), [])
);
const url = args.url || 'http://localhost:5173/';
const out = args.out || 'shots';
const W = Number(args.w || 1440), H = Number(args.h || 900);
const particles = args.particles || '256';
const theme = args.theme || 'monitor';
const dsf = Number(args.dsf || 1);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dsf, colorScheme: theme === 'paper' ? 'light' : 'dark', reducedMotion: 'no-preference' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.addInitScript((t) => { try { localStorage.setItem('vitals-theme', t); } catch {} }, theme);
await page.goto(`${url}?capture&particles=${particles}`);
await page.waitForFunction(() => window.__vitals && window.__vitals.exp !== undefined && /ready in/.test(document.getElementById('boot-log').textContent), null, { timeout: 180000 });
await page.waitForTimeout(300);

// plan items: name:selector@offset:frames  (selector optional)
const plan = (args.plan || 'hero@0:120').split(',');
for (const item of plan) {
  const [head, framesStr] = item.split(/:(?=\d+$)/);
  const [nameSel, offsetStr] = head.split('@');
  const [name, sel] = nameSel.split(':');
  const frames = Number(framesStr || 60);
  if (sel) await page.evaluate(([s, o]) => window.__vitals.scrollTo(s, Number(o)), [sel, offsetStr || '0']);
  await page.evaluate((n) => window.__vitals.step(n, 1 / 30), frames);
  const t = Date.now();
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 600000 });
  console.log(`${name}: ${frames} frames, shot in ${Date.now() - t} ms`);
}
console.log(logs.filter((l) => !l.includes('[vite]')).join('\n'));
await browser.close();
