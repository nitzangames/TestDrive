import { buildChunkBuffers } from './chunk-build.js';
import { biomeAt, bandsAt } from '../game/biomes.js';
import { reconstructRoadGraph } from '../roads/shared.js';

// Main-thread fallback "runner" with the same async API as the worker proxy.
// Used when Worker construction fails (sandboxed iframes, COOP/COEP issues, tests).
export class ChunkRunner {
  constructor({ seed, riverSegments }) {
    this.seed = seed;
    this.riverSegments = riverSegments;
    this.roadGraph = null;
  }
  async build({ cx, cz, lod, vertexGrid, villages, tunnels }) {
    return buildChunkBuffers({
      cx, cz, lod, vertexGrid,
      seed: this.seed,
      riverSegments: this.riverSegments,
      biomeAt,
      bandsAt,
      villages: villages || [],
      tunnels: tunnels || [],
      roadGraph: this.roadGraph,
    });
  }
  // Match the worker proxy's API. Worker proxy posts to its worker; this just
  // stores locally so build() can hand the graph to buildChunkBuffers.
  async setRoadGraph(data) {
    this.roadGraph = data ? reconstructRoadGraph(data) : null;
  }
  dispose() { /* nothing to release */ }
}
