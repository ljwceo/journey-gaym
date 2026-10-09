/**
 * Deterministic 2D gradient noise (Perlin-style) without lookup tables: lattice gradients come
 * from an integer hash of (seed, x, z), so the same seed gives the same terrain on every device,
 * in the worker and on the main thread. Allocation-free.
 */

/** Hash of a lattice point to 32 bits. */
function hash2(seed: number, x: number, z: number): number {
  let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Dot product of the lattice gradient at (ix, iz) with the offset (dx, dz). */
function gradDot(seed: number, ix: number, iz: number, dx: number, dz: number): number {
  // 8 gradient directions: the axes and the diagonals.
  switch (hash2(seed, ix, iz) & 7) {
    case 0:
      return dx + dz;
    case 1:
      return dx - dz;
    case 2:
      return -dx + dz;
    case 3:
      return -dx - dz;
    case 4:
      return dx * Math.SQRT2;
    case 5:
      return -dx * Math.SQRT2;
    case 6:
      return dz * Math.SQRT2;
    default:
      return -dz * Math.SQRT2;
  }
}

/** Quintic fade curve: smooth first and second derivative (no visible grid creases). */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Gradient noise at (x, z) with a lattice spacing of 1, roughly in [-1, 1]. */
export function noise2(seed: number, x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fz);
  const n00 = gradDot(seed, ix, iz, fx, fz);
  const n10 = gradDot(seed, ix + 1, iz, fx - 1, fz);
  const n01 = gradDot(seed, ix, iz + 1, fx, fz - 1);
  const n11 = gradDot(seed, ix + 1, iz + 1, fx - 1, fz - 1);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 0.7071;
}

/**
 * Fractal noise: `octaves` layers, each with half the wavelength and `gain` times the height.
 * Normalised to roughly [-1, 1].
 */
export function fbm2(
  seed: number,
  x: number,
  z: number,
  wavelength: number,
  octaves: number,
  gain = 0.5,
): number {
  let frequency = 1 / wavelength;
  let amplitude = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2((seed + i * 1013) | 0, x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= 2;
  }
  return sum / norm;
}
