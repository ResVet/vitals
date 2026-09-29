// Bedside-monitor strip drawn on a 2D canvas. Samples are recorded into ring
// buffers at 250 Hz as time passes, then drawn with the sweep-and-erase style
// real monitors use: the trace is written left to right over the old one,
// with a small blank gap just ahead of the write head.
const RATE = 250;
const SECONDS = 24;

export class Monitor {
  constructor(canvas, pacemaker) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pm = pacemaker;
    this.cap = RATE * SECONDS;
    this.buf = { ecg: new Float32Array(this.cap), pleth: new Float32Array(this.cap), resp: new Float32Array(this.cap) };
    this.head = 0;
    this.count = 0;
    this.sampleT = null;
    this.speed = 100; // CSS px per second, roughly 25 mm/s on a 96 dpi screen
    this.expand = 1; // 1: three channels, 0: slim lead II strip
    this.colors = { ecg: '#3dff95', pleth: '#35d3ff', resp: '#ffd24d' };
    this.glow = true;
    this.resize();
  }

  setColors({ ecg, pleth, resp, glow }) {
    Object.assign(this.colors, { ecg, pleth, resp });
    this.glow = glow;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  record() {
    const pm = this.pm;
    if (this.sampleT === null) this.sampleT = pm.time;
    // do not try to catch up after long pauses (background tabs)
    if (pm.time - this.sampleT > 2) this.sampleT = pm.time - 2;
    while (this.sampleT + 1 / RATE <= pm.time) {
      this.sampleT += 1 / RATE;
      const i = this.head;
      this.buf.ecg[i] = pm.running ? pm.ecgAt(this.sampleT) : (Math.random() - 0.5) * 0.01;
      this.buf.pleth[i] = pm.plethAt(this.sampleT);
      this.buf.resp[i] = pm.respAt(this.sampleT);
      this.head = (i + 1) % this.cap;
      this.count = Math.min(this.count + 1, this.cap);
    }
  }

  draw() {
    this.record();
    const { ctx, dpr, w, h } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.count) return;

    const e = this.expand;
    const rows = [];
    const ecgH = h * (0.46 + 0.54 * (1 - e));
    rows.push({ key: 'ecg', top: 0, height: ecgH, base: 0.66, gain: 0.52, color: this.colors.ecg });
    if (e > 0.02) {
      const rest = h - ecgH;
      rows.push({ key: 'pleth', top: ecgH, height: rest * 0.55, base: 0.86, gain: 0.62, color: this.colors.pleth, alpha: e });
      rows.push({ key: 'resp', top: ecgH + rest * 0.55, height: rest * 0.45, base: 0.84, gain: 0.6, color: this.colors.resp, alpha: e });
    }

    const pxPerSample = this.speed / RATE;
    const sweepX = (this.sampleT * this.speed) % w;
    const gap = 18;
    const n = Math.min(this.count, Math.floor((w - gap) / pxPerSample));

    for (const row of rows) {
      const data = this.buf[row.key];
      const y0 = row.top + row.height * row.base;
      const scale = row.height * row.gain;
      ctx.beginPath();
      let wrapped = false;
      let headY = y0;
      for (let k = 0; k < n; k++) {
        const idx = (this.head - 1 - k + this.cap) % this.cap;
        let x = sweepX - k * pxPerSample;
        const y = y0 - data[idx] * scale;
        if (k === 0) {
          headY = y;
          ctx.moveTo(x, y);
          continue;
        }
        if (x < 0) {
          x += w;
          if (!wrapped) {
            wrapped = true;
            ctx.moveTo(x, y);
            continue;
          }
        }
        ctx.lineTo(x, y);
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const a = row.alpha ?? 1;
      if (this.glow) {
        ctx.globalAlpha = 0.16 * a;
        ctx.strokeStyle = row.color;
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.strokeStyle = row.color;
      ctx.lineWidth = this.glow ? 1.6 : 1.3;
      ctx.stroke();
      // write head
      ctx.beginPath();
      ctx.arc(sweepX, headY, this.glow ? 2.4 : 1.8, 0, Math.PI * 2);
      ctx.fillStyle = row.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
