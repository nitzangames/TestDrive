// Web Worker entrypoint. Runs in worker scope; receives jobs and posts buffers back.
// The worker is created with `new Worker(new URL('./chunk-worker.js', import.meta.url), { type: 'module' })`.
import { buildChunkBuffers } from './chunk-build.js';
import { biomeAt, bandsAt } from '../game/biomes.js';
import { reconstructRoadGraph } from '../roads/shared.js';

let seed = 0;
let riverSegments = [];
let roadGraph = null;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    seed = msg.seed;
    riverSegments = msg.riverSegments;
    self.postMessage({ type: 'ready', id: msg.id });
    return;
  }
  if (msg.type === 'setRoadGraph') {
    // Reconstruct the worker-side road graph from the structured-cloned data.
    // Future buildChunkBuffers calls will route the carve through it so the
    // height, the biome-band colour, and the tree placement all reflect the
    // road in one pass.
    roadGraph = msg.data ? reconstructRoadGraph(msg.data) : null;
    self.postMessage({ type: 'roadGraphAck', id: msg.id });
    return;
  }
  if (msg.type === 'build') {
    const out = buildChunkBuffers({
      cx: msg.cx, cz: msg.cz, lod: msg.lod, vertexGrid: msg.vertexGrid,
      seed, riverSegments, biomeAt, bandsAt,
      villages: msg.villages || [],
      tunnels: msg.tunnels || [],
      roadGraph,
    });
    self.postMessage(
      { type: 'built', id: msg.id, ...out },
      [out.positions.buffer, out.indices.buffer, out.normals.buffer, out.colors.buffer]
    );
  }
};
