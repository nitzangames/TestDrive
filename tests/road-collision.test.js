import { describe, it, expect } from 'vitest';
import { resolveCarRoadCollision, queryRoadAt } from '../lib/roads/collision.js';
import { SpatialIndex } from '../lib/roads/spatial-index.js';
import { CAR_CONSTANTS } from '../lib/car/physics.js';
import { ROAD_HALF_WIDTH } from '../lib/roads/geometry.js';

function makeGraph() {
  const polylineX = [];
  for (let i = 0; i <= 10; i++) polylineX.push({ x: i * 50, y: 0, z: 0 });
  const edges = [{ id: 0, nodeA: 0, nodeB: 1, polyline: polylineX, length: 500 }];
  const nodes = [
    { id: 0, x: 0, y: 0, z: 0, edges: [0] },
    { id: 1, x: 500, y: 0, z: 0, edges: [0] },
  ];
  return { nodes, edges, spatialIndex: new SpatialIndex(edges, 200) };
}

describe('queryRoadAt', () => {
  it('finds the nearest segment along an x-axis road', () => {
    const g = makeGraph();
    const q = queryRoadAt(g, 100, 7);
    expect(q.edgeId).toBe(0);
    expect(Math.abs(q.lateralOffset - 7)).toBeLessThan(0.001);
  });

  it('returns null when far from all roads', () => {
    const g = makeGraph();
    const q = queryRoadAt(g, 100, 500);
    expect(q).toBeNull();
  });
});

describe('resolveCarRoadCollision', () => {
  it('clamps a car beyond the road edge back to the wall', () => {
    const g = makeGraph();
    const outside = ROAD_HALF_WIDTH + 5;
    const car = { x: 100, y: 0, z: outside, headingY: 0, speed: 30 };
    const result = resolveCarRoadCollision(g, car, /*nearJunction*/ false);
    expect(result.collided).toBe(true);
    const limit = ROAD_HALF_WIDTH - CAR_CONSTANTS.CAR_HALF_WIDTH;
    expect(car.z).toBeLessThanOrEqual(limit + 0.001);
    expect(car.speed).toBeLessThan(30);
  });

  it('does nothing when car is inside the corridor', () => {
    const g = makeGraph();
    const inside = ROAD_HALF_WIDTH / 4;
    const car = { x: 100, y: 0, z: inside, headingY: 0, speed: 30 };
    const result = resolveCarRoadCollision(g, car, false);
    expect(result.collided).toBe(false);
    expect(car.z).toBe(inside);
    expect(car.speed).toBe(30);
  });

});
