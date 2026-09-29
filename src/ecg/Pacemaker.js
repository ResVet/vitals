// Timing for the whole site. Schedules beats, synthesises the ECG, pleth and
// respiration traces, and exposes the mechanical state of the heart (how far
// the atria and ventricles are contracted) for the particle shader.
//
// ECG: sum of Gaussians per beat using the ECGSYN defaults from
// McSharry et al., "A dynamical model for generating synthetic electrocardiogram
// signals", IEEE Trans Biomed Eng 50(3):289-294, 2003.
//   angles ti = [-70, -15, 0, 15, 100] degrees (P, Q, R, S, T)
//   ai = [1.2, -5, 30, -7.5, 0.75], bi = [0.25, 0.1, 0.1, 0.1, 0.4]
// with ECGSYN's heart-rate scaling of angles and widths.

const DEG = Math.PI / 180;
const TI = [-70, -15, 0, 15, 100].map((d) => d * DEG);
const AI = [1.2, -5, 30, -7.5, 0.75];
const BI = [0.25, 0.1, 0.1, 0.1, 0.4];
// Wave amplitude from the closed form of the model (a * b^2), normalised to R.
const AMP = AI.map((a, i) => (a * BI[i] * BI[i]) / (AI[2] * BI[2] * BI[2]));

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function gauss(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export class Pacemaker {
  constructor({ baseHR = 72, rand = Math.random } = {}) {
    this.rand = rand;
    this.baseHR = baseHR;
    this.hr = baseHR;
    this.exertion = 0;
    this.time = 0;
    this.beats = []; // { t, rr, pvc }
    this.nextR = Infinity; // nothing scheduled until start()
    this.running = false;
    this.displayHR = baseHR;
    this.spo2 = 99;
    this.respRate = 16;
    this.respPhase = 0;
    this.listeners = new Set();
    this.state = { ecg: 0, vent: 0, atria: 0, sinceR: 10, rr: 60 / baseHR, beat: 0 };
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(firstBeatIn = 0.35) {
    this.running = true;
    this.nextR = this.time + firstBeatIn;
    this.nextRR = 60 / this.hr;
  }

  // Scrolling and fast pointer movement count as exercise.
  excite(amount) {
    this.exertion = Math.min(3.2, this.exertion + amount);
  }

  // Premature ventricular contraction: early, wide beat with no P wave,
  // followed by a compensatory pause.
  pvc() {
    if (!this.running) return;
    const last = this.beats[this.beats.length - 1];
    const now = this.time + 0.08;
    if (last && now - last.t < 0.32) return;
    if (this.nextR - now < 0.18) return;
    const skipped = this.nextR;
    this.nextR = now;
    this.pendingPVC = { resumeAt: skipped + this.nextRR };
  }

  get targetHR() {
    return this.baseHR + 62 * (1 - Math.exp(-this.exertion * 0.75));
  }

  update(dt) {
    this.time += dt;
    this.exertion *= Math.exp(-dt / 6);
    const target = this.targetHR;
    const rate = target > this.hr ? 0.9 : 0.22;
    this.hr += (target - this.hr) * (1 - Math.exp(-dt * rate));
    this.respRate = 16 + (this.hr - this.baseHR) * 0.12;
    this.respPhase += dt * (this.respRate / 60) * Math.PI * 2;

    while (this.running && this.time >= this.nextR) this.fire();

    const t = this.time;
    const last = this.beats[this.beats.length - 1];
    const sinceR = last ? t - last.t : 10;
    const rr = last ? last.rr : 60 / this.hr;
    const s = this.state;
    s.ecg = this.ecgAt(t);
    s.sinceR = sinceR;
    s.rr = rr;
    s.beat = last ? Math.exp(-sinceR * 7) : 0;
    const pvcScale = last && last.pvc ? 0.75 : 1;
    // Ventricles start squeezing about 40 ms after R and relax through the T wave.
    const sys = Math.min(0.34, 0.1 + rr * 0.24);
    s.vent = last ? smooth(0.04, 0.04 + sys * 0.55, sinceR) * (1 - smooth(sys, sys + 0.17, sinceR)) * pvcScale : 0;
    // Atria contract right after the P wave of the next beat.
    const toNext = this.running ? this.nextR - t : 10;
    const pr = 0.16;
    const nextIsPVC = !!this.pendingPVC && this.nextR <= t + pr;
    const atrialT = pr - toNext; // seconds since the P wave began
    s.atria = nextIsPVC ? 0 : smooth(0.02, 0.09, atrialT) * (1 - smooth(0.11, 0.2, atrialT));
    return s;
  }

  fire() {
    const t = this.nextR;
    const isPVC = !!this.pendingPVC;
    const prev = this.beats[this.beats.length - 1];
    const rr = prev ? t - prev.t : 60 / this.hr;
    this.beats.push({ t, rr: Math.max(0.3, Math.min(1.6, rr)), pvc: isPVC, hr: this.hr });
    while (this.beats.length && this.beats[0].t < t - 30) this.beats.shift();

    if (isPVC) {
      this.nextR = this.pendingPVC.resumeAt;
      this.pendingPVC = null;
    } else {
      // Respiratory sinus arrhythmia plus a little noise.
      const base = 60 / this.hr;
      this.nextRR = base * (1 + 0.035 * Math.sin(this.respPhase) + 0.012 * gauss(this.rand));
      this.nextR = t + this.nextRR;
    }

    const normal = this.beats.filter((b) => !b.pvc).slice(-5);
    if (normal.length >= 2) {
      let sum = 0;
      for (let i = 1; i < normal.length; i++) sum += normal[i].t - normal[i - 1].t;
      const avg = sum / (normal.length - 1);
      // skip averages that straddle a PVC pause
      if (avg < 1.8) this.displayHR = Math.round(60 / avg);
    } else this.displayHR = Math.round(this.hr);
    this.spo2 = Math.max(96, Math.min(99.4, this.spo2 + (this.rand() - 0.5) * 0.6 + (98.4 - this.spo2) * 0.1));

    for (const fn of this.listeners) fn({ t, pvc: isPVC, hr: this.displayHR });
  }

  // --- waveforms, evaluated at any time within the stored history -----------
  ecgAt(t) {
    let v = 0;
    const n = this.beats.length;
    for (let i = Math.max(0, n - 4); i < n; i++) v += this.complex(this.beats[i], t);
    if (this.running && this.nextR < Infinity) {
      v += this.complex({ t: this.nextR, rr: this.nextRR || 60 / this.hr, pvc: !!this.pendingPVC }, t);
    }
    // baseline wander with breathing, and a little noise
    v += 0.035 * Math.sin(this.respPhase * 0.5 + t * 0.2) + (this.rand() - 0.5) * 0.012;
    return v;
  }

  complex(beat, t) {
    const dtR = t - beat.t;
    if (dtR < -0.45 || dtR > 0.75) return 0;
    const hr = 60 / beat.rr;
    const f1 = Math.sqrt(hr / 60);
    const f2 = Math.sqrt(f1);
    const theta = (dtR / beat.rr) * 2 * Math.PI;
    if (beat.pvc) {
      // wide bizarre QRS, no P wave, T wave pointing the other way (timed in seconds)
      const g = (c, w) => Math.exp(-((dtR - c) ** 2) / (2 * w * w));
      return 1.3 * g(0, 0.028) - 0.55 * g(0.075, 0.03) - 0.42 * g(0.27, 0.07);
    }
    const ti = [TI[0] * f2, TI[1] * f1, TI[2], TI[3] * f1, TI[4] * f2];
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = BI[i] * f1;
      const d = theta - ti[i];
      v += AMP[i] * Math.exp(-(d * d) / (2 * b * b));
    }
    return v;
  }

  // Finger plethysmograph: arrives ~0.2 s after R, sharp upstroke,
  // dicrotic notch, slower diastolic run-off.
  plethAt(t) {
    let v = 0;
    const n = this.beats.length;
    for (let i = Math.max(0, n - 3); i < n; i++) {
      const b = this.beats[i];
      const x = t - b.t;
      if (x < 0 || x > 1.6) continue;
      const k = b.pvc ? 0.55 : 1;
      const up = 0.3;
      const sys = x < up ? Math.exp(-(((x - up) / 0.07) ** 2)) : Math.exp(-(((x - up) / 0.16) ** 2));
      const dia = 0.38 * Math.exp(-(((x - 0.56) / 0.1) ** 2));
      v += k * (sys + dia);
    }
    return v;
  }

  respAt(t) {
    // faster inspiration, slower expiration
    const ph = (((this.respPhase - (this.time - t) * (this.respRate / 60) * Math.PI * 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const x = ph / (Math.PI * 2);
    const w = x < 0.4 ? (x / 0.4) * 0.5 : 0.5 + ((x - 0.4) / 0.6) * 0.5;
    return 0.5 - 0.5 * Math.cos(w * Math.PI * 2);
  }

  get nibp() {
    const d = this.hr - this.baseHR;
    return { sys: Math.round(118 + d * 0.35), dia: Math.round(76 + d * 0.12) };
  }
}
