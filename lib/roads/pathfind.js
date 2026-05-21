// Per-edge slope-aware A* on a 2D grid bounded by the edge's bounding box.
// Cost = step distance + λ·max(0, slopeDeg - SLOPE_FREE)² + water_penalty.
// Returns an array of {x, y, z} world points or null if no path exists.
//
// Determinism: deterministic given identical inputs (no Math.random, no time).

const RES = 100;                  // grid resolution (m)
const BUFFER = 1200;              // search-box buffer around the AB bbox (m)
const HARD_SLOPE_DEG = 32;        // any step steeper than this is impassable
const SLOPE_FREE_DEG = 6;         // slope penalty kicks in above this
const SLOPE_PENALTY_K = 50;       // quadratic weight on slope_deg - SLOPE_FREE
const MAX_PATH_OVERAGE = 2.5;     // reject if A* path > 2.5× straight-line dist
const WATER_PENALTY = 1e9;        // effectively forbidden (rivers, sub-water-level terrain)
const WATER_LEVEL_Y = 0;          // matches lib/terrain/water.js water plane Y
const ROAD_MIN_ABOVE_WATER = 0.5; // m — clamp polyline Y to this above the water plane

class MinHeap {
  constructor() { this.a = []; }
  push(item) {
    this.a.push(item);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p][0] <= this.a[i][0]) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      i = p;
    }
  }
  pop() {
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length > 0) {
      this.a[0] = last;
      let i = 0;
      const n = this.a.length;
      while (true) {
        const l = i * 2 + 1, r = i * 2 + 2;
        let s = i;
        if (l < n && this.a[l][0] < this.a[s][0]) s = l;
        if (r < n && this.a[r][0] < this.a[s][0]) s = r;
        if (s === i) break;
        [this.a[s], this.a[i]] = [this.a[i], this.a[s]];
        i = s;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

const NEIGHBORS = [
  [+1,  0], [-1,  0], [ 0, +1], [ 0, -1],
  [+1, +1], [+1, -1], [-1, +1], [-1, -1],
];

export function findRoadPath(A, B, terrainHeightFn, isOnWater) {
  const minX = Math.min(A.x, B.x) - BUFFER;
  const maxX = Math.max(A.x, B.x) + BUFFER;
  const minZ = Math.min(A.z, B.z) - BUFFER;
  const maxZ = Math.max(A.z, B.z) + BUFFER;
  const W = Math.ceil((maxX - minX) / RES) + 1;
  const H = Math.ceil((maxZ - minZ) / RES) + 1;

  const sx = Math.round((A.x - minX) / RES);
  const sz = Math.round((A.z - minZ) / RES);
  const gx = Math.round((B.x - minX) / RES);
  const gz = Math.round((B.z - minZ) / RES);
  const idx = (cx, cz) => cz * W + cx;
  const worldX = (cx) => minX + cx * RES;
  const worldZ = (cz) => minZ + cz * RES;

  const straightLineDist = Math.hypot(B.x - A.x, B.z - A.z);
  const maxAllowedG = straightLineDist * MAX_PATH_OVERAGE;

  const gScore = new Map();
  const cameFrom = new Map();
  gScore.set(idx(sx, sz), 0);

  const open = new MinHeap();
  open.push([heuristic(sx, sz, gx, gz), 0, sx, sz]);

  while (open.size) {
    const [, , cx, cz] = open.pop();
    const ci = idx(cx, cz);
    if (cx === gx && cz === gz) {
      return reconstruct(cameFrom, ci, idx, W, worldX, worldZ, terrainHeightFn, A, B);
    }
    const gCurr = gScore.get(ci);
    if (gCurr === undefined) continue;
    if (gCurr > maxAllowedG) continue;
    const hCurr = terrainHeightFn(worldX(cx), worldZ(cz));
    for (const [dx, dz] of NEIGHBORS) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
      const wx = worldX(nx), wz = worldZ(nz);
      const stepDist = RES * Math.hypot(dx, dz);
      const hN = terrainHeightFn(wx, wz);
      const slopeDeg = Math.atan(Math.abs(hN - hCurr) / stepDist) * 180 / Math.PI;
      if (slopeDeg > HARD_SLOPE_DEG) continue;
      const slopeExcess = Math.max(0, slopeDeg - SLOPE_FREE_DEG);
      let stepCost = stepDist + SLOPE_PENALTY_K * slopeExcess * slopeExcess;
      // Sample midpoint for water test (avoids cell-corner blind spots).
      const midX = worldX(cx) + (wx - worldX(cx)) * 0.5;
      const midZ = worldZ(cz) + (wz - worldZ(cz)) * 0.5;
      // Forbid traversal through rivers OR terrain below the water plane.
      // Both manifest as "the road is in/under water" and look broken.
      if (isOnWater(midX, midZ) || isOnWater(wx, wz)) stepCost += WATER_PENALTY;
      if (hN < WATER_LEVEL_Y + ROAD_MIN_ABOVE_WATER) stepCost += WATER_PENALTY;
      const ni = idx(nx, nz);
      const tentative = gCurr + stepCost;
      const prev = gScore.get(ni);
      if (prev === undefined || tentative < prev) {
        gScore.set(ni, tentative);
        cameFrom.set(ni, ci);
        open.push([tentative + heuristic(nx, nz, gx, gz), tentative, nx, nz]);
      }
    }
  }
  return null;
}

function heuristic(cx, cz, gx, gz) {
  return RES * Math.hypot(cx - gx, cz - gz);
}

function reconstruct(cameFrom, goalIdx, idxFn, W, worldX, worldZ, terrainHeightFn, A, B) {
  const cells = [];
  let cur = goalIdx;
  while (cur !== undefined) {
    const cz = Math.floor(cur / W);
    const cx = cur - cz * W;
    cells.push([cx, cz]);
    cur = cameFrom.get(cur);
  }
  cells.reverse();
  // Replace the first cell with the exact node A position so the polyline
  // meets the graph node, and the last cell with B's exact position.
  const pts = cells.map(([cx, cz]) => {
    const x = worldX(cx), z = worldZ(cz);
    return { x, y: terrainHeightFn(x, z), z };
  });
  if (pts.length === 0) return null;
  pts[0] = { x: A.x, y: A.y, z: A.z };
  pts[pts.length - 1] = { x: B.x, y: B.y, z: B.z };
  // Light XZ smoothing: one 3-tap pass to soften the 100m-grid kinks.
  const smX = pts.map(p => p.x);
  const smZ = pts.map(p => p.z);
  for (let i = 1; i < pts.length - 1; i++) {
    smX[i] = (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3;
    smZ[i] = (pts[i - 1].z + pts[i].z + pts[i + 1].z) / 3;
  }
  for (let i = 1; i < pts.length - 1; i++) { pts[i].x = smX[i]; pts[i].z = smZ[i]; }
  // Re-sample Y from terrain after XZ smoothing so the road still sits on
  // the ground. Then clamp Y to stay above the water plane — A* already
  // strongly penalises sub-water terrain, but the endpoints (node A/B
  // positions) and any near-water cells should still never dip below.
  const minY = WATER_LEVEL_Y + ROAD_MIN_ABOVE_WATER;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && i < pts.length - 1) pts[i].y = terrainHeightFn(pts[i].x, pts[i].z);
    if (pts[i].y < minY) pts[i].y = minY;
  }
  return pts;
}
