/**
 * Deterministic pseudo-random numbers (sfc32). The same seed always gives the same sequence,
 * on every device, so world scattering and terrain are identical for everyone (and for raid hosts).
 * Never use Math.random() for anything that shapes the world.
 */
export class Random {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;

  constructor(seed: number) {
    this.reseed(seed);
  }

  /** Resets the sequence (lets a pooled Random be reused without allocating). */
  reseed(seed: number): void {
    this.a = 0x9e3779b9;
    this.b = 0x243f6a88;
    this.c = 0xb7e15162;
    this.d = seed >>> 0;
    // Warm up so similar seeds diverge quickly.
    for (let i = 0; i < 15; i++) this.nextUint32();
  }

  /** Unsigned 32-bit integer. */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] (both inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with the given probability (0..1). */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from an empty list');
    return items[this.int(0, items.length - 1)] as T;
  }
}

/**
 * Hashes integers into one 32-bit seed, e.g. `hashSeed(worldSeed, chunkX, chunkZ)`, so every
 * chunk gets its own stable random sequence regardless of loading order.
 */
export function hashSeed(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}
