import { describe, expect, it } from 'vitest';
import { boxCollider, circleCollider, type Collider, keepInside, pushOutOf } from './Colliders';
import { SpatialHash } from './SpatialHash';

describe('SpatialHash', () => {
  it('finds colliders near a box, each once, and forgets removed ones', () => {
    const hash = new SpatialHash(4);
    const wall = boxCollider(0, 0, 20, 1); // spans several cells
    const pillar = circleCollider(-10, -10, 1);
    hash.insert(wall);
    hash.insert(pillar);
    expect(hash.size).toBe(2);

    const out: Collider[] = [];
    expect(hash.query(2, -1, 12, 2, out)).toEqual([wall]);
    expect(hash.query(-12, -12, 30, 3, out)).toHaveLength(2);
    expect(hash.query(50, 50, 60, 60, out)).toEqual([]);

    hash.remove(wall);
    expect(hash.size).toBe(1);
    expect(hash.query(2, -1, 12, 2, out)).toEqual([]);
    hash.remove(pillar);
    expect(hash.cellCount).toBe(0);
  });

  it('works with negative and far-away coordinates', () => {
    const hash = new SpatialHash(8);
    const far = circleCollider(-1760, -130, 2);
    hash.insert(far);
    expect(hash.query(-1762, -131, -1759, -129, [])).toEqual([far]);
  });
});

describe('pushOutOf', () => {
  it('pushes a circle out of a circle', () => {
    const p = { x: 1, z: 0 };
    expect(pushOutOf(p, 0.5, circleCollider(0, 0, 1))).toBe(true);
    expect(p.x).toBeCloseTo(1.5);
    expect(pushOutOf(p, 0.5, circleCollider(0, 0, 1))).toBe(false);
  });

  it('pushes a circle out of a box through the nearest side, also from inside', () => {
    const box = boxCollider(0, 0, 10, 2);
    const outside = { x: 5, z: 2.2 };
    pushOutOf(outside, 0.4, box);
    expect(outside).toEqual({ x: 5, z: 2.4 });
    const inside = { x: 5, z: 0.3 };
    pushOutOf(inside, 0.4, box);
    expect(inside.x).toBe(5);
    expect(inside.z).toBeCloseTo(-0.4);
  });

  it('keeps a circle inside bounds', () => {
    const p = { x: -5, z: 11 };
    expect(keepInside(p, 0.5, 0, 0, 10, 10)).toBe(true);
    expect(p).toEqual({ x: 0.5, z: 9.5 });
  });
});
