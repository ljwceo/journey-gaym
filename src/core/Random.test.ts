import { describe, expect, it } from 'vitest';
import { hashSeed, Random } from './Random';

describe('Random', () => {
  it('gives the same sequence for the same seed', () => {
    const a = new Random(1234);
    const b = new Random(1234);
    for (let i = 0; i < 100; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('gives different sequences for different seeds', () => {
    const a = new Random(1);
    const b = new Random(2);
    let same = 0;
    for (let i = 0; i < 100; i++) if (a.nextUint32() === b.nextUint32()) same++;
    expect(same).toBeLessThan(2);
  });

  it('is stable across versions (golden values)', () => {
    const rng = new Random(42);
    const values = [rng.nextUint32(), rng.nextUint32(), rng.nextUint32()];
    // If this fails, the generator changed and every generated world would change with it.
    expect(values).toMatchInlineSnapshot(`
      [
        2852766471,
        4136168353,
        1126838629,
      ]
    `);
  });

  it('reseed restarts the sequence', () => {
    const rng = new Random(7);
    const first = rng.next();
    rng.next();
    rng.reseed(7);
    expect(rng.next()).toBe(first);
  });

  it('keeps values within their ranges and roughly uniform', () => {
    const rng = new Random(99);
    const buckets = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const r = rng.range(-2, 3);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(3);
      const n = rng.int(1, 6);
      buckets[n - 1] = (buckets[n - 1] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(9500);
      expect(count).toBeLessThan(10500);
    }
  });

  it('pick chooses from the list and rejects empty lists', () => {
    const rng = new Random(5);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });
});

describe('hashSeed', () => {
  it('is deterministic and order-sensitive', () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(1, 3, 2));
  });

  it('gives distinct seeds for neighbouring chunks', () => {
    const seen = new Set<number>();
    for (let x = -20; x < 20; x++) {
      for (let z = -20; z < 20; z++) seen.add(hashSeed(1337, x, z));
    }
    expect(seen.size).toBe(1600);
  });
});
