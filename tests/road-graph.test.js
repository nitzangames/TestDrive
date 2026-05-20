import { describe, it, expect } from 'vitest';
import { generateNodeCandidates } from '../lib/roads/graph.js';

// Mock terrain height: a gentle bowl, plus a steep cone around (5000, 5000).
function terrainHeightFn(x, z) {
  const dx = x - 5000, dz = z - 5000;
  const cone = Math.max(0, 1000 - Math.hypot(dx, dz)) * 2; // big steep peak
  const bowl = (x * x + z * z) / 1e8;
  return bowl + cone;
}

// Mock "on water" check: no water anywhere in this test fixture.
const noWater = (x, z) => false;

describe('generateNodeCandidates', () => {
  it('is deterministic for the same seed', () => {
    const a = generateNodeCandidates({ seed: 12345, terrainHeightFn, isOnWater: noWater });
    const b = generateNodeCandidates({ seed: 12345, terrainHeightFn, isOnWater: noWater });
    expect(a).toEqual(b);
  });

  it('rejects nodes on the steep cone', () => {
    const nodes = generateNodeCandidates({ seed: 9, terrainHeightFn, isOnWater: noWater });
    // No node should be inside a 500m radius of the cone peak — the slope there exceeds 18°.
    const tooClose = nodes.filter(n => Math.hypot(n.x - 5000, n.z - 5000) < 500);
    expect(tooClose.length).toBe(0);
  });
});
