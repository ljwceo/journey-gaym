/**
 * Floating origin: the GPU works with 32-bit floats, which get coarse far from (0, 0, 0).
 * Simulation and saves keep plain world coordinates (JavaScript numbers are 64-bit), but
 * everything that is drawn is placed relative to this origin. Once the player is more than
 * `threshold` meters away from it, the origin jumps to the player (snapped to the chunk grid),
 * and the world's render positions are moved back once.
 */
export class FloatingOrigin {
  x = 0;
  z = 0;
  /** How far the origin moved in the last shift. */
  shiftX = 0;
  shiftZ = 0;
  /** Number of shifts so far (for the debug overlay). */
  shifts = 0;

  constructor(
    readonly threshold: number,
    readonly snap: number,
  ) {}

  /** Puts the origin at (x, z) without counting it as a shift (entering the world, teleport). */
  reset(x: number, z: number): void {
    this.x = this.snapped(x);
    this.z = this.snapped(z);
    this.shiftX = 0;
    this.shiftZ = 0;
  }

  /** Call every frame with the player position. Returns true when the origin moved. */
  update(x: number, z: number): boolean {
    const dx = x - this.x;
    const dz = z - this.z;
    if (dx * dx + dz * dz <= this.threshold * this.threshold) return false;
    const nx = this.snapped(x);
    const nz = this.snapped(z);
    this.shiftX = nx - this.x;
    this.shiftZ = nz - this.z;
    this.x = nx;
    this.z = nz;
    this.shifts++;
    return true;
  }

  private snapped(value: number): number {
    return Math.round(value / this.snap) * this.snap;
  }
}
