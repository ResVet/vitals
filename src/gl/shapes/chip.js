// A microcontroller board: QFN package with a pixel-font marking, pads,
// 45-degree fan-out traces ending in vias, castellated edge pads, a few SMD
// parts and a meander PCB antenna along the top edge (the zig-zag you see on
// ESP32 modules). Built flat, then tilted back so it lies like a board on a desk.
import { Cloud, gauss, resample } from './util.js';

export const CHIP_CLASS = { SUBSTRATE: 0, EDGE: 1, PACKAGE: 2, TEXT: 3, PAD: 4, TRACE: 5, VIA: 6, ANTENNA: 7, COMPONENT: 8 };

const FONT = {
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

const BOARD = { w: 4.4, h: 3.0, r: 0.14 };
const PKG = { cx: 0, cy: -0.22, half: 0.6, top: 0.16 };
const TILT_X = (-52 * Math.PI) / 180;
const TILT_Z = (10 * Math.PI) / 180;

export function generateChip(N, rand) {
  const cloud = new Cloud(N);
  const flat = new Cloud(N);
  const P = (x, y, z, cls, s = 0) => flat.push(x, y, z, cls, s);

  const budget = {
    substrate: Math.round(N * 0.1),
    edge: Math.round(N * 0.035),
    pkg: Math.round(N * 0.12),
    text: Math.round(N * 0.05),
    pad: Math.round(N * 0.04),
    trace: Math.round(N * 0.3),
    via: Math.round(N * 0.06),
    antenna: Math.round(N * 0.1),
    comp: Math.round(N * 0.07),
  };

  // Board substrate: a jittered grid of faint dots.
  for (let i = 0; i < budget.substrate; i++) {
    const gx = Math.round((rand() - 0.5) * BOARD.w / 0.08) * 0.08;
    const gy = Math.round((rand() - 0.5) * BOARD.h / 0.08) * 0.08;
    P(gx + gauss(rand) * 0.004, gy + gauss(rand) * 0.004, -0.02, CHIP_CLASS.SUBSTRATE);
  }

  // Board outline with rounded corners.
  const hw = BOARD.w / 2 - BOARD.r, hh = BOARD.h / 2 - BOARD.r;
  const rect = [];
  for (let q = 0; q < 4; q++) {
    const cx = q === 0 || q === 3 ? hw : -hw;
    const cy = q < 2 ? hh : -hh;
    for (let k = 0; k <= 8; k++) {
      const t = (q * Math.PI) / 2 + (k / 8) * (Math.PI / 2);
      rect.push([cx + Math.cos(t) * BOARD.r, cy + Math.sin(t) * BOARD.r, 0]);
    }
  }
  rect.push(rect[0]);
  const edge = resample(rect, 0.003);
  for (let i = 0; i < budget.edge; i++) {
    const p = edge.points[Math.floor(rand() * edge.points.length)];
    P(p[0] + gauss(rand) * 0.004, p[1] + gauss(rand) * 0.004, 0, CHIP_CLASS.EDGE);
  }

  // Package: top face, bevelled side walls.
  for (let i = 0; i < budget.pkg; i++) {
    const r = rand();
    if (r < 0.7) {
      P(PKG.cx + (rand() * 2 - 1) * PKG.half, PKG.cy + (rand() * 2 - 1) * PKG.half, PKG.top, CHIP_CLASS.PACKAGE);
    } else {
      const side = Math.floor(rand() * 4);
      const t = rand() * 2 - 1;
      const z = rand() * PKG.top;
      const x = side < 2 ? PKG.cx + t * PKG.half : PKG.cx + (side === 2 ? -1 : 1) * PKG.half;
      const y = side < 2 ? PKG.cy + (side === 0 ? -1 : 1) * PKG.half : PKG.cy + t * PKG.half;
      P(x, y, z, CHIP_CLASS.PACKAGE);
    }
  }

  // Marking: two lines of pixel text plus a pin-1 dot.
  const lines = [
    { text: 'VITALS', px: 0.026, y: PKG.cy + 0.14 },
    { text: 'RG 2026', px: 0.016, y: PKG.cy - 0.12 },
  ];
  const pixels = [];
  for (const line of lines) {
    const width = line.text.length * 6 - 1;
    for (let c = 0; c < line.text.length; c++) {
      const g = FONT[line.text[c]];
      for (let row = 0; row < 7; row++)
        for (let col = 0; col < 5; col++)
          if (g[row][col] === '1')
            pixels.push({ x: PKG.cx + (c * 6 + col - width / 2 + 0.5) * line.px, y: line.y + (3 - row) * line.px, s: line.px });
    }
  }
  for (let i = 0; i < 90; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.035;
    P(PKG.cx - PKG.half + 0.1 + Math.cos(a) * r, PKG.cy + PKG.half - 0.1 + Math.sin(a) * r, PKG.top + 0.002, CHIP_CLASS.TEXT);
  }
  const perPixel = Math.max(3, Math.floor((budget.text - 90) / pixels.length));
  for (const px of pixels)
    for (let j = 0; j < perPixel; j++) P(px.x + (rand() - 0.5) * px.s * 0.9, px.y + (rand() - 0.5) * px.s * 0.9, PKG.top + 0.003, CHIP_CLASS.TEXT);

  // Pads and fan-out traces on all four sides.
  const perSide = 10;
  const pitch = (PKG.half * 2 - 0.2) / (perSide - 1);
  const traces = [];
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < perSide; i++) {
      const o = -PKG.half + 0.1 + i * pitch; // offset along the side
      // local axes: n = outward normal, t = along the side
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]][side];
      const t = [[0, 1], [0, 1], [1, 0], [1, 0]][side];
      const base = [PKG.cx + n[0] * PKG.half + t[0] * o, PKG.cy + n[1] * PKG.half + t[1] * o];
      traces.push({ side, i, o, n, t, base });
    }
  }
  const padPts = Math.floor(budget.pad / traces.length);
  for (const tr of traces) {
    for (let j = 0; j < padPts; j++) {
      const along = (rand() - 0.5) * 0.045;
      const out = rand() * 0.1;
      P(tr.base[0] + tr.t[0] * along + tr.n[0] * out, tr.base[1] + tr.t[1] * along + tr.n[1] * out, 0.005, CHIP_CLASS.PAD);
    }
  }
  const paths = [];
  for (const tr of traces) {
    // top side stays short so the antenna has room
    const reach = tr.side === 2 ? 0.6 : tr.side === 3 ? 0.46 : 1.2;
    const fan = tr.side === 2 ? 1.3 : 1.75;
    const lateral = tr.o * (fan - 1);
    const p0 = [tr.base[0] + tr.n[0] * 0.1, tr.base[1] + tr.n[1] * 0.1, 0];
    const p1 = [p0[0] + tr.n[0] * 0.14, p0[1] + tr.n[1] * 0.14, 0];
    const diag = Math.abs(lateral);
    const p2 = [p1[0] + tr.n[0] * diag + tr.t[0] * lateral, p1[1] + tr.n[1] * diag + tr.t[1] * lateral, 0];
    const p3 = [p2[0] + tr.n[0] * Math.max(0.05, reach - diag), p2[1] + tr.n[1] * Math.max(0.05, reach - diag), 0];
    // stagger lengths a little so the ends do not line up like a comb
    const jog = (tr.i % 3) * 0.09;
    const p4 = [p3[0] + tr.n[0] * jog, p3[1] + tr.n[1] * jog, 0];
    paths.push({ pts: [p0, p1, p2, p3, p4], end: p4 });
  }
  const lengths = paths.map((p) => resample(p.pts, 0.01).length);
  const totalLen = lengths.reduce((a, b) => a + b, 0);
  paths.forEach((p, k) => {
    const r = resample(p.pts, 0.003);
    const n = Math.round((budget.trace * lengths[k]) / totalLen);
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(rand() * r.points.length);
      const q = r.points[idx];
      P(q[0] + gauss(rand) * 0.006, q[1] + gauss(rand) * 0.006, 0.002, CHIP_CLASS.TRACE, r.arc[idx] * 10 + 25 * (k % 3));
    }
  });

  // Vias at trace ends.
  const perVia = Math.floor(budget.via / paths.length);
  paths.forEach((p, k) => {
    for (let j = 0; j < perVia; j++) {
      const a = rand() * Math.PI * 2;
      const ring = rand() < 0.75;
      const r = ring ? 0.034 + gauss(rand) * 0.003 : Math.sqrt(rand()) * 0.012;
      P(p.end[0] + Math.cos(a) * r, p.end[1] + Math.sin(a) * r, 0.003, CHIP_CLASS.VIA, lengths[k] * 10 + 25 * (k % 3));
    }
  });

  // Meander antenna along the top edge.
  const ant = [];
  const ax0 = -1.9, ax1 = 0.55, ay0 = 0.96, ay1 = 1.32, step = 0.11;
  ant.push([ax0 + 2.35, ay0 - 0.3, 0], [ax1, ay0 - 0.3, 0], [ax1, ay0, 0]);
  let x = ax1, up = true;
  while (x - step > ax0) {
    ant.push([x, up ? ay1 : ay0, 0]);
    x -= step;
    ant.push([x, up ? ay1 : ay0, 0]);
    up = !up;
  }
  const antenna = resample(ant, 0.003);
  for (let i = 0; i < budget.antenna; i++) {
    const idx = Math.floor(rand() * antenna.points.length);
    const q = antenna.points[idx];
    P(q[0] + gauss(rand) * 0.007, q[1] + gauss(rand) * 0.007, 0.002, CHIP_CLASS.ANTENNA, (antenna.arc[idx] / antenna.length) * 99);
  }

  // SMD parts: capacitors, a crystal, an LED, a USB connector, castellations.
  const boxes = [
    { x: 0.95, y: 0.35, w: 0.16, h: 0.08, fill: 0.5 },
    { x: -0.95, y: 0.35, w: 0.16, h: 0.08, fill: 0.5 },
    { x: 0.95, y: -0.8, w: 0.16, h: 0.08, fill: 0.5 },
    { x: -0.95, y: -0.8, w: 0.16, h: 0.08, fill: 0.5 },
    { x: 1.35, y: 0.62, w: 0.34, h: 0.17, fill: 0.2 },
    { x: -1.4, y: 0.62, w: 0.12, h: 0.12, fill: 0.9 },
    { x: 0, y: -1.3, w: 0.62, h: 0.3, fill: 0.15 },
  ];
  const castellations = [];
  for (let k = 0; k < 9; k++) {
    castellations.push([BOARD.w / 2, -1.05 + k * 0.2], [-BOARD.w / 2, -1.05 + k * 0.2]);
  }
  const compBoxes = Math.round(budget.comp * 0.7);
  for (let i = 0; i < compBoxes; i++) {
    const b = boxes[Math.floor(rand() * boxes.length)];
    let px, py;
    if (rand() < b.fill) {
      px = b.x + (rand() - 0.5) * b.w;
      py = b.y + (rand() - 0.5) * b.h;
    } else {
      const t = rand() * 2 * (b.w + b.h);
      if (t < b.w) { px = b.x - b.w / 2 + t; py = b.y - b.h / 2; }
      else if (t < b.w + b.h) { px = b.x + b.w / 2; py = b.y - b.h / 2 + (t - b.w); }
      else if (t < 2 * b.w + b.h) { px = b.x + b.w / 2 - (t - b.w - b.h); py = b.y + b.h / 2; }
      else { px = b.x - b.w / 2; py = b.y + b.h / 2 - (t - 2 * b.w - b.h); }
    }
    P(px, py, 0.04, CHIP_CLASS.COMPONENT);
  }
  while (flat.count < flat.N && flat.count < budget.substrate + budget.edge + budget.pkg + budget.text + budget.pad + budget.trace + budget.via + budget.antenna + budget.comp) {
    const c = castellations[Math.floor(rand() * castellations.length)];
    const a = rand() * Math.PI;
    const r = 0.05 + gauss(rand) * 0.003;
    const sx = c[0] > 0 ? -1 : 1;
    P(c[0] + sx * Math.sin(a) * r, c[1] + Math.cos(a) * r, 0.003, CHIP_CLASS.PAD);
  }
  flat.fill(rand, 0.004);

  // Tilt back and rotate a touch.
  const cx = Math.cos(TILT_X), sx = Math.sin(TILT_X), cz = Math.cos(TILT_Z), sz = Math.sin(TILT_Z);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    let x0 = flat.data[o], y0 = flat.data[o + 1], z0 = flat.data[o + 2];
    // z rotation
    const x1 = x0 * cz - y0 * sz, y1 = x0 * sz + y0 * cz;
    // x rotation
    const y2 = y1 * cx - z0 * sx, z2 = y1 * sx + z0 * cx;
    cloud.push(x1 * 0.92, y2 * 0.92 - 0.05, z2 * 0.92, Math.floor(flat.data[o + 3] / 100), flat.data[o + 3] % 100);
  }
  return cloud.data;
}
