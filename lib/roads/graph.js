// Road graph generation. Deterministic from seed.
// Public entry point: buildRoadGraph(opts) — added in Task 7.
// This file is built up across Task 6, Task 7.

const WORLD_SIZE = 64000;        // matches FlightSim terrain.WORLD_SIZE
const NODE_GRID_CELL = 3200;     // ~3.2 km cells → ~400 candidates
const NODE_MIN_SPACING = 600;    // Poisson-disk separation
const MAX_SLOPE_DEG = 18;        // reject candidates on steep ground

// 32-bit mulberry32 PRNG. Deterministic. From the standard reference.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Approximate slope (degrees) by sampling ±50 m on both axes.
function slopeDegAt(x, z, terrainHeightFn) {
  const h0 = terrainHeightFn(x, z);
  const hX = terrainHeightFn(x + 50, z);
  const hZ = terrainHeightFn(x, z + 50);
  const dydx = (hX - h0) / 50;
  const dydz = (hZ - h0) / 50;
  const slope = Math.sqrt(dydx * dydx + dydz * dydz);
  return Math.atan(slope) * 180 / Math.PI;
}

export function generateNodeCandidates({ seed, terrainHeightFn, isOnWater }) {
  const rng = mulberry32(seed);
  const half = WORLD_SIZE / 2;
  const accepted = [];

  // Jittered grid of candidates across the world.
  for (let cz = -half; cz < half; cz += NODE_GRID_CELL) {
    for (let cx = -half; cx < half; cx += NODE_GRID_CELL) {
      const jx = (rng() - 0.5) * NODE_GRID_CELL * 0.8;
      const jz = (rng() - 0.5) * NODE_GRID_CELL * 0.8;
      const x = cx + NODE_GRID_CELL / 2 + jx;
      const z = cz + NODE_GRID_CELL / 2 + jz;

      if (slopeDegAt(x, z, terrainHeightFn) > MAX_SLOPE_DEG) continue;
      if (isOnWater(x, z)) continue;

      let tooClose = false;
      for (const n of accepted) {
        const dx = n.x - x, dz = n.z - z;
        if (dx * dx + dz * dz < NODE_MIN_SPACING * NODE_MIN_SPACING) { tooClose = true; break; }
      }
      if (tooClose) continue;

      accepted.push({ id: accepted.length, x, y: terrainHeightFn(x, z), z, edges: [] });
    }
  }
  return accepted;
}

// Internal export for Task 7's pruning step.
export const _internals = { mulberry32, slopeDegAt, WORLD_SIZE, NODE_MIN_SPACING };
