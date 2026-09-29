// Multipolar neuron: soma with a nucleus, recursively branching dendrites with
// spines, and a myelinated axon ending in terminal boutons. Every point stores
// its path distance from the soma so the shader can run action potentials
// outward (and jump node to node along the myelin, like saltatory conduction).
import { Cloud, vec, frame, spline, resample, randomUnit, gauss } from './util.js';

export const NEURON_CLASS = { SOMA: 0, NUCLEUS: 1, DENDRITE: 2, SPINE: 3, AXON: 4, MYELIN: 5, BOUTON: 6, AMBIENT: 7 };

const SOMA = [-0.62, 0.5, 0];
const SOMA_R = 0.3;
const AXON_DIR = vec.norm([0.72, -0.66, 0.12]);

// Low-frequency wobble so the soma is not a perfect ball.
function somaRadius(dir, seeds) {
  let r = 1;
  for (const s of seeds) r += s.a * Math.sin(vec.dot(dir, s.k) * s.f + s.p);
  return SOMA_R * r;
}

function segmentPoints(cloud, rand, pts, r0, r1, count, cls, s0, surface = 0.8) {
  const { points, arc, length } = resample(pts, 0.004);
  if (points.length < 2) return;
  for (let i = 0; i < count; i++) {
    const k = Math.min(points.length - 2, Math.floor(rand() * (points.length - 1)));
    const p = points[k];
    const dir = vec.norm(vec.sub(points[k + 1], p));
    const [u, v] = frame(dir);
    const a = rand() * Math.PI * 2;
    const t = arc[k] / length;
    const r = (r0 + (r1 - r0) * t) * (rand() < surface ? 1 : Math.sqrt(rand()));
    cloud.push(
      p[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r,
      p[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r,
      p[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r,
      cls,
      (s0 + arc[k]) * 10
    );
  }
}

export function generateNeuron(N, rand) {
  const cloud = new Cloud(N);
  const budget = {
    soma: Math.round(N * 0.1),
    nucleus: Math.round(N * 0.03),
    dendrite: Math.round(N * 0.47),
    spine: Math.round(N * 0.05),
    axon: Math.round(N * 0.17),
    terminal: Math.round(N * 0.08),
  };

  const seeds = Array.from({ length: 4 }, () => ({ k: randomUnit(rand), f: 2 + rand() * 3, p: rand() * 6.28, a: 0.05 + rand() * 0.05 }));

  // --- dendritic tree (collect segments first, then spend the budget by area)
  const segments = [];
  const primaries = [];
  while (primaries.length < 7) {
    const d = randomUnit(rand);
    if (vec.dot(d, AXON_DIR) > 0.1) continue;
    if (primaries.some((q) => vec.dot(q, d) > 0.8)) continue;
    primaries.push(d);
  }
  const grow = (start, dir, len, rad, depth, s0) => {
    const mid = vec.add(vec.add(start, vec.mul(dir, len * 0.5)), vec.mul(randomUnit(rand), len * 0.16));
    const end = vec.add(vec.add(start, vec.mul(dir, len)), vec.mul(randomUnit(rand), len * 0.12));
    const pts = spline([start, mid, end], 10);
    const r1 = rad * 0.72;
    segments.push({ pts, r0: rad, r1, s0, len, depth });
    if (depth >= 5) return;
    const nd = vec.norm(vec.sub(end, mid));
    const kids = depth < 1 ? 2 : rand() < 0.82 ? 2 : 1;
    for (let c = 0; c < kids; c++) {
      const [u, v] = frame(nd);
      const spread = 0.42 + rand() * 0.35;
      const a = rand() * Math.PI * 2;
      const side = vec.add(vec.mul(u, Math.cos(a)), vec.mul(v, Math.sin(a)));
      const cd = vec.norm(vec.add(nd, vec.mul(side, Math.tan(spread))));
      grow(end, cd, len * (0.72 + rand() * 0.14), r1, depth + 1, s0 + len);
    }
  };
  for (const d of primaries) {
    const start = vec.add(SOMA, vec.mul(d, somaRadius(d, seeds) * 0.9));
    grow(start, d, 0.36 + rand() * 0.14, 0.06, 0, 0);
  }
  const area = segments.reduce((sum, g) => sum + g.len * (g.r0 + g.r1 + 0.03), 0);
  for (const g of segments) {
    const n = Math.round((budget.dendrite * g.len * (g.r0 + g.r1 + 0.03)) / area);
    segmentPoints(cloud, rand, g.pts, g.r0, g.r1, n, NEURON_CLASS.DENDRITE, g.s0, 0.7);
  }

  // Spines: tiny stubs on the outer branches.
  const outer = segments.filter((g) => g.depth >= 2);
  let spinePts = 0;
  while (spinePts < budget.spine && outer.length) {
    const g = outer[Math.floor(rand() * outer.length)];
    const { points, arc } = resample(g.pts, 0.01);
    const k = Math.floor(rand() * (points.length - 1));
    const p = points[k];
    const dir = vec.norm(vec.sub(points[k + 1], p));
    const [u, v] = frame(dir);
    const a = rand() * Math.PI * 2;
    const out = vec.add(vec.mul(u, Math.cos(a)), vec.mul(v, Math.sin(a)));
    const L = 0.03 + rand() * 0.03;
    const n = 4 + Math.floor(rand() * 4);
    for (let j = 0; j < n && spinePts < budget.spine; j++) {
      const t = j / (n - 1);
      const q = vec.add(p, vec.mul(out, g.r1 + L * t));
      const head = t > 0.8 ? 0.012 : 0.003;
      cloud.push(q[0] + gauss(rand) * head, q[1] + gauss(rand) * head, q[2] + gauss(rand) * head, NEURON_CLASS.SPINE, (g.s0 + arc[k]) * 10);
      spinePts++;
    }
  }

  // --- soma and nucleus
  for (let i = 0; i < budget.soma; i++) {
    const d = randomUnit(rand);
    const r = somaRadius(d, seeds) * (rand() < 0.88 ? 1 : 0.7 + rand() * 0.3);
    cloud.push(SOMA[0] + d[0] * r, SOMA[1] + d[1] * r, SOMA[2] + d[2] * r, NEURON_CLASS.SOMA, 0);
  }
  for (let i = 0; i < budget.nucleus; i++) {
    const d = randomUnit(rand);
    const inner = i < budget.nucleus * 0.2;
    const r = inner ? 0.035 * Math.cbrt(rand()) : 0.12 * (0.9 + rand() * 0.1);
    const c = vec.add(SOMA, [0.03, 0.02, 0.05]);
    cloud.push(c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r, NEURON_CLASS.NUCLEUS, 0);
  }

  // --- axon: hillock, then myelin sheaths separated by nodes of Ranvier
  const a0 = vec.add(SOMA, vec.mul(AXON_DIR, SOMA_R * 0.85));
  const axonPath = spline(
    [
      a0,
      vec.add(a0, [0.34, -0.26, 0.05]),
      vec.add(a0, [0.82, -0.52, 0.12]),
      vec.add(a0, [1.3, -0.98, 0.02]),
      vec.add(a0, [1.72, -1.5, -0.08]),
      vec.add(a0, [2.02, -2.02, 0.0]),
    ],
    24
  );
  const axon = resample(axonPath, 0.004);
  const L = axon.length;
  const hillock = 0.22;
  const sheath = 0.3;
  const node = 0.055;
  const myelinPoints = Math.round(budget.axon * 0.7);
  const barePoints = budget.axon - myelinPoints;
  const isNode = (s) => s < hillock || ((s - hillock) % (sheath + node)) > sheath || s > L - 0.12;
  let placedM = 0, placedB = 0, guard = 0;
  while ((placedM < myelinPoints || placedB < barePoints) && guard++ < N * 20) {
    const k = Math.floor(rand() * (axon.points.length - 1));
    const s = axon.arc[k];
    const bare = isNode(s);
    if (bare ? placedB >= barePoints : placedM >= myelinPoints) continue;
    const p = axon.points[k];
    const dir = vec.norm(vec.sub(axon.points[k + 1], p));
    const [u, v] = frame(dir);
    const a = rand() * Math.PI * 2;
    let r;
    if (s < hillock) r = 0.06 * (1 - s / hillock) + 0.022;
    else if (bare) r = 0.022;
    else {
      // rounded sheath ends
      const local = (s - hillock) % (sheath + node);
      const e = Math.min(local, sheath - local) / 0.05;
      r = 0.022 + 0.052 * Math.min(1, Math.sqrt(Math.max(0, e)));
    }
    cloud.push(
      p[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r,
      p[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r,
      p[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r,
      bare ? NEURON_CLASS.AXON : NEURON_CLASS.MYELIN,
      s * 10
    );
    if (bare) placedB++;
    else placedM++;
  }

  // --- terminal arbor with boutons
  const end = axon.points[axon.points.length - 1];
  const endDir = vec.norm(vec.sub(end, axon.points[axon.points.length - 20]));
  const tips = [];
  const branch = (start, dir, len, depth, s0) => {
    const e = vec.add(vec.add(start, vec.mul(dir, len)), vec.mul(randomUnit(rand), len * 0.2));
    const pts = spline([start, vec.add(vec.lerp(start, e, 0.5), vec.mul(randomUnit(rand), len * 0.12)), e], 8);
    tips.push({ pts, s0, len, e, depth });
    if (depth >= 2) return;
    const kids = 2 + (rand() < 0.4 ? 1 : 0);
    for (let c = 0; c < kids; c++) {
      const [u, v] = frame(dir);
      const a = rand() * Math.PI * 2;
      const nd = vec.norm(vec.add(dir, vec.mul(vec.add(vec.mul(u, Math.cos(a)), vec.mul(v, Math.sin(a))), 0.9)));
      branch(e, nd, len * 0.75, depth + 1, s0 + len);
    }
  };
  for (let i = 0; i < 3; i++) {
    const [u, v] = frame(endDir);
    const a = (i / 3) * Math.PI * 2 + rand();
    branch(end, vec.norm(vec.add(endDir, vec.mul(vec.add(vec.mul(u, Math.cos(a)), vec.mul(v, Math.sin(a))), 0.8))), 0.2, 0, L);
  }
  const branchPts = Math.round(budget.terminal * 0.45);
  for (const t of tips) segmentPoints(cloud, rand, t.pts, 0.016, 0.011, Math.round(branchPts / tips.length), NEURON_CLASS.AXON, t.s0, 0.6);
  const leaves = tips.filter((t) => t.depth === 2);
  const perBouton = Math.floor((budget.terminal - branchPts) / leaves.length);
  for (const t of leaves) {
    for (let j = 0; j < perBouton; j++) {
      const d = randomUnit(rand);
      const r = 0.04 * (rand() < 0.8 ? 1 : Math.cbrt(rand()));
      cloud.push(t.e[0] + d[0] * r, t.e[1] + d[1] * r, t.e[2] + d[2] * r, NEURON_CLASS.BOUTON, (t.s0 + t.len) * 10);
    }
  }

  // Faint sparkle in the space around the cell.
  while (cloud.left > 0) {
    const d = randomUnit(rand);
    const r = 0.4 + Math.pow(rand(), 0.6) * 2.1;
    cloud.push(0.1 + d[0] * r, -0.2 + d[1] * r * 0.85, d[2] * r * 0.5, NEURON_CLASS.AMBIENT, 0);
  }

  // Centre it.
  const shift = [-0.18, 0.28, 0];
  for (let i = 0; i < N; i++) {
    cloud.data[i * 4] += shift[0];
    cloud.data[i * 4 + 1] += shift[1];
  }
  return cloud.data;
}
