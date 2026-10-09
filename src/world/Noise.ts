import { hashSeed } from '../core/Random';

/**
 * Deterministic 2D gradient noise (Perlin-style) for terrain. Pure math with no allocations, so
 * it runs the same in the terrain worker and on the main thread, on every device.
 */
/** Stretch of fbm output: without it, 90% of values lie between 0.35 and 0.65. */
const CONTRAST = 2.5;

export class Noise2D {
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = hashSeed(seed, 0x6e6f6973);
  }

  /** Gradient noise at (x, z), roughly in [-1, 1]; 1 unit = one grid cell. */
  sample(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;
    const u = fade(fx);
    const v = fade(fz);
    const n00 = this.gradient(x0, z0, fx, fz);
    const n10 = this.gradient(x0 + 1, z0, fx - 1, fz);
    const n01 = this.gradient(x0, z0 + 1, fx, fz - 1);
    const n11 = this.gradient(x0 + 1, z0 + 1, fx - 1, fz - 1);
    const a = n00 + (n10 - n00) * u;
    const b = n01 + (n11 - n01) * u;
    // Perlin gradients of length 1 reach about ±0.71; scale to about ±1.
    return (a + (b - a) * v) * 1.41;
  }

  /**
   * Fractal noise: `octaves` layers, each twice as fine and half as strong.
   * Returns a value in [0, 1] (0.5 on average).
   */
  fbm(x: number, z: number, octaves: number): number {
    let sum = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let total = 0;
    for (let i = 0; i < octaves; i++) {
      // Offset each octave so their grid points never line up.
      sum += this.sample(x * frequency + i * 17.3, z * frequency - i * 31.7) * amplitude;
      total += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    // Fractal noise clusters around its middle; stretch it so [0, 1] is really used
    // (about 5% of points end up at 0 or 1).
    const value = 0.5 + CONTRAST * 0.5 * (sum / total);
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  private gradient(ix: number, iz: number, dx: number, dz: number): number {
    // Eight evenly spread directions, picked by a hash of the grid point.
    const h = hash3(this.seed, ix, iz) & 7;
    switch (h) {
      case 0:
        return dx;
      case 1:
        return -dx;
      case 2:
        return dz;
      case 3:
        return -dz;
      case 4:
        return (dx + dz) * Math.SQRT1_2;
      case 5:
        return (dx - dz) * Math.SQRT1_2;
      case 6:
        return (-dx + dz) * Math.SQRT1_2;
      default:
        return (-dx - dz) * Math.SQRT1_2;
    }
  }
}

/** Same mixing as `hashSeed`, for exactly three values and without the rest-argument array. */
function hash3(a: number, b: number, c: number): number {
  let h = 0x811c9dc5;
  h = mix(h, a);
  h = mix(h, b);
  h = mix(h, c);
  return h >>> 0;
}

function mix(h: number, value: number): number {
  h = Math.imul(h ^ (value | 0), 0x01000193);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  return h ^ (h >>> 12);
}

/** Perlin's smootherstep: 6t^5 - 15t^4 + 10t^3. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
