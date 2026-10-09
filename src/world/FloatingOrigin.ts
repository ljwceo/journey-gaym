/**
 * Floating origin: the GPU works with 32-bit floats, which get imprecise far from (0, 0, 0).
 * Once the player is more than `shiftDistance` meters from the render origin, the origin jumps
 * to the player (snapped to the chunk grid) and the whole world is drawn shifted back.
 * Simulation and saves always use real world coordinates; only drawing subtracts the origin.
 */
export class FloatingOrigin {
  x = 0;
  z = 0;
  /** Number of shifts so far (debug overlay). */
  shifts = 0;

  constructor(
    private readonly shiftDistance: number,
    private readonly snap: number,
  ) {}

  /** Moves the origin to the player when needed. Returns true when it moved. */
  update(playerX: number, playerZ: number): boolean {
    const dx = playerX - this.x;
    const dz = playerZ - this.z;
    if (dx * dx + dz * dz <= this.shiftDistance * this.shiftDistance) return false;
    this.reset(playerX, playerZ);
    this.shifts++;
    return true;
  }

  /** Puts the origin at the grid point nearest to (x, z) (entering the world, teleporting). */
  reset(x: number, z: number): void {
    this.x = Math.round(x / this.snap) * this.snap;
    this.z = Math.round(z / this.snap) * this.snap;
  }
}
