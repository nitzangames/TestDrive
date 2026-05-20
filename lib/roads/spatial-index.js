// Bucketed grid index for "edges near (x, z)" lookups.
// Each polyline point of each edge is added to every bucket it falls into.
// nearEdges(x, z, radius) returns unique edge IDs that have at least one
// polyline point in any bucket overlapping the (x±radius, z±radius) box.

export class SpatialIndex {
  constructor(edges, cellSize = 200) {
    this.cellSize = cellSize;
    this.cells = new Map();
    for (const edge of edges) {
      for (const p of edge.polyline) {
        const k = this._key(p.x, p.z);
        let bucket = this.cells.get(k);
        if (!bucket) { bucket = new Set(); this.cells.set(k, bucket); }
        bucket.add(edge.id);
      }
    }
  }

  _key(x, z) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return cx + ':' + cz;
  }

  nearEdges(x, z, radius) {
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const result = new Set();
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const bucket = this.cells.get((cx + dx) + ':' + (cz + dz));
        if (!bucket) continue;
        for (const id of bucket) result.add(id);
      }
    }
    return [...result];
  }
}
