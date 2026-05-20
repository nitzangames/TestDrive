// 2D Delaunay triangulation via Bowyer-Watson incremental insertion.
// Input:  Array<{x, z}>.
// Output: Array<[i, j]> with i < j — the unique edges of the triangulation.
//
// Notes:
// - "z" is used as the second axis (we're working in the XZ ground plane).
// - For < 3 points returns [].
// - Deterministic given identical input order.

export function triangulate(points) {
  if (points.length < 3) return [];

  // Bounding super-triangle large enough to contain all points.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  const dx = maxX - minX, dz = maxZ - minZ;
  const dmax = Math.max(dx, dz) || 1;
  const midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;
  const stA = { x: midX - 20 * dmax, z: midZ - dmax };
  const stB = { x: midX + 20 * dmax, z: midZ - dmax };
  const stC = { x: midX,             z: midZ + 20 * dmax };

  // Triangles store indices into a combined array: real points 0..N-1,
  // super-triangle vertices at N, N+1, N+2.
  const N = points.length;
  const pts = points.concat([stA, stB, stC]);
  const SUPER_A = N, SUPER_B = N + 1, SUPER_C = N + 2;

  let triangles = [[SUPER_A, SUPER_B, SUPER_C]];

  for (let i = 0; i < N; i++) {
    const bad = [];
    const p = pts[i];
    for (const t of triangles) {
      if (inCircumcircle(p, pts[t[0]], pts[t[1]], pts[t[2]])) bad.push(t);
    }
    // Polygon edges = edges of `bad` triangles that aren't shared with another bad triangle.
    const polygon = [];
    for (const t of bad) {
      const edges = [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];
      for (const e of edges) {
        let shared = false;
        for (const t2 of bad) {
          if (t2 === t) continue;
          const eSet = new Set(e);
          let count = 0;
          for (const v of t2) if (eSet.has(v)) count++;
          if (count === 2) { shared = true; break; }
        }
        if (!shared) polygon.push(e);
      }
    }
    // Remove bad triangles.
    triangles = triangles.filter(t => !bad.includes(t));
    // Add new triangles connecting i to each polygon edge.
    for (const [a, b] of polygon) triangles.push([a, b, i]);
  }

  // Drop any triangle that still touches the super-triangle.
  triangles = triangles.filter(t =>
    t[0] < N && t[1] < N && t[2] < N
  );

  // Extract unique edges with i < j, sorted for determinism.
  const edgeSet = new Set();
  for (const t of triangles) {
    const e = [
      [t[0], t[1]], [t[1], t[2]], [t[2], t[0]],
    ];
    for (let [a, b] of e) {
      if (a > b) [a, b] = [b, a];
      edgeSet.add(a + ':' + b);
    }
  }
  return [...edgeSet].map(s => s.split(':').map(Number)).sort((a, b) =>
    a[0] - b[0] || a[1] - b[1]
  );
}

function inCircumcircle(p, a, b, c) {
  // Computes whether p lies strictly inside the circumcircle of triangle abc.
  const ax = a.x - p.x, az = a.z - p.z;
  const bx = b.x - p.x, bz = b.z - p.z;
  const cx = c.x - p.x, cz = c.z - p.z;
  const d = ax * (bz * (cx * cx + cz * cz) - cz * (bx * bx + bz * bz))
          - az * (bx * (cx * cx + cz * cz) - cx * (bx * bx + bz * bz))
          + (ax * ax + az * az) * (bx * cz - bz * cx);
  return d > 0;
}
