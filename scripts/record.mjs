// Records a frame sequence of the real page with a fixed clock, then encodes
// an MP4 and a GIF with ffmpeg. Needs the dev or preview server running.
// node scripts/record.mjs --url http://localhost:4173/ --out docs/rec --w 1280 --h 800
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), [])
);
const url = args.url || 'http://localhost:4173/';
const out = args.out || 'docs/rec';
const W = Number(args.w || 1280), H = Number(args.h || 800);
const theme = args.theme || 'monitor';
const fps = Number(args.fps || 15);
const step = 1 / 30;
const every = Math.round(30 / fps);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: theme === 'paper' ? 'light' : 'dark' });
await page.addInitScript((t) => { try { localStorage.setItem('vitals-theme', t); } catch {} }, theme);
await page.goto(`${url}?capture&particles=${args.particles || 256}`);
await page.waitForFunction(() => window.__vitals && /ready in/.test(document.getElementById('boot-log').textContent), null, { timeout: 180000 });
await page.waitForTimeout(300);

let n = 0;
async function shoot() {
  await page.screenshot({ path: `${out}/f${String(n++).padStart(4, '0')}.png`, timeout: 600000 });
}
async function hold(seconds) {
  const steps = Math.round(seconds / step);
  for (let i = 0; i < steps; i += every) {
    await page.evaluate(([k, dt]) => window.__vitals.step(k, dt), [every, step]);
    await shoot();
  }
}
async function scroll(fromY, toY, seconds) {
  const steps = Math.round(seconds / step);
  for (let i = 0; i < steps; i += every) {
    const t = Math.min(1, (i + every) / steps);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    await page.evaluate((y) => window.__vitals.scrollToY(y), fromY + (toY - fromY) * e);
    await page.evaluate(([k, dt]) => window.__vitals.step(k, dt), [every, step]);
    await shoot();
  }
}
const top = (sel) => page.evaluate((s) => document.querySelector(s).offsetTop, sel);

const plan = args.plan || 'intro';
if (plan === 'intro') {
  await hold(5.6);
  await hold(1.6);
  const y = await top('#history');
  await scroll(0, y + 60, 1.4);
  await hold(2.2);
} else if (plan === 'tour') {
  await hold(4.5);
  let y = 0;
  for (const sel of ['#history', '#labs', '#procedures', '#discharge']) {
    const ny = (await top(sel)) + 40;
    await scroll(y, ny, 1.2);
    await hold(1.8);
    y = ny;
  }
}
await browser.close();
console.log(`${n} frames`);

const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
ff(['-framerate', String(fps), '-i', `${out}/f%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', `${out}.mp4`]);
const gw = Number(args.gifw || 720);
ff(['-i', `${out}.mp4`, '-vf', `fps=${fps},scale=${gw}:-1:flags=lanczos,palettegen=max_colors=160:stats_mode=diff`, `${out}-palette.png`]);
ff(['-framerate', String(fps), '-i', `${out}/f%04d.png`, '-i', `${out}-palette.png`, '-lavfi', `scale=${gw}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, `${out}.gif`]);
console.log('encoded', `${out}.mp4`, `${out}.gif`);
