// Colour, opacity, size and pulse gain for every class of every shape, per theme.
// Uploaded as a 10 x 12 float texture: rows 0-5 hold rgb + alpha per shape,
// rows 6-11 hold size and pulse gain.
import { Color, DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';

export const SHAPE_IDS = { flatline: 0, heart: 1, dna: 2, neuron: 3, chip: 4, globe: 5 };

// [colour, alpha, size, pulse gain]
const MONITOR = {
  flatline: [['#3dff95', 0.13, 1, 1]],
  heart: [
    ['#ff2a4d', 0.44, 1, 1], // left ventricle
    ['#ff3a5a', 0.4, 1, 1], // right ventricle
    ['#ff6178', 0.32, 1, 1], // atria
    ['#ff4630', 0.34, 1, 1], // aorta and branches
    ['#3f78ff', 0.21, 1, 1], // pulmonary trunk
    ['#3563ff', 0.3, 1, 1], // venae cavae
    ['#ff4f4f', 0.36, 0.9, 1], // pulmonary veins
    ['#ffa3b4', 0.36, 1.05, 0.8], // coronary arteries
    ['#ff6a80', 0.07, 0.8, 0], // inside
  ],
  dna: [
    ['#35d3ff', 0.4, 1, 1],
    ['#5b8dff', 0.4, 1, 1],
    ['#3dff95', 0.5, 1, 1], // A
    ['#ff4d6d', 0.5, 1, 1], // T
    ['#ffd24d', 0.5, 1, 1], // G
    ['#4d8dff', 0.5, 1, 1], // C
    ['#7fe8ff', 0.07, 0.8, 0],
  ],
  neuron: [
    ['#c08cff', 0.42, 1, 1], // soma
    ['#ffd1ff', 0.6, 1, 1], // nucleus
    ['#9d73ff', 0.36, 1, 1], // dendrites
    ['#dcb0ff', 0.45, 0.9, 1], // spines
    ['#ff8fe9', 0.55, 1, 1], // bare axon, nodes of Ranvier
    ['#6d7bff', 0.32, 1, 1], // myelin
    ['#ffbdf3', 0.6, 1.1, 1], // boutons
    ['#9a8cff', 0.06, 0.8, 0],
  ],
  chip: [
    ['#ffc24a', 0.045, 0.9, 0], // substrate
    ['#ffc24a', 0.24, 1, 0], // board edge
    ['#ff9f2e', 0.085, 1, 0], // package
    ['#fff0c4', 0.9, 1.1, 1], // marking
    ['#ffd07a', 0.45, 1, 1], // pads
    ['#ffab35', 0.3, 1, 1], // traces
    ['#ffe1a0', 0.5, 1, 1], // vias
    ['#ffd24d', 0.5, 1, 1], // antenna
    ['#ffc98a', 0.3, 1, 0], // components
  ],
  globe: [
    ['#3dff95', 0.8, 1.3, 0], // land
    ['#1e8a61', 0.07, 0.9, 0], // ocean
    ['#3dff95', 0.09, 0.9, 0], // graticule
    ['#ffffff', 0.3, 1.1, 0.6], // Palembang
    ['#3dff95', 0.34, 1, 1], // ripples
    ['#a6ffd2', 0.28, 1, 1], // arcs
    ['#3dff95', 0.035, 1, 1], // atmosphere
    ['#dcffe9', 0.7, 1.2, 0], // cities
  ],
};

const PAPER = {
  flatline: [['#1c1413', 0.3, 1, 1]],
  heart: [
    ['#8e0e22', 0.48, 1, 1],
    ['#9c1a2d', 0.456, 1, 1],
    ['#a83348', 0.432, 1, 1],
    ['#a3160d', 0.576, 1, 1],
    ['#1b3f9f', 0.672, 1, 1],
    ['#1b3f9f', 0.6, 1, 1],
    ['#a3160d', 0.528, 0.9, 1],
    ['#3f0610', 0.95, 1.1, 1],
    ['#8e0e22', 0.072, 0.8, 0],
  ],
  dna: [
    ['#123a73', 0.624, 1, 1],
    ['#2a2a78', 0.624, 1, 1],
    ['#0e7a3a', 0.816, 1, 1],
    ['#b3122e', 0.816, 1, 1],
    ['#9a6c00', 0.816, 1, 1],
    ['#1f47b8', 0.816, 1, 1],
    ['#123a73', 0.072, 0.8, 0],
  ],
  neuron: [
    ['#4a1d8a', 0.672, 1, 1],
    ['#2a0a4a', 0.95, 1, 1],
    ['#5b2aa0', 0.552, 1, 1],
    ['#6b3ab0', 0.72, 0.9, 1],
    ['#8a1a6a', 0.95, 1, 1],
    ['#2a3a9a', 0.528, 1, 1],
    ['#8a1a6a', 0.95, 1.1, 1],
    ['#4a1d8a', 0.072, 0.8, 0],
  ],
  chip: [
    ['#7a5200', 0.12, 0.9, 0],
    ['#5a3c00', 0.6, 1, 0],
    ['#3a2a10', 0.216, 1, 0],
    ['#1a1000', 0.95, 1.1, 1],
    ['#6a4400', 0.768, 1, 1],
    ['#8a5600', 0.6, 1, 1],
    ['#4a3000', 0.912, 1, 1],
    ['#8a5a00', 0.864, 1, 1],
    ['#6a4a20', 0.528, 1, 0],
  ],
  globe: [
    ['#0b4f2c', 0.82, 1.15, 0],
    ['#0f5a34', 0.03, 0.9, 0],
    ['#0f5a34', 0.1, 0.9, 0],
    ['#b3122e', 0.95, 1.4, 1],
    ['#b3122e', 0.6, 1, 1],
    ['#1f47b8', 0.4, 1, 1],
    ['#0f5a34', 0.012, 1, 1],
    ['#1c1413', 0.95, 1.2, 0],
  ],
};

export const THEMES = { monitor: MONITOR, paper: PAPER };

export function buildPalette(theme = 'monitor', texture) {
  const table = THEMES[theme];
  const data = texture ? texture.image.data : new Float32Array(10 * 12 * 4);
  data.fill(0);
  const c = new Color();
  for (const [name, id] of Object.entries(SHAPE_IDS)) {
    table[name].forEach(([hex, alpha, size, gain], cls) => {
      c.set(hex);
      const o = (id * 10 + cls) * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = alpha;
      const e = ((id + 6) * 10 + cls) * 4;
      data[e] = size;
      data[e + 1] = gain;
    });
  }
  if (texture) {
    texture.needsUpdate = true;
    return texture;
  }
  const tex = new DataTexture(data, 10, 12, RGBAFormat, FloatType);
  tex.minFilter = tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
