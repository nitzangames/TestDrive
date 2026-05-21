import { describe, it, expect } from 'vitest';
import { CarPhysics, CAR_CONSTANTS } from '../lib/car/physics.js';

const flatTerrain = () => 0;

describe('CarPhysics', () => {
  it('accelerates from 0 toward effMax with no steering', () => {
    const p = new CarPhysics({ terrainHeightFn: flatTerrain });
    for (let i = 0; i < 1000; i++) p.step(0, 1 / 120);
    expect(p.speed).toBeGreaterThan(CAR_CONSTANTS.MAX_SPEED * 0.99);
  });

  it('reduces top speed at full lock', () => {
    const p = new CarPhysics({ terrainHeightFn: flatTerrain });
    for (let i = 0; i < 1500; i++) p.step(1, 1 / 120);
    const expected = CAR_CONSTANTS.MAX_SPEED * (1 - CAR_CONSTANTS.BRAKE_FROM_TURN);
    expect(Math.abs(p.speed - expected)).toBeLessThan(0.5);
  });

  it('integrates heading and position without NaN', () => {
    const p = new CarPhysics({ terrainHeightFn: flatTerrain });
    for (let i = 0; i < 1200; i++) p.step((i % 240 < 120 ? 0.5 : -0.5), 1 / 120);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.z)).toBe(true);
    expect(Number.isFinite(p.headingY)).toBe(true);
    expect(p.speed).toBeGreaterThan(0);
  });

  it('sits on the ground (Y = average of 4 wheel ground heights)', () => {
    const slope = (x, z) => x * 0.01; // gentle slope rising in +x
    const p = new CarPhysics({ terrainHeightFn: slope });
    p.x = 100; p.z = 0;
    for (let i = 0; i < 60; i++) p.step(0, 1 / 120);
    // On a planar slope, the 4-wheel average equals the slope value at the car center.
    expect(Math.abs(p.y - p.x * 0.01)).toBeLessThan(0.05);
  });

  it('tilts pitch nose-up when the slope rises ahead of the car', () => {
    // Slope rises 0.1 m per metre in +z (car forward at headingY=0 is +z).
    const slope = (x, z) => z * 0.1;
    const p = new CarPhysics({ terrainHeightFn: slope });
    for (let i = 0; i < 120; i++) p.step(0, 1 / 120);
    // Front wheels are at higher z, so yFront > yRear. Positive pitch = nose up.
    expect(p.pitch).toBeGreaterThan(0.05);
  });
});
