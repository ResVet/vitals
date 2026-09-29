import { mulberry32, arrange } from './util.js';
import { generateFlatline } from './flatline.js';
import { generateHeart } from './heart.js';
import { generateDNA } from './dna.js';
import { generateNeuron } from './neuron.js';
import { generateChip } from './chip.js';
import { generateGlobe } from './globe.js';

export const SHAPE_ORDER = ['flatline', 'heart', 'dna', 'neuron', 'chip', 'globe'];
const GENERATORS = { flatline: generateFlatline, heart: generateHeart, dna: generateDNA, neuron: generateNeuron, chip: generateChip, globe: generateGlobe };

// Point i of every shape becomes one particle. Sorting each cloud by height
// means the particle at the bottom of the heart ends up near the bottom of the
// helix, so a morph reads as one flow. The flatline sorts from its centre out,
// so the heart grows from the middle of the line during the intro.
export function generateAll(N, emit) {
  SHAPE_ORDER.forEach((name, index) => {
    const t0 = performance.now();
    let data = GENERATORS[name](N, mulberry32(101 + index * 7919));
    data = name === 'flatline'
      ? arrange(data, mulberry32(index + 1), 0.25, (x) => Math.abs(x))
      : arrange(data, mulberry32(index + 1), 0.35);
    emit({ name, data, index, total: SHAPE_ORDER.length, ms: performance.now() - t0 });
  });
}

export function loadShapes(N, onProgress) {
  return new Promise((resolve) => {
    const shapes = {};
    const done = (msg) => {
      shapes[msg.name] = msg.data;
      onProgress?.(msg);
      if (Object.keys(shapes).length === SHAPE_ORDER.length) resolve(shapes);
    };
    const fallback = () => generateAll(N, done);
    try {
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        done(data);
        if (Object.keys(shapes).length === SHAPE_ORDER.length) worker.terminate();
      };
      worker.onerror = (e) => {
        e.preventDefault?.();
        worker.terminate();
        if (!Object.keys(shapes).length) fallback();
      };
      worker.postMessage({ N });
    } catch {
      fallback();
    }
  });
}
