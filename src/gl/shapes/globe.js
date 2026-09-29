// Dotted Earth. Land dots sit on a Fibonacci lattice masked by a Natural Earth
// raster, so the spacing is even everywhere. Palembang gets a marker and
// ripple rings, and arcs fly from it to a handful of cities.
import { Cloud, gauss, randomUnit } from './util.js';
import { LAND_W, LAND_H, LAND_BITS } from './landmask.js';

export const GLOBE_CLASS = { LAND: 0, OCEAN: 1, GRID: 2, HOME: 3, RING: 4, ARC: 5, ATMOSPHERE: 6, CITY: 7 };

// Palembang, South Sumatra (Wikipedia: 2°59′10″S 104°45′20″E)
export const HOME = { lat: -2.98611, lon: 104.75556 };
const CITIES = [
  { lat: 35.68, lon: 139.69 }, // Tokyo
  { lat: -33.87, lon: 151.21 }, // Sydney
  { lat: 51.51, lon: -0.13 }, // London
  { lat: 25.2, lon: 55.27 }, // Dubai
  { lat: 1.35, lon: 103.82 }, // Singapore
  { lat: 37.57, lon: 126.98 }, // Seoul
];

export const GLOBE_R = 1.45;

let mask = null;
function isLand(lat, lon) {
  if (!mask) {
    const bin = atob(LAND_BITS);
    mask = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) mask[i] = bin.charCodeAt(i);
  }
  const row = Math.min(LAND_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * LAND_H)));
  let col = Math.floor(((lon + 180) / 360) * LAND_W) % LAND_W;
  if (col < 0) col += LAND_W;
  const idx = row * LAND_W + col;
  return (mask[idx >> 3] & (1 << (idx & 7))) !== 0;
}

// Longitude is measured from Palembang so it faces the camera (+z) by default.
export function toXYZ(lat, lon, r = GLOBE_R) {
  const phi = (lat * Math.PI) / 180;
  const lam = ((lon - HOME.lon) * Math.PI) / 180;
  return [r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam)];
}

function slerpArc(a, b, t) {
  const pa = toXYZ(a.lat, a.lon, 1), pb = toXYZ(b.lat, b.lon, 1);
  const dot = Math.min(1, Math.max(-1, pa[0] * pb[0] + pa[1] * pb[1] + pa[2] * pb[2]));
  const om = Math.acos(dot);
  const so = Math.sin(om) || 1;
  const wa = Math.sin((1 - t) * om) / so, wb = Math.sin(t * om) / so;
  return { p: [pa[0] * wa + pb[0] * wb, pa[1] * wa + pb[1] * wb, pa[2] * wa + pb[2] * wb], om };
}

export function generateGlobe(N, rand) {
  const cloud = new Cloud(N);
  const budget = {
    land: Math.round(N * 0.44),
    ocean: Math.round(N * 0.08),
    grid: Math.round(N * 0.06),
    home: Math.round(N * 0.012),
    ring: Math.round(N * 0.03),
    arc: Math.round(N * 0.12),
    city: Math.round(N * 0.02),
  };

  // Land on a Fibonacci lattice. Pick the lattice size so land fills its budget.
  const lattice = Math.round(budget.land / 0.29);
  const golden = Math.PI * (3 - Math.sqrt(5));
  let land = 0;
  for (let i = 0; i < lattice && land < budget.land; i++) {
    const y = 1 - ((i + 0.5) / lattice) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lonAbs = ((((Math.atan2(Math.sin(th) * r, Math.cos(th) * r) * 180) / Math.PI) + 540) % 360) - 180;
    if (!isLand(lat, lonAbs)) continue;
    const p = toXYZ(lat, lonAbs, GLOBE_R * (1 + gauss(rand) * 0.002));
    cloud.push(p[0], p[1], p[2], GLOBE_CLASS.LAND, 0);
    land++;
  }

  // Ocean: sparse random dots, very faint in the shader.
  for (let i = 0; i < budget.ocean; i++) {
    const d = randomUnit(rand);
    cloud.push(d[0] * GLOBE_R * 0.995, d[1] * GLOBE_R * 0.995, d[2] * GLOBE_R * 0.995, GLOBE_CLASS.OCEAN, 0);
  }

  // Graticule every 30 degrees.
  for (let i = 0; i < budget.grid; i++) {
    let lat, lon;
    if (rand() < 0.5) {
      lat = -60 + 30 * Math.floor(rand() * 5);
      lon = rand() * 360 - 180;
    } else {
      lon = -180 + 30 * Math.floor(rand() * 12);
      lat = rand() * 180 - 90;
    }
    const p = toXYZ(lat, lon, GLOBE_R * 1.004);
    cloud.push(p[0], p[1], p[2], GLOBE_CLASS.GRID, 0);
  }

  // Home marker and ripple rings on the surface around it.
  const home = toXYZ(HOME.lat, HOME.lon, GLOBE_R);
  const n = [home[0] / GLOBE_R, home[1] / GLOBE_R, home[2] / GLOBE_R];
  const e = [Math.cos(0), 0, -Math.sin(0)]; // at lon = HOME.lon the east vector is +x
  const north = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]];
  for (let i = 0; i < budget.home; i++) {
    const r = Math.abs(gauss(rand)) * 0.02;
    const a = rand() * Math.PI * 2;
    const lift = 1.01 + rand() * 0.02;
    cloud.push(
      home[0] * lift + (e[0] * Math.cos(a) + north[0] * Math.sin(a)) * r,
      home[1] * lift + (e[1] * Math.cos(a) + north[1] * Math.sin(a)) * r,
      home[2] * lift + (e[2] * Math.cos(a) + north[2] * Math.sin(a)) * r,
      GLOBE_CLASS.HOME,
      0
    );
  }
  for (let i = 0; i < budget.ring; i++) {
    const ring = Math.floor(rand() * 3);
    const ang = 0.05 + ring * 0.05; // angular radius in radians
    const a = rand() * Math.PI * 2;
    const dir = [
      n[0] * Math.cos(ang) + (e[0] * Math.cos(a) + north[0] * Math.sin(a)) * Math.sin(ang),
      n[1] * Math.cos(ang) + (e[1] * Math.cos(a) + north[1] * Math.sin(a)) * Math.sin(ang),
      n[2] * Math.cos(ang) + (e[2] * Math.cos(a) + north[2] * Math.sin(a)) * Math.sin(ang),
    ];
    const rr = GLOBE_R * 1.006;
    cloud.push(dir[0] * rr, dir[1] * rr, dir[2] * rr, GLOBE_CLASS.RING, ring * 30 + 1);
  }

  // Arcs to other cities, lifted off the surface in proportion to distance.
  const arcsLen = CITIES.map((c) => slerpArc(HOME, c, 0.5).om);
  const total = arcsLen.reduce((a, b) => a + b, 0);
  CITIES.forEach((c, k) => {
    const count = Math.round((budget.arc * arcsLen[k]) / total);
    const om = arcsLen[k];
    for (let j = 0; j < count; j++) {
      const t = rand();
      const { p } = slerpArc(HOME, c, t);
      const lift = 1 + Math.sin(Math.PI * t) * Math.min(0.17, 0.05 + om * 0.09);
      const jitter = 0.004;
      cloud.push(
        p[0] * GLOBE_R * lift + gauss(rand) * jitter,
        p[1] * GLOBE_R * lift + gauss(rand) * jitter,
        p[2] * GLOBE_R * lift + gauss(rand) * jitter,
        GLOBE_CLASS.ARC,
        t * 60 + k * 0.01
      );
    }
    const per = Math.floor(budget.city / CITIES.length);
    const cp = toXYZ(c.lat, c.lon, GLOBE_R * 1.008);
    for (let j = 0; j < per; j++) {
      const r = Math.abs(gauss(rand)) * 0.012;
      const d = randomUnit(rand);
      cloud.push(cp[0] + d[0] * r, cp[1] + d[1] * r, cp[2] + d[2] * r, GLOBE_CLASS.CITY, 60);
    }
  });

  // Atmosphere: a thin shell whose density falls off with height.
  while (cloud.left > 0) {
    const d = randomUnit(rand);
    const h = GLOBE_R * (1.015 + Math.pow(rand(), 2.2) * 0.14);
    cloud.push(d[0] * h, d[1] * h, d[2] * h, GLOBE_CLASS.ATMOSPHERE, (h / GLOBE_R - 1) * 100);
  }
  return cloud.data;
}
