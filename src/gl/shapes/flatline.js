// The opening state: every particle lies on one horizontal line across the
// screen, like a monitor before the leads are attached. The shader bends it
// into a QRS complex as the first beat sweeps through, then it becomes the heart.
import { Cloud, gauss } from './util.js';

export const FLATLINE_HALF_WIDTH = 4.2;

export function generateFlatline(N, rand) {
  const cloud = new Cloud(N);
  for (let i = 0; i < N; i++) {
    const t = rand();
    const x = (t * 2 - 1) * FLATLINE_HALF_WIDTH;
    const spread = rand() < 0.9 ? 0.004 : 0.02;
    cloud.push(x, gauss(rand) * spread, gauss(rand) * spread, 0, t * 99);
  }
  return cloud.data;
}
