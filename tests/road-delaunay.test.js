import { describe, it, expect } from 'vitest';
import { triangulate } from '../lib/roads/delaunay.js';

describe('triangulate', () => {
  it('returns an empty edge list for fewer than 3 points', () => {
    expect(triangulate([])).toEqual([]);
    expect(triangulate([{ x: 0, z: 0 }])).toEqual([]);
    expect(triangulate([{ x: 0, z: 0 }, { x: 10, z: 0 }])).toEqual([]);
  });

  it('returns the single triangle for 3 non-collinear points', () => {
    const pts = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 5, z: 10 }];
    const edges = triangulate(pts);
    // 3 unique edges expected; each is a pair of point indices [i, j], i < j.
    expect(edges).toHaveLength(3);
    const sorted = edges.map(e => `${e[0]}-${e[1]}`).sort();
    expect(sorted).toEqual(['0-1', '0-2', '1-2']);
  });

  it('produces a planar triangulation for a 4-point square', () => {
    const pts = [
      { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 },
    ];
    const edges = triangulate(pts);
    // 5 edges expected: 4 sides + 1 diagonal.
    expect(edges).toHaveLength(5);
  });

  it('is deterministic for the same input', () => {
    const pts = [];
    for (let i = 0; i < 30; i++) {
      pts.push({ x: ((i * 9301 + 49297) % 233280) / 233280 * 100,
                 z: ((i * 17173 + 12347) % 199933) / 199933 * 100 });
    }
    const a = triangulate(pts);
    const b = triangulate(pts);
    expect(a).toEqual(b);
  });
});
