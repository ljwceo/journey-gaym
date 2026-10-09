import { describe, expect, it } from 'vitest';
import { FloatingOrigin } from './FloatingOrigin';

describe('FloatingOrigin', () => {
  it('starts at the player, snapped to the chunk grid', () => {
    const origin = new FloatingOrigin(1000, 64);
    origin.reset(-1760, -130);
    expect(origin.x).toBe(-1728);
    expect(origin.z).toBe(-128);
    expect(origin.shifts).toBe(0);
  });

  it('only shifts once the player is further than the threshold', () => {
    const origin = new FloatingOrigin(1000, 64);
    origin.reset(0, 0);
    expect(origin.update(999, 0)).toBe(false);
    expect(origin.update(700, 700)).toBe(false);
    expect(origin.update(800, 700)).toBe(true);
    expect(origin.x).toBe(832);
    expect(origin.z).toBe(704);
    expect(origin.shiftX).toBe(832);
    expect(origin.shiftZ).toBe(704);
    expect(origin.shifts).toBe(1);
    // Close to the new origin again: no further shift.
    expect(origin.update(810, 690)).toBe(false);
  });

  it('keeps render coordinates small along a long walk', () => {
    const origin = new FloatingOrigin(1000, 64);
    origin.reset(-2000, 0);
    for (let x = -2000; x <= 2000; x += 4) {
      origin.update(x, 0);
      expect(Math.abs(x - origin.x)).toBeLessThanOrEqual(1000);
    }
    expect(origin.shifts).toBe(3);
  });
});
