// Anatomical heart, anterior view, built from signed distance functions.
// Frame: x to the viewer's right (the patient's left), y up, z toward the viewer.
//
// Chambers are tapered ellipsoids blended with a smooth minimum. The ventricles
// are covered in short helical "muscle fibres" traced across the surface, the
// great vessels are tubes along splines, and the coronary arteries are splines
// projected onto the surface. Colours follow the textbook convention: arteries
// red, veins and the pulmonary trunk blue.
import { Cloud, vec, frame, spline, tube, resample, gauss } from './util.js';

export const HEART_CLASS = {
  LV: 0,
  RV: 1,
  ATRIA: 2,
  AORTA: 3,
  PULMONARY: 4,
  CAVAE: 5,
  PULM_VEINS: 6,
  CORONARY: 7,
  AMBIENT: 8,
};

// Base of the ventricles (centre of the AV plane) and the apex.
export const HEART_BASE = [-0.05, 0.32, -0.05];
export const HEART_APEX = [0.74, -1.36, 0.46];
export const HEART_AXIS = vec.norm(vec.sub(HEART_APEX, HEART_BASE));
// Applied at the end so the full figure (vessels included) sits on the origin.
export const HEART_SHIFT = [-0.08, -0.3, 0.12];

// ---------------------------------------------------------------- SDF bits
function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// Egg: ellipsoid along `axis`, narrowing toward +axis by `taper`.
function egg(center, axis, a, r1, r2, taper, twist = 0) {
  const d = vec.norm(axis);
  let e1 = vec.norm(vec.cross(d, [0, 0, 1]));
  let e2 = vec.cross(e1, d);
  if (twist) {
    const c = Math.cos(twist), s = Math.sin(twist);
    const n1 = vec.add(vec.mul(e1, c), vec.mul(e2, s));
    const n2 = vec.add(vec.mul(e1, -s), vec.mul(e2, c));
    e1 = n1;
    e2 = n2;
  }
  return (x, y, z) => {
    const px = x - center[0], py = y - center[1], pz = z - center[2];
    const u = px * d[0] + py * d[1] + pz * d[2];
    const v = px * e1[0] + py * e1[1] + pz * e1[2];
    const w = px * e2[0] + py * e2[1] + pz * e2[2];
    const t = 1 - taper * Math.min(1, Math.max(0, (u / a + 1) / 2)) ** 1.35;
    return sdEllipsoid(v / t, u, w / t, r1, a, r2) * t;
  };
}

function ellipsoid(center, axis, rAlong, r1, r2) {
  const d = vec.norm(axis);
  const [e1, e2] = frame(d);
  return (x, y, z) => {
    const px = x - center[0], py = y - center[1], pz = z - center[2];
    const u = px * d[0] + py * d[1] + pz * d[2];
    const v = px * e1[0] + py * e1[1] + pz * e1[2];
    const w = px * e2[0] + py * e2[1] + pz * e2[2];
    return sdEllipsoid(v, u, w, r1, rAlong, r2);
  };
}

// ---------------------------------------------------------------- geometry
const d = HEART_AXIS;

const CHAMBERS = [
  {
    name: 'LV',
    cls: HEART_CLASS.LV,
    f: egg(vec.add(vec.add(HEART_BASE, vec.mul(d, 0.8)), [0.16, 0.0, -0.16]), d, 0.98, 0.74, 0.7, 0.64),
  },
  {
    name: 'RV',
    cls: HEART_CLASS.RV,
    f: egg(
      vec.add(vec.add(HEART_BASE, vec.mul(d, 0.56)), [-0.25, 0.06, 0.28]),
      vec.norm(vec.add(d, [-0.34, 0.08, 0.12])),
      0.74,
      0.72,
      0.5,
      0.56,
      -0.35
    ),
  },
  { name: 'RA', cls: HEART_CLASS.ATRIA, f: ellipsoid([-0.62, 0.5, -0.14], [0.25, 1, 0.1], 0.46, 0.36, 0.4) },
  { name: 'LA', cls: HEART_CLASS.ATRIA, f: ellipsoid([0.24, 0.64, -0.58], [1, 0.12, 0], 0.56, 0.32, 0.36) },
  { name: 'RAA', cls: HEART_CLASS.ATRIA, f: ellipsoid([-0.44, 0.84, 0.32], [0.75, 0.25, 0.55], 0.28, 0.12, 0.16) },
  { name: 'LAA', cls: HEART_CLASS.ATRIA, f: ellipsoid([0.76, 0.7, 0.14], [0.3, 0.2, 0.85], 0.25, 0.11, 0.14) },
];

const BLEND = 0.2;

export function chamberSDF(x, y, z) {
  let m = CHAMBERS[0].f(x, y, z);
  for (let i = 1; i < CHAMBERS.length; i++) m = smin(m, CHAMBERS[i].f(x, y, z), BLEND);
  return m;
}

function nearestChamber(x, y, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < CHAMBERS.length; i++) {
    const v = CHAMBERS[i].f(x, y, z);
    if (v < bd) {
      bd = v;
      best = i;
    }
  }
  return CHAMBERS[best];
}

function grad(f, x, y, z, h = 1e-3) {
  return [
    (f(x + h, y, z) - f(x - h, y, z)) / (2 * h),
    (f(x, y + h, z) - f(x, y - h, z)) / (2 * h),
    (f(x, y, z + h) - f(x, y, z - h)) / (2 * h),
  ];
}

function project(p, f, iters = 3) {
  for (let i = 0; i < iters; i++) {
    const v = f(p[0], p[1], p[2]);
    const g = grad(f, p[0], p[1], p[2]);
    const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] || 1;
    p[0] -= (v * g[0]) / g2;
    p[1] -= (v * g[1]) / g2;
    p[2] -= (v * g[2]) / g2;
  }
  return p;
}

// Great vessels: control points, radius at start and end, class, and the
// arc length offset (s) at which the pulse wave reaches the start.
const AORTA = spline([
  [-0.02, 0.5, 0.02],
  [-0.12, 0.92, 0.06],
  [-0.17, 1.26, 0.0],
  [-0.1, 1.5, -0.14],
  [0.08, 1.64, -0.36],
  [0.32, 1.6, -0.58],
  [0.47, 1.38, -0.74],
  [0.5, 0.96, -0.8],
  [0.48, 0.2, -0.84],
  [0.46, -0.72, -0.84],
]);
const AORTA_LEN = resample(AORTA, 0.01).length;

function branchStart(t) {
  const r = resample(AORTA, 0.01);
  const k = Math.floor(t * (r.points.length - 1));
  return { p: r.points[k], s: r.arc[k] };
}

const VESSELS = (() => {
  const bc = branchStart(0.36);
  const lcc = branchStart(0.43);
  const ls = branchStart(0.5);
  return [
    { path: AORTA, r0: 0.23, r1: 0.18, cls: HEART_CLASS.AORTA, s0: 0, share: 0.36 },
    // brachiocephalic trunk, then right subclavian and right common carotid
    { path: spline([bc.p, [-0.14, 1.86, -0.2], [-0.2, 1.98, -0.2]]), r0: 0.09, r1: 0.075, cls: HEART_CLASS.AORTA, s0: bc.s, share: 0.045 },
    { path: spline([[-0.2, 1.98, -0.2], [-0.36, 2.04, -0.22], [-0.52, 2.06, -0.26]]), r0: 0.062, r1: 0.05, cls: HEART_CLASS.AORTA, s0: bc.s + 0.3, share: 0.025 },
    { path: spline([[-0.2, 1.98, -0.2], [-0.22, 2.12, -0.18], [-0.23, 2.26, -0.16]]), r0: 0.06, r1: 0.05, cls: HEART_CLASS.AORTA, s0: bc.s + 0.3, share: 0.02 },
    { path: spline([lcc.p, [0.14, 1.94, -0.44], [0.15, 2.24, -0.42]]), r0: 0.064, r1: 0.054, cls: HEART_CLASS.AORTA, s0: lcc.s, share: 0.04 },
    { path: spline([ls.p, [0.4, 1.84, -0.64], [0.54, 1.98, -0.66], [0.72, 2.04, -0.66]]), r0: 0.068, r1: 0.056, cls: HEART_CLASS.AORTA, s0: ls.s, share: 0.05 },

    // pulmonary trunk from the right ventricular outflow, then the two branches
    { path: spline([[0.12, 0.4, 0.6], [0.2, 0.84, 0.5], [0.25, 1.12, 0.22], [0.22, 1.22, 0.0]]), r0: 0.22, r1: 0.19, cls: HEART_CLASS.PULMONARY, s0: 0, share: 0.14 },
    { path: spline([[0.22, 1.22, 0.0], [0.5, 1.28, -0.2], [0.76, 1.2, -0.36], [0.96, 1.08, -0.44]]), r0: 0.14, r1: 0.11, cls: HEART_CLASS.PULMONARY, s0: 0.75, share: 0.05 },
    { path: spline([[0.22, 1.22, 0.0], [-0.02, 1.2, -0.36], [-0.38, 1.14, -0.46], [-0.72, 1.06, -0.48]]), r0: 0.13, r1: 0.11, cls: HEART_CLASS.PULMONARY, s0: 0.75, share: 0.05 },

    // superior and inferior venae cavae
    { path: spline([[-0.6, 0.78, -0.16], [-0.52, 1.28, -0.2], [-0.48, 1.8, -0.24]]), r0: 0.16, r1: 0.14, cls: HEART_CLASS.CAVAE, s0: 0, share: 0.09 },
    { path: spline([[-0.64, 0.16, -0.3], [-0.6, -0.24, -0.4], [-0.58, -0.56, -0.44]]), r0: 0.16, r1: 0.15, cls: HEART_CLASS.CAVAE, s0: 0, share: 0.05 },

    // four pulmonary veins into the left atrium
    { path: spline([[-0.02, 0.76, -0.76], [-0.26, 0.84, -0.9], [-0.48, 0.88, -0.98]]), r0: 0.085, r1: 0.075, cls: HEART_CLASS.PULM_VEINS, s0: 0, share: 0.02 },
    { path: spline([[-0.02, 0.52, -0.76], [-0.26, 0.46, -0.92], [-0.48, 0.42, -1.0]]), r0: 0.085, r1: 0.075, cls: HEART_CLASS.PULM_VEINS, s0: 0, share: 0.02 },
    { path: spline([[0.52, 0.76, -0.76], [0.76, 0.86, -0.9], [0.98, 0.9, -0.98]]), r0: 0.085, r1: 0.075, cls: HEART_CLASS.PULM_VEINS, s0: 0, share: 0.02 },
    { path: spline([[0.52, 0.52, -0.76], [0.78, 0.48, -0.92], [1.0, 0.44, -1.0]]), r0: 0.085, r1: 0.075, cls: HEART_CLASS.PULM_VEINS, s0: 0, share: 0.02 },
  ];
})();

// Coronary arteries: rough paths that get projected onto the surface.
const CORONARIES = [
  // left main into the LAD, down the anterior interventricular groove
  { ctrl: [[0.06, 0.5, 0.3], [0.26, 0.46, 0.5], [0.3, 0.1, 0.74], [0.44, -0.4, 0.74], [0.6, -0.95, 0.64], [0.74, -1.36, 0.48]], s0: 0, share: 0.3 },
  // diagonals off the LAD
  { ctrl: [[0.31, 0.12, 0.74], [0.56, -0.04, 0.66], [0.8, -0.28, 0.46]], s0: 0.35, share: 0.07 },
  { ctrl: [[0.45, -0.42, 0.73], [0.7, -0.56, 0.58], [0.88, -0.78, 0.36]], s0: 0.8, share: 0.06 },
  // circumflex in the left AV groove, with an obtuse marginal
  { ctrl: [[0.26, 0.46, 0.5], [0.58, 0.42, 0.32], [0.88, 0.26, 0.02], [0.98, 0.08, -0.38]], s0: 0.12, share: 0.14 },
  { ctrl: [[0.86, 0.28, 0.08], [0.98, -0.14, 0.02], [0.98, -0.6, -0.08]], s0: 0.55, share: 0.07 },
  // right coronary in the right AV groove, with the acute marginal
  { ctrl: [[-0.1, 0.5, 0.3], [-0.38, 0.36, 0.56], [-0.66, 0.14, 0.56], [-0.9, -0.2, 0.26], [-0.84, -0.56, -0.18]], s0: 0, share: 0.24 },
  { ctrl: [[-0.68, 0.12, 0.56], [-0.56, -0.28, 0.66], [-0.36, -0.7, 0.66], [-0.12, -0.98, 0.6]], s0: 0.45, share: 0.12 },
];

// ---------------------------------------------------------------- build
export function generateHeart(N, rand) {
  const cloud = new Cloud(N);
  const budget = {
    fibres: Math.round(N * 0.42),
    ventricleFill: Math.round(N * 0.12),
    atria: Math.round(N * 0.11),
    vessels: Math.round(N * 0.24),
    coronary: Math.round(N * 0.075),
  };

  // 1. Pool of points on the chamber surface, roughly uniform by area.
  const lo = [-1.4, -1.6, -1.2];
  const hi = [1.5, 1.3, 1.2];
  const pool = { ventricle: [], atria: [] };
  const want = { ventricle: budget.ventricleFill + Math.round(budget.fibres / 40) + 50, atria: budget.atria };
  let guard = 0;
  while ((pool.ventricle.length < want.ventricle || pool.atria.length < want.atria) && guard++ < 4e6) {
    const x = lo[0] + rand() * (hi[0] - lo[0]);
    const y = lo[1] + rand() * (hi[1] - lo[1]);
    const z = lo[2] + rand() * (hi[2] - lo[2]);
    if (Math.abs(chamberSDF(x, y, z)) > 0.03) continue;
    const p = project([x, y, z], chamberSDF, 2);
    const part = nearestChamber(p[0], p[1], p[2]);
    const key = part.cls === HEART_CLASS.ATRIA ? 'atria' : 'ventricle';
    if (pool[key].length < want[key]) pool[key].push({ p, cls: part.cls });
  }

  // 2. Muscle fibres: short helical streamlines over both ventricles.
  const seeds = pool.ventricle.slice(budget.ventricleFill);
  let fibreCount = 0;
  const h = 0.017;
  for (const seed of seeds) {
    if (fibreCount >= budget.fibres) break;
    let p = seed.p.slice();
    const isRV = seed.cls === HEART_CLASS.RV;
    // Epicardial fibres run as a left-handed helix; the RV is flatter.
    const alpha = (isRV ? -0.42 : -0.95) + gauss(rand) * 0.08;
    const steps = 26 + Math.floor(rand() * 34);
    const dirSign = rand() < 0.5 ? 1 : -1;
    for (let s = 0; s < steps && fibreCount < budget.fibres; s++) {
      const n = vec.norm(grad(chamberSDF, p[0], p[1], p[2]));
      const r = vec.sub(p, HEART_BASE);
      const ax = vec.dot(r, d);
      const rho = vec.sub(r, vec.mul(d, ax));
      if (vec.len(rho) < 1e-4) break;
      const circ = vec.norm(vec.cross(d, rho));
      let t = vec.add(vec.mul(circ, Math.cos(alpha)), vec.mul(d, Math.sin(alpha)));
      t = vec.sub(t, vec.mul(n, vec.dot(t, n)));
      t = vec.mul(vec.norm(t), h * dirSign);
      p = project(vec.add(p, t), chamberSDF, 2);
      const part = nearestChamber(p[0], p[1], p[2]);
      if (part.cls === HEART_CLASS.ATRIA) break;
      const j = 0.004;
      cloud.push(p[0] + gauss(rand) * j, p[1] + gauss(rand) * j, p[2] + gauss(rand) * j, part.cls, 0);
      fibreCount++;
    }
  }

  // 3. Plain fill on the ventricles and atria so the surface reads as solid.
  for (let i = 0; i < budget.ventricleFill && i < pool.ventricle.length; i++) {
    const { p, cls } = pool.ventricle[i];
    cloud.push(p[0], p[1], p[2], cls, 0);
  }
  for (const { p } of pool.atria) cloud.push(p[0], p[1], p[2], HEART_CLASS.ATRIA, 0);

  // 4. Great vessels, dropping anything buried inside the chambers.
  for (const v of VESSELS) {
    const target = Math.round(budget.vessels * v.share);
    const tmp = new Cloud(target * 3);
    tube(tmp, rand, v.path, (t) => v.r0 + (v.r1 - v.r0) * t, target * 3, v.cls, v.s0 * 10, 10, 0.9);
    let kept = 0;
    for (let i = 0; i < tmp.count && kept < target; i++) {
      const o = i * 4;
      const x = tmp.data[o], y = tmp.data[o + 1], z = tmp.data[o + 2];
      if (chamberSDF(x, y, z) < -0.01) continue;
      cloud.push(x, y, z, v.cls, tmp.data[o + 3] % 100);
      kept++;
    }
  }

  // 5. Coronary arteries on the surface.
  for (const c of CORONARIES) {
    const raw = spline(c.ctrl, 20).map((p) => {
      const q = project(p.slice(), chamberSDF, 4);
      const n = vec.norm(grad(chamberSDF, q[0], q[1], q[2]));
      return vec.add(q, vec.mul(n, 0.02));
    });
    const n = Math.round(budget.coronary * c.share);
    tube(cloud, rand, raw, (t) => 0.02 * (1 - t * 0.45), n, HEART_CLASS.CORONARY, c.s0 * 10, 10, 0.55);
  }

  // 6. Faint volume inside the heart for depth.
  let tries = 0;
  while (cloud.left > 0 && tries++ < 2e6) {
    const x = lo[0] + rand() * (hi[0] - lo[0]);
    const y = lo[1] + rand() * (hi[1] - lo[1]);
    const z = lo[2] + rand() * (hi[2] - lo[2]);
    if (chamberSDF(x, y, z) < -0.06) cloud.push(x, y, z, HEART_CLASS.AMBIENT, 0);
  }
  cloud.fill(rand);

  // Centre the whole thing on the origin (vessels make it top heavy).
  const shift = HEART_SHIFT;
  for (let i = 0; i < N; i++) {
    cloud.data[i * 4] += shift[0];
    cloud.data[i * 4 + 1] += shift[1];
    cloud.data[i * 4 + 2] += shift[2];
  }
  return cloud.data;
}

export const AORTA_LENGTH = AORTA_LEN;
