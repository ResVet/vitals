import './styles/main.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import Lenis from 'lenis';

import { Pacemaker } from './ecg/Pacemaker.js';
import { Monitor } from './ecg/Monitor.js';
import { Beeper } from './ecg/Beeper.js';
import { loadShapes } from './gl/shapes/index.js';
import { DNA_BASES, DNA_MESSAGE } from './gl/shapes/dna.js';
import { initCursor } from './ui/cursor.js';
import { initMagnetic, initTilt } from './ui/interactions.js';
import { initClock } from './ui/clock.js';
import { initTheme } from './ui/theme.js';
import { initForm } from './ui/form.js';
import { createToast } from './ui/toast.js';
import { createBoot } from './ui/boot.js';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);

const root = document.documentElement;
const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches && !capture;
const coarse = matchMedia('(pointer: coarse)').matches;
const isSmall = () => innerWidth < 900;

root.classList.add('booting');

// ---------------------------------------------------------------- quality
const lowPower = coarse || (navigator.hardwareConcurrency || 8) <= 4 || innerWidth < 900;
const size = Number(params.get('particles')) || (lowPower ? 144 : 256);
const COUNT = size * size;
document.querySelectorAll('[data-count]').forEach((el) => (el.textContent = COUNT.toLocaleString('en-US')));

// ---------------------------------------------------------------- core state
const pm = new Pacemaker();
const monitor = new Monitor(document.getElementById('ecg'), pm);
const beeper = new Beeper();
const toast = createToast(document.getElementById('toast'));
const boot = createBoot();
let exp = null;
let lenis = null;
let active = 'heart';
let introDone = false;

// ---------------------------------------------------------------- layout per section
// Where the particle rig sits for each section: desktop (d) and small screens (m).
const LAYOUT = {
  heart: { d: { x: 0.95, y: 0.1, z: 0, s: 0.76, rx: 0, ry: -0.16, rz: 0, o: 1 }, m: { x: 0, y: 1.45, z: 0, s: 0.86, rx: 0, ry: -0.1, rz: 0, o: 1 } },
  dna: { d: { x: 1.7, y: 0.05, z: -0.2, s: 0.86, rx: 0, ry: 0, rz: -0.42, o: 1 }, m: { x: 0.7, y: 1.2, z: -0.6, s: 0.7, rx: 0, ry: 0, rz: -0.9, o: 0.6 } },
  neuron: { d: { x: -1.5, y: 0.05, z: 0, s: 0.66, rx: 0, ry: 0, rz: 0.12, o: 1 }, m: { x: -0.2, y: 1.3, z: -0.6, s: 0.6, rx: 0, ry: 0, rz: 0.1, o: 0.6 } },
  chip: { d: { x: 0, y: -0.3, z: -0.9, s: 0.96, rx: 0.1, ry: 0, rz: 0, o: 0.55 }, m: { x: 0, y: 1.1, z: -1.2, s: 0.72, rx: 0.1, ry: 0, rz: 0, o: 0.45 } },
  globe: { d: { x: 1.85, y: 0.1, z: 0, s: 0.78, rx: 0.3, ry: 0, rz: 0.1, o: 1 }, m: { x: 0.6, y: 1.4, z: -0.5, s: 0.7, rx: 0.3, ry: 0, rz: 0.1, o: 0.6 } },
};
const layoutFor = (name) => LAYOUT[name][isSmall() ? 'm' : 'd'];

function placeRig(name, duration = 1.9) {
  if (!exp) return;
  const L = layoutFor(name);
  const opts = { duration, ease: 'power3.inOut', overwrite: 'auto' };
  gsap.to(exp.rig.position, { x: L.x, y: L.y, z: L.z, ...opts });
  gsap.to(exp.rig.rotation, { x: L.rx, y: L.ry, z: L.rz, ...opts });
  gsap.to(exp.rig.scale, { x: L.s, y: L.s, z: L.s, ...opts });
  gsap.to(exp.particles.uniforms.uOpacity, { value: L.o, duration: duration * 0.7, overwrite: 'auto' });
}

function activate(name) {
  if (name === active && introDone) return;
  active = name;
  document.querySelectorAll('.nav a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.nav === document.querySelector(`[data-shape="${name}"]`)?.id)));
  if (!exp || !introDone) return;
  exp.morphTo(name, { gsap, duration: reduced ? 0.9 : 2.1, ordered: 0.55, flight: reduced ? 0.4 : 2.4 });
  placeRig(name, reduced ? 0.8 : 1.9);
}

// ---------------------------------------------------------------- vitals readout
const vHR = document.getElementById('v-hr');
const vSpO2 = document.getElementById('v-spo2');
const vNIBP = document.getElementById('v-nibp');
const vResp = document.getElementById('v-resp');
const vHeart = document.getElementById('v-heart');
const sideHR = document.getElementById('side-hr');
const brandDot = document.getElementById('brand-dot');
const alarm = document.getElementById('alarm');
let beatCount = 0;
let userPVC = false;

pm.on(({ pvc, hr }) => {
  beatCount++;
  vHR.textContent = hr;
  sideHR.textContent = hr;
  vSpO2.textContent = Math.round(pm.spo2);
  vResp.textContent = Math.round(pm.respRate);
  if (beatCount % 6 === 1) {
    const { sys, dia } = pm.nibp;
    vNIBP.textContent = `${sys}/${dia}`;
  }
  for (const el of [vHeart, brandDot]) {
    el.classList.add('beat');
    setTimeout(() => el.classList.remove('beat'), 140);
  }
  alarm.textContent = hr >= 100 ? 'Sinus tachycardia' : '';
  beeper.beep(pm.spo2, pvc);
  if (pvc && userPVC) {
    userPVC = false;
    toast('PVC: an early, wide beat from the ventricle, then a pause while the rhythm resets.', 5200);
  }
});

// ---------------------------------------------------------------- DNA read-out
const dnaRead = document.getElementById('dna-read');
const dnaState = { scan: -3 };
let dnaTween = null;
function startDNAScan() {
  if (dnaTween || !exp) return;
  dnaTween = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
  dnaTween.fromTo(dnaState, { scan: -3 }, { scan: DNA_BASES.length + 2, duration: 7.5, ease: 'none' });
}
function stopDNAScan() {
  dnaTween?.kill();
  dnaTween = null;
  dnaState.scan = -3;
}
function renderDNAReadout() {
  if (!dnaRead) return;
  const done = Math.max(0, Math.min(DNA_MESSAGE.length, Math.floor((dnaState.scan + 0.5) / 4)));
  const letters = DNA_MESSAGE.split('').map((c, i) => (i < done ? c : '_'));
  dnaRead.textContent = `Reading ${letters.join(' ')}`;
}

// ---------------------------------------------------------------- loop
let lastScrollY = scrollY;
let perfSamples = [];
let perfChecked = false;

function frame(dt) {
  pm.update(dt);
  monitor.draw();
  if (exp) {
    exp.particles.uniforms.uScan.value = active === 'dna' ? dnaState.scan : -10;
    exp.update(dt, lenis ? lenis.scroll : scrollY);
  }
  if (active === 'dna') renderDNAReadout();
  if (!lenis) {
    const v = scrollY - lastScrollY;
    lastScrollY = scrollY;
    if (Math.abs(v) > 0.5) pm.excite(Math.min(0.06, Math.abs(v) * 0.0009));
  }
  // Drop the pixel ratio once if the first seconds after the intro run slow.
  if (introDone && !perfChecked && exp) {
    perfSamples.push(dt);
    if (perfSamples.length === 120) {
      perfChecked = true;
      const avg = perfSamples.reduce((a, b) => a + b, 0) / perfSamples.length;
      if (avg > 1 / 42) exp.setPixelRatio(Math.max(1, exp.dpr * 0.7));
    }
  }
}

if (!capture) {
  gsap.ticker.add((time, deltaMs) => {
    lenis?.raf(time * 1000);
    frame(Math.min(0.05, deltaMs / 1000));
  });
  gsap.ticker.lagSmoothing(0);
}

// ---------------------------------------------------------------- start
async function start() {
  boot.line('VITALS 1.0  //  portfolio of Raffa Gamadan', true);
  boot.line('');
  const labels = {
    flatline: 'laying out lead II',
    heart: 'growing the heart',
    dna: 'winding the helix',
    neuron: 'branching dendrites',
    chip: 'routing PCB traces',
    globe: 'mapping coastlines',
  };
  const lines = {};
  for (const k of Object.keys(labels)) lines[k] = boot.line(`> ${labels[k].padEnd(22, ' ')} ....`, true);

  let shapes = null;
  const t0 = performance.now();
  // fetch the WebGL code while the worker builds the shapes
  const experienceModule = import('./gl/Experience.js');
  try {
    shapes = await loadShapes(COUNT, ({ name, ms }) => {
      boot.update(lines[name], `> ${labels[name].padEnd(22, ' ')} ${COUNT.toLocaleString('en-US')} pts  ${Math.round(ms)} ms`);
    });
  } catch (err) {
    console.warn(err);
  }

  if (shapes) {
    try {
      const { Experience } = await experienceModule;
      exp = new Experience({
        canvas: document.getElementById('gl'),
        size,
        shapes,
        pacemaker: pm,
        quality: { maxDpr: lowPower ? 1.5 : 2 },
      });
      exp.resize(innerWidth, innerHeight);
      exp.setTheme(themeName());
      const L = layoutFor('heart');
      exp.rig.position.set(L.x, L.y, L.z);
      exp.rig.scale.setScalar(L.s);
      exp.rig.rotation.set(L.rx, L.ry, L.rz);
    } catch (err) {
      console.warn('WebGL unavailable, continuing without particles:', err);
      exp = null;
    }
  }
  if (!exp) root.classList.add('no-webgl');
  boot.line('');
  boot.line(`> ready in ${Math.round(performance.now() - t0)} ms. connecting leads...`);
  await document.fonts?.ready;
  intro();
}

function intro() {
  const heroTl = buildHeroReveal();
  const finish = () => {
    if (introDone) return;
    introDone = true;
    boot.hide();
    root.classList.remove('booting');
    if (!pm.running) pm.start(0.1);
    if (exp && exp.current !== 'heart') exp.morphTo('heart', { gsap, duration: 1.2, ordered: 1, flight: 1 });
    heroTl.play();
    setupScroll();
  };
  document.getElementById('boot-skip').addEventListener('click', () => {
    introTl?.progress(1);
    finish();
  });
  addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') {
      introTl?.progress(1);
      finish();
      removeEventListener('keydown', onKey);
    }
  });

  if (!exp || reduced) {
    gsap.delayedCall(reduced ? 0.2 : 0.6, () => {
      if (exp) exp.morphTo('heart', { gsap, duration: 0.8, ordered: 1, flight: 0.4 });
      pm.start(0.3);
      finish();
    });
    return;
  }

  const pu = exp.particles.uniforms;
  pu.uIntroX.value = -5.2;
  pu.uIntroAmp.value = 0.9;
  var introTl = gsap.timeline({ delay: 0.35 });
  introTl
    .to(pu.uIntroX, { value: 0, duration: 1.05, ease: 'none' })
    .add(() => {
      pm.start(0.01);
      exp.morphTo('heart', { gsap, duration: 2.8, ordered: 1, flight: 3.4 });
      exp.impulse(0, 0, 1.2);
    })
    .to(pu.uIntroX, { value: 5.5, duration: 1.1, ease: 'none' })
    .to(pu.uIntroAmp, { value: 0, duration: 0.5 }, '<0.2')
    .add(finish, '<0.1');
}

function buildHeroReveal() {
  const tl = gsap.timeline({ paused: true });
  tl.fromTo('.topbar', { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 0);
  tl.fromTo('.monitor', { opacity: 0, yPercent: 40 }, { opacity: 1, yPercent: 0, duration: 1.1, ease: 'power3.out' }, 0.1);
  tl.fromTo('main', { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0);
  tl.fromTo('.colophon', { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0);
  const h1 = document.querySelector('.hero [data-split]');
  if (h1 && !reduced) {
    const split = SplitText.create(h1, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    tl.from(split.lines, { yPercent: 115, duration: 1.25, ease: 'expo.out', stagger: 0.09 }, 0.15);
  }
  const kicker = document.querySelector('.hero [data-scramble]');
  if (kicker && !reduced) tl.from(kicker, { duration: 1.1, scrambleText: { text: '', chars: '01<>/-+*', speed: 0.6 } }, 0.1);
  tl.from('.hero [data-fade]', { opacity: 0, y: 22, duration: 1.1, ease: 'power3.out', stagger: 0.08 }, 0.35);
  return tl;
}

// ---------------------------------------------------------------- scroll
function setupScroll() {
  if (!reduced && !capture) {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.95, smoothWheel: true });
    lenis.on('scroll', (l) => {
      ScrollTrigger.update();
      pm.excite(Math.min(0.06, Math.abs(l.velocity) * 0.0009));
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = id.length > 1 ? document.querySelector(id) : null;
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      history.replaceState(null, '', id);
    })
  );

  // morph the particles as each section takes over
  document.querySelectorAll('[data-shape]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 55%',
      end: 'bottom 45%',
      onToggle: (self) => {
        if (!self.isActive) return;
        activate(sec.dataset.shape);
        if (sec.dataset.shape === 'dna') startDNAScan();
        else stopDNAScan();
      },
    });
  });

  // the tall hero monitor folds down into a slim strip
  const heroH = () => (innerWidth < 600 ? 104 : isSmall() ? 124 : 168);
  const slimH = () => (isSmall() ? 40 : 44);
  const monitorEl = document.getElementById('monitor');
  const setMonitor = (p) => {
    const h = heroH() + (slimH() - heroH()) * p;
    root.style.setProperty('--mon-h', `${h}px`);
    monitorEl.style.setProperty('--expand', String(1 - p));
    monitorEl.style.setProperty('--ecg-row', String(0.31 + (0.62 - 0.31) * p));
    monitor.expand = 1 - p;
    monitor.resize();
  };
  setMonitor(0);
  ScrollTrigger.create({
    trigger: '.hero',
    start: 'top top',
    end: 'bottom 55%',
    scrub: true,
    onUpdate: (self) => setMonitor(self.progress),
  });

  const topbar = document.getElementById('topbar');
  ScrollTrigger.create({ start: 24, end: 'max', onToggle: (self) => topbar.classList.toggle('scrolled', self.isActive) });

  // text reveals
  if (!reduced) {
    document.querySelectorAll('.section [data-split]').forEach((el) => {
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'split-line',
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, { yPercent: 115, duration: 1.2, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: el, start: 'top 82%', once: true } }),
      });
    });
    document.querySelectorAll('.section [data-scramble]').forEach((el) => {
      gsap.from(el, { duration: 1.2, scrambleText: { text: '', chars: '01<>/-+*', speed: 0.6 }, scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
    });
    document.querySelectorAll('.section [data-fade]').forEach((el) => {
      gsap.from(el, { opacity: 0, y: 30, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
    document.querySelectorAll('.timeline li').forEach((li, i) => {
      gsap.from(li, { opacity: 0, x: -14, duration: 0.8, delay: i * 0.05, ease: 'power3.out', scrollTrigger: { trigger: li, start: 'top 92%', once: true } });
    });
  }
  ScrollTrigger.refresh();
}

// ---------------------------------------------------------------- pointer
const cursor = initCursor(gsap);
const ndc = { x: 0, y: 0 };
let lastMove = { x: 0, y: 0, t: 0 };
function nearHeart(clientX, clientY) {
  if (!exp || active !== 'heart' || exp.current !== 'heart') return false;
  const c = exp.rigScreenPosition(innerWidth, innerHeight);
  const r = Math.min(innerWidth, innerHeight) * 0.3 * exp.rig.scale.x;
  return Math.hypot(clientX - c.x, (clientY - c.y) * 0.8) < r;
}

addEventListener('pointermove', (e) => {
  ndc.x = (e.clientX / innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / innerHeight) * 2 + 1;
  exp?.setPointer(ndc.x, ndc.y, true);
  const now = performance.now();
  const dt = Math.max(1, now - lastMove.t);
  const speed = Math.hypot(e.clientX - lastMove.x, e.clientY - lastMove.y) / dt;
  if (speed > 2.5) pm.excite(0.004 * Math.min(speed, 8));
  lastMove = { x: e.clientX, y: e.clientY, t: now };
  const overUI = e.target.closest?.('a, button, input, textarea, label, .case, .lab-report, .form, .vitals-panel, .topbar, .monitor');
  cursor?.force(!overUI && nearHeart(e.clientX, e.clientY) ? 'PVC' : null);
});
document.addEventListener('pointerleave', () => exp?.setPointer(ndc.x, ndc.y, false));
addEventListener('blur', () => exp?.setPointer(ndc.x, ndc.y, false));

addEventListener('pointerup', (e) => {
  if (!introDone || !exp) return;
  if (e.target.closest?.('a, button, input, textarea, label, select, .form, .case, .lab-report, .topbar, .monitor')) return;
  const x = (e.clientX / innerWidth) * 2 - 1;
  const y = -(e.clientY / innerHeight) * 2 + 1;
  if (nearHeart(e.clientX, e.clientY)) {
    userPVC = true;
    pm.pvc();
    exp.impulse(x, y, 2.4);
  } else {
    exp.impulse(x, y, 1.6);
  }
});

// ---------------------------------------------------------------- chrome
initClock(document.getElementById('clock'));
initMagnetic(gsap);
initTilt(gsap);
initForm();

const themeName = () => (root.dataset.theme === 'paper' || root.dataset.theme === 'light' ? 'paper' : 'monitor');
const themeColors = () => {
  const cs = getComputedStyle(root);
  monitor.setColors({
    ecg: cs.getPropertyValue('--trace-ecg').trim(),
    pleth: cs.getPropertyValue('--trace-pleth').trim(),
    resp: cs.getPropertyValue('--trace-resp').trim(),
    glow: themeName() !== 'paper',
  });
};
initTheme({
  reduced,
  onChange: (theme) => {
    themeColors();
    if (exp) {
      exp.setTheme(theme);
      exp.update(0, lenis ? lenis.scroll : scrollY);
    }
    monitor.draw();
  },
});
themeColors();

const soundBtn = document.getElementById('sound-btn');
soundBtn.addEventListener('click', async () => {
  const on = soundBtn.getAttribute('aria-pressed') !== 'true';
  if (on) {
    const ok = await beeper.enable();
    if (!ok) return;
  } else beeper.disable();
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? 'Turn off the heartbeat sound' : 'Turn on the heartbeat sound');
  toast(on ? 'Beep on. The pitch follows SpO2, like a real pulse oximeter.' : 'Beep off.');
});

let resizeTimer = null;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    exp?.resize(innerWidth, innerHeight);
    monitor.resize();
    if (introDone) placeRig(active, 0.6);
    ScrollTrigger.refresh();
  }, 120);
});

// ---------------------------------------------------------------- capture hooks (README media)
if (capture) {
  let clock = 0;
  window.__vitals = {
    step(n = 1, dt = 1 / 30) {
      for (let i = 0; i < n; i++) {
        clock += dt;
        gsap.updateRoot(clock);
        frame(dt);
      }
      return clock;
    },
    get ready() {
      return introDone;
    },
    activate,
    scrollToY(y) {
      window.scrollTo(0, y);
      ScrollTrigger.update();
    },
    scrollTo(sel, offset = 0) {
      const el = document.querySelector(sel);
      window.scrollTo(0, (el ? el.offsetTop : 0) + offset);
      ScrollTrigger.update();
    },
    pm,
    get exp() {
      return exp;
    },
  };
  gsap.ticker.remove(gsap.updateRoot);
}

start();
