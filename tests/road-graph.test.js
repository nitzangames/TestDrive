import { describe, it, expect } from 'vitest';
import { generateNodeCandidates, buildRoadGraph } from '../lib/roads/graph.js';

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

function terrainHeightFn2(x, z) {
  // Gentle rolling terrain, no peaks.
  return Math.sin(x / 800) * 20 + Math.cos(z / 700) * 15;
}
const noWater2 = (x, z) => false;

describe('buildRoadGraph', () => {
  it('is deterministic for the same seed', () => {
    const a = buildRoadGraph({ seed: 42, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    const b = buildRoadGraph({ seed: 42, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    expect(a.nodes.length).toBe(b.nodes.length);
    expect(a.edges.length).toBe(b.edges.length);
    expect(a.spawn).toEqual(b.spawn);
  });

  it('produces a single connected component', () => {
    const g = buildRoadGraph({ seed: 7, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    expect(g.nodes.length).toBeGreaterThan(20);
    // BFS from node 0; every node should be reachable.
    const visited = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const id = stack.pop();
      for (const edgeId of g.nodes[id].edges) {
        const e = g.edges[edgeId];
        const other = e.nodeA === id ? e.nodeB : e.nodeA;
        if (!visited.has(other)) { visited.add(other); stack.push(other); }
      }
    }
    expect(visited.size).toBe(g.nodes.length);
  });

  it('has spawn on a node and a heading toward an outgoing edge', () => {
    const g = buildRoadGraph({ seed: 7, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    const spawnNode = g.nodes.find(n => Math.hypot(n.x - g.spawn.x, n.z - g.spawn.z) < 1e-6);
    expect(spawnNode).toBeTruthy();
    expect(spawnNode.edges.length).toBeGreaterThan(0);
  });

  it('produces polylines that follow terrain', () => {
    const g = buildRoadGraph({ seed: 7, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    const sample = g.edges[0];
    expect(sample.polyline.length).toBeGreaterThanOrEqual(2);
    for (const p of sample.polyline) {
      // y must equal the terrain height at (x, z) within 0.5m
      const h = terrainHeightFn2(p.x, p.z);
      expect(Math.abs(p.y - h)).toBeLessThan(0.5);
    }
  });
});
