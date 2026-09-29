// B-DNA double helix. 10.5 base pairs per turn, and the two backbones sit
// about 150 degrees apart so the major and minor grooves differ in width.
// The 24 base pairs spell MESSAGE in 2-bit code (A=00, C=01, G=10, T=11).
import { Cloud, gauss } from './util.js';

export const DNA_CLASS = { BACKBONE_1: 0, BACKBONE_2: 1, A: 2, T: 3, G: 4, C: 5, AMBIENT: 6 };
export const DNA_MESSAGE = 'RAFFA';

const CODE = ['A', 'C', 'G', 'T'];
const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };

export function encode(msg) {
  const bases = [];
  for (const ch of msg) {
    const b = ch.charCodeAt(0);
    for (let shift = 6; shift >= 0; shift -= 2) bases.push(CODE[(b >> shift) & 3]);
  }
  return bases;
}

export const DNA_BASES = encode(DNA_MESSAGE);

export const DNA_GEOMETRY = (() => {
  const R = 0.5;
  const pitch = R * 3.4; // B-DNA: ~3.4 nm pitch on a ~1 nm radius
  const rise = pitch / 10.5;
  const pairs = DNA_BASES.length;
  const height = pairs * rise;
  return { R, pitch, rise, pairs, height, groove: (150 * Math.PI) / 180 };
})();

export function generateDNA(N, rand) {
  const cloud = new Cloud(N);
  const { R, pitch, rise, pairs, height, groove } = DNA_GEOMETRY;
  const y0 = -height / 2;
  const tail = rise * 2.5; // strands run a little past the last pair and fade
  const angle = (y) => (2 * Math.PI * y) / pitch;
  const strandPoint = (y, which) => {
    const a = angle(y) + (which ? groove : 0);
    return [R * Math.cos(a), y, R * Math.sin(a)];
  };

  const nBackbone = Math.round(N * 0.42);
  const nBeads = Math.round(N * 0.1);
  const nBases = Math.round(N * 0.4);

  // Sugar-phosphate backbones: tubes wound around the axis.
  for (let i = 0; i < nBackbone; i++) {
    const which = i & 1;
    const y = y0 - tail + rand() * (height + tail * 2);
    const c = strandPoint(y, which);
    // local frame: tangent of the helix, radial, and their cross
    const a = angle(y) + (which ? groove : 0);
    const k = (2 * Math.PI) / pitch;
    const t = [-R * k * Math.sin(a), 1, R * k * Math.cos(a)];
    const tl = Math.hypot(t[0], t[1], t[2]);
    t[0] /= tl; t[1] /= tl; t[2] /= tl;
    const r = [Math.cos(a), 0, Math.sin(a)];
    const b = [t[1] * r[2] - t[2] * r[1], t[2] * r[0] - t[0] * r[2], t[0] * r[1] - t[1] * r[0]];
    const phi = rand() * Math.PI * 2;
    const rad = 0.062 * (rand() < 0.85 ? 1 : Math.sqrt(rand()));
    const fade = Math.min(1, Math.min(y - (y0 - tail), y0 + height + tail - y) / tail);
    if (fade < rand() * 0.9) continue;
    cloud.push(
      c[0] + (r[0] * Math.cos(phi) + b[0] * Math.sin(phi)) * rad,
      c[1] + (r[1] * Math.cos(phi) + b[1] * Math.sin(phi)) * rad,
      c[2] + (r[2] * Math.cos(phi) + b[2] * Math.sin(phi)) * rad,
      which ? DNA_CLASS.BACKBONE_2 : DNA_CLASS.BACKBONE_1,
      (y - y0) / rise
    );
  }

  // Phosphate beads, one per nucleotide on each strand.
  const perBead = Math.max(4, Math.floor(nBeads / (pairs * 2)));
  for (let k = 0; k < pairs; k++) {
    const y = y0 + (k + 0.5) * rise;
    for (let which = 0; which < 2; which++) {
      const c = strandPoint(y, which);
      for (let j = 0; j < perBead; j++) {
        const u = [gauss(rand), gauss(rand), gauss(rand)];
        const l = Math.hypot(u[0], u[1], u[2]) || 1;
        const rr = 0.085 * Math.cbrt(rand());
        cloud.push(c[0] + (u[0] / l) * rr, c[1] + (u[1] / l) * rr, c[2] + (u[2] / l) * rr, which ? DNA_CLASS.BACKBONE_2 : DNA_CLASS.BACKBONE_1, k + 0.5);
      }
    }
  }

  // Base pairs: a rod between the strands, each half coloured by its base.
  const perPair = Math.floor(nBases / pairs);
  for (let k = 0; k < pairs; k++) {
    const y = y0 + (k + 0.5) * rise;
    const p1 = strandPoint(y, 0);
    const p2 = strandPoint(y, 1);
    const b1 = DNA_BASES[k];
    const b2 = PAIR[b1];
    for (let j = 0; j < perPair; j++) {
      const t = 0.06 + rand() * 0.88;
      const base = t < 0.5 ? b1 : b2;
      const rad = 0.03 * Math.sqrt(rand());
      const phi = rand() * Math.PI * 2;
      // slab-like cross section: wider in the base plane than across it
      const ox = Math.cos(phi) * rad * 1.6;
      const oy = Math.sin(phi) * rad * 0.6;
      cloud.push(p1[0] + (p2[0] - p1[0]) * t + ox * 0.3, p1[1] + oy, p1[2] + (p2[2] - p1[2]) * t + ox, DNA_CLASS[base], k + 0.5);
    }
  }

  // Loose sparkle around the helix, like a hydration shell.
  while (cloud.left > 0) {
    const a = rand() * Math.PI * 2;
    const r = 0.72 + Math.min(1.1, Math.abs(gauss(rand)) * 0.4);
    const y = y0 - tail + rand() * (height + tail * 2);
    cloud.push(Math.cos(a) * r, y, Math.sin(a) * r, DNA_CLASS.AMBIENT, (y - y0) / rise);
  }
  return cloud.data;
}
