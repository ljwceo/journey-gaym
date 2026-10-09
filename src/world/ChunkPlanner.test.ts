import { describe, expect, it } from 'vitest';
import { ChunkPlanner, LOD_FAR, LOD_NEAR, NONE, type RingConfig, ringArea } from './ChunkPlanner';

const SIZE = 64;
const RINGS: RingConfig = { active: 1, preload: 2, unload: 3, lodRing: 1 };

function planner(rings = RINGS): ChunkPlanner {
  return new ChunkPlanner(SIZE, rings, ringArea(rings.unload));
}

/** Center of chunk (cx, cz) in meters. */
const at = (c: number) => c * SIZE + SIZE / 2;

describe('ChunkPlanner', () => {
  it('creates every chunk within the preload ring, with colliders in the active ring', () => {
    const p = planner();
    expect(p.update(at(0), at(0), 0, 0)).toBe(true);
    expect(p.usedCount).toBe(ringArea(2));
    expect(p.records.filter((r) => r.used && r.active)).toHaveLength(ringArea(1));
    expect(p.get(0, 0)?.wantLod).toBe(LOD_NEAR);
    expect(p.get(1, -1)?.wantLod).toBe(LOD_NEAR);
    expect(p.get(2, 0)?.wantLod).toBe(LOD_FAR);
    expect(p.get(3, 0)).toBeUndefined();
  });

  it('only plans again when the player enters another chunk', () => {
    const p = planner();
    p.update(at(0), at(0), 0, 0);
    expect(p.update(at(0) + 20, at(0) - 20, 1, 0)).toBe(false);
    expect(p.update(at(1), at(0), 1, 0)).toBe(true);
  });

  it('keeps chunks between the preload and unload ring (hysteresis)', () => {
    const p = planner();
    p.update(at(0), at(0), 0, 0);
    p.update(at(1), at(0), 1, 0);
    // Column x = -1 is now ring 2, still kept; x = -2 is ring 3: kept, not dropped yet.
    expect(p.get(-2, 0)).toBeDefined();
    expect(p.usedCount).toBe(ringArea(2) + 5);
    // Back and forth over the edge: nothing is released or created again.
    const released: string[] = [];
    p.onRelease = (r) => released.push(`${r.cx},${r.cz}`);
    p.update(at(0), at(0), -1, 0);
    p.update(at(1), at(0), 1, 0);
    p.update(at(0), at(0), -1, 0);
    expect(released).toEqual([]);
    expect(p.usedCount).toBe(ringArea(2) + 5);
  });

  it('releases chunks beyond the unload ring', () => {
    const p = planner();
    const released: string[] = [];
    p.onRelease = (r) => released.push(`${r.cx},${r.cz}`);
    p.update(at(0), at(0), 0, 0);
    p.update(at(2), at(0), 1, 0);
    // Column x = -2 is now 4 chunks away.
    expect(released).toEqual(['-2,-2', '-2,-1', '-2,0', '-2,1', '-2,2']);
    p.update(at(4), at(0), 1, 0);
    // x = -2 .. 0 are now more than 3 chunks away.
    expect(released.length).toBe(15);
    expect(released.every((key) => Number(key.split(',')[0]) <= 0)).toBe(true);
    expect(p.get(0, 0)).toBeUndefined();
  });

  it('never needs more records than the unload area', () => {
    const p = planner();
    for (let step = 0; step < 40; step++) {
      p.update(at(Math.round(Math.sin(step) * 6)), at(step % 7), 1, 0);
      expect(p.usedCount).toBeLessThanOrEqual(ringArea(RINGS.unload));
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const c = p.records.find((r) => r.used && r.ring === 0);
          expect(p.get((c?.cx ?? 0) + dx, (c?.cz ?? 0) + dz)).toBeDefined();
        }
      }
    }
  });

  it('loads the player chunk first, then nearby chunks, ahead before behind', () => {
    const p = planner();
    // Walking east (+x) from the middle of chunk (0, 0).
    p.update(at(0), at(0), 1, 0);
    const order = p.queue.map((r) => `${r.cx},${r.cz}`);
    expect(order[0]).toBe('0,0');
    expect(order.indexOf('1,0')).toBeLessThan(order.indexOf('-1,0'));
    expect(order.indexOf('2,0')).toBeLessThan(order.indexOf('-2,0'));
    // Nearby beats far, even behind: (-1, 0) before (2, 2).
    expect(order.indexOf('-1,0')).toBeLessThan(order.indexOf('2,2'));
    expect(p.queue).toHaveLength(ringArea(2));
  });

  it('asks for a detailed rebuild when a coarse chunk comes close', () => {
    const p = planner();
    p.update(at(0), at(0), 0, 0);
    for (const r of p.records) if (r.used) r.shownLod = r.wantLod;
    const far = p.get(2, 0);
    expect(far?.shownLod).toBe(LOD_FAR);
    p.update(at(1), at(0), 1, 0);
    expect(far?.wantLod).toBe(LOD_NEAR);
    expect(far?.needsBuild).toBe(true);
    expect(p.queue).toContain(far);
    // A chunk that is only kept (beyond preload) is not rebuilt.
    const kept = p.get(-2, 0);
    expect(kept?.ring).toBe(3);
    expect(p.queue).not.toContain(kept);
  });

  it('clears everything when leaving the world', () => {
    const p = planner();
    p.update(at(0), at(0), 0, 0);
    p.clear();
    expect(p.usedCount).toBe(0);
    expect(p.records.every((r) => !r.used && r.shownLod === NONE)).toBe(true);
  });
});
