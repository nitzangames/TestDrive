import { describe, it, expect } from 'vitest';
import { SpatialIndex } from '../lib/roads/spatial-index.js';

describe('SpatialIndex', () => {
  it('returns edges whose polyline points are within radius', () => {
    const edges = [
      { id: 0, polyline: [{ x: 0, z: 0 }, { x: 100, z: 0 }] },
      { id: 1, polyline: [{ x: 1000, z: 0 }, { x: 1100, z: 0 }] },
      { id: 2, polyline: [{ x: 50, z: 50 }, { x: 50, z: 150 }] },
    ];
    const idx = new SpatialIndex(edges, 200);
    const near = idx.nearEdges(0, 0, 80);
    expect(near.sort()).toEqual([0, 2]);
    const wider = idx.nearEdges(60, 60, 60);
    expect(wider.sort()).toEqual([0, 2]);
    const far = idx.nearEdges(1050, 0, 100);
    expect(far.sort()).toEqual([1]);
  });

  it('returns an empty array when nothing is within radius', () => {
    const edges = [{ id: 0, polyline: [{ x: 0, z: 0 }, { x: 100, z: 0 }] }];
    const idx = new SpatialIndex(edges, 200);
    expect(idx.nearEdges(50000, 50000, 100)).toEqual([]);
  });
});
