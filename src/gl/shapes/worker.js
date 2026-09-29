// Builds every point cloud off the main thread and hands the buffers back.
import { generateAll } from './index.js';

self.onmessage = ({ data }) => {
  generateAll(data.N, (msg) => self.postMessage(msg, [msg.data.buffer]));
};
