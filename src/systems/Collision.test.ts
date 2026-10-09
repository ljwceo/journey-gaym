import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../world/SpatialHash';
import { CollisionWorld, type WalkableGround } from './Collision';

const DEG = Math.PI / 180;
const maxSlope = Math.tan(40 * DEG);

/** Flat land at height 2 for x < 10, a 60° cliff up for 10 ≤ x < 20, the sea for z > 30. */
const ground: WalkableGround = {
  heightAt(x, z) {
    if (z > 30) return 2 - (z - 30) * 0.5;
    if (x < 10) return 2;
    if (x < 20) return 2 + (x - 10) * Math.tan(60 * DEG);
    return 2 + 10 * Math.tan(60 * DEG);
  },
  isDeepWater: (height) => height < -0.8,
};

function world(): CollisionWorld {
  return new CollisionWorld(new SpatialHash(), null, ground, maxSlope);
}

describe('CollisionWorld with ground', () => {
  it('walks freely on flat land', () => {
    const p = { x: 0, z: 0 };
    world().moveCircle(p, 0.4, 3, 4);
    expect(p.x).toBeCloseTo(3);
    expect(p.z).toBeCloseTo(4);
  });

  it('stops at a slope steeper than the limit, but slides along it', () => {
    const p = { x: 9, z: 0 };
    world().moveCircle(p, 0.4, 3, 3);
    expect(p.x).toBeLessThan(10.25);
    expect(p.z).toBeCloseTo(3);
  });

  it('always lets you walk down a steep slope', () => {
    const p = { x: 15, z: 0 };
    world().moveCircle(p, 0.4, -6, 0);
    expect(p.x).toBeCloseTo(9);
  });

  it('lets you wade into shallow water but not into deep water', () => {
    const p = { x: 0, z: 30 };
    world().moveCircle(p, 0.4, 0, 20);
    // Deep water starts where 2 - (z - 30) * 0.5 < -0.8, so at z = 35.6.
    expect(p.z).toBeGreaterThan(35);
    expect(p.z).toBeLessThan(35.7);
  });

  it('never traps you in deep water: walking out uphill works', () => {
    const p = { x: 0, z: 40 };
    world().moveCircle(p, 0.4, 0, -12);
    expect(p.z).toBeCloseTo(28);
  });

  it('allows climbing a slope within the limit', () => {
    const gentle: WalkableGround = {
      heightAt: (x) => x * Math.tan(30 * DEG),
      isDeepWater: () => false,
    };
    const p = { x: 0, z: 0 };
    new CollisionWorld(new SpatialHash(), null, gentle, maxSlope).moveCircle(p, 0.4, 5, 0);
    expect(p.x).toBeCloseTo(5);
  });
});
