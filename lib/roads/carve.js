// Thin re-export shim. The actual road-aware carve runs INSIDE the chunk
// worker now (lib/terrain/chunk-build.js) so terrain heights, biome colours
// and tree placement all happen against the same final road influence in one
// pass. This file only exists to expose roadInfluence + constants to
// shell/main.js's per-wheel ground sampler so it matches the carve exactly.
export {
  ROAD_HALF_WIDTH,
  COLOR_TRANSITION_WIDTH,
  TERRAIN_TRANSITION_WIDTH,
  TOTAL_BAND,
  roadInfluence,
  roadColorInfluence,
} from './shared.js';
