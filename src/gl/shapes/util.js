// Shared helpers for the procedural point clouds.
// Every generator fills a Float32Array of N * 4 floats:
//   x, y, z, meta   where meta = classId * 100 + s
// classId picks colour and motion in the particle shader, and s (0 to 99.99)
// is a path parameter used for travelling pulses (blood, action potentials,
// data on PCB traces, arcs on the globe).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Cloud {
  constructor(N) {
    this.N = N;
    this.data = new Float32Array(N * 4);
    this.count = 0;
  }
  get left() {
    return this.N - this.count;
  }
  push(x, y, z, cls, s = 0) {
    if (this.count >= this.N) return false;
    const o = this.count * 4;
    this.data[o] = x;
    this.data[o + 1] = y;
    this.data[o + 2] = z;
    this.data[o + 3] = cls * 100 + Math.min(Math.max(s, 0), 99.99);
    this.count++;
    return true;
  }
  // Copies random existing points (with a little jitter) until the cloud is full.
  fill(rand, jitter = 0.01) {
    const n = this.count;
    if (n === 0) return;
    while (this.count < this.N) {
      const o = Math.floor(rand() * n) * 4;
      const d = this.data;
      this.push(
        d[o] + (rand() - 0.5) * jitter,
        d[o + 1] + (rand() - 0.5) * jitter,
        d[o + 2] + (rand() - 0.5) * jitter,
        Math.floor(d[o + 3] / 100),
        d[o + 3] % 100
      );
    }
  }
}

// Sorting points by height (with some noise) makes morphs between shapes read
// as one coherent flow instead of 65k particles crossing at random.
export function arrange(data, rand, noise = 0.35, key = (x, y) => y) {
  const N = data.length / 4;
  const keys = new Float32Array(N);
  const idx = new Uint32Array(N);
  for (let i = 0; i < N; i++) {
    idx[i] = i;
    keys[i] = key(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) + (rand() - 0.5) * noise;
  }
  idx.sort((a, b) => keys[a] - keys[b]);
  const out = new Float32Array(data.length);
  for (let i = 0; i < N; i++) out.set(data.subarray(idx[i] * 4, idx[i] * 4 + 4), i * 4);
  return out;
}

// ---------------------------------------------------------------- vectors
export const vec = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// Any vector perpendicular to n, then a full orthonormal frame around it.
export function frame(n) {
  const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = vec.norm(vec.cross(n, t));
  const v = vec.cross(n, u);
  return [u, v];
}

export function randomUnit(rand) {
  const z = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}

export function gauss(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// Resamples a polyline at a fixed spacing. Returns points and arc lengths.
export function resample(points, spacing) {
  const out = [];
  const arc = [];
  let carry = 0;
  let total = 0;
  out.push(points[0]);
  arc.push(0);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const seg = vec.len(vec.sub(b, a));
    let t = spacing - carry;
    while (t <= seg) {
      out.push(vec.lerp(a, b, t / seg));
      arc.push(total + t);
      t += spacing;
    }
    carry = seg - (t - spacing);
    total += seg;
  }
  return { points: out, arc, length: total };
}

// Catmull-Rom through control points, returned as a dense polyline.
export function spline(ctrl, perSeg = 16) {
  const out = [];
  const P = (i) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      const f = (j) =>
        0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1), f(2)]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

// Points scattered on the surface of a tube that follows a polyline.
// radius can be a number or a function of the normalised position (0 to 1).
export function tube(cloud, rand, path, radius, count, cls, sOffset = 0, sScale = 1, surface = 0.85) {
  const { points, arc, length } = resample(path, 0.004);
  if (points.length < 2) return;
  for (let i = 0; i < count; i++) {
    const k = Math.min(points.length - 2, Math.floor(rand() * (points.length - 1)));
    const p = points[k];
    const dir = vec.norm(vec.sub(points[k + 1], p));
    const [u, v] = frame(dir);
    const a = rand() * Math.PI * 2;
    const t = arc[k] / length;
    const r = (typeof radius === 'function' ? radius(t) : radius) * (rand() < surface ? 1 : Math.sqrt(rand()));
    const x = p[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r;
    const y = p[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r;
    const z = p[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r;
    cloud.push(x, y, z, cls, sOffset + arc[k] * sScale);
  }
}

// Points inside or on a sphere.
export function ball(cloud, rand, c, r, count, cls, s = 0, shell = true) {
  for (let i = 0; i < count; i++) {
    const d = randomUnit(rand);
    const rr = shell ? r * (0.92 + rand() * 0.08) : r * Math.cbrt(rand());
    cloud.push(c[0] + d[0] * rr, c[1] + d[1] * rr, c[2] + d[2] * rr, cls, s);
  }
}
