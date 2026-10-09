import { type Collider, keepInside, type PointXZ, pushOutOf } from '../world/Colliders';
import type { SpatialHash } from '../world/SpatialHash';

/** Longest distance a mover travels before collision is checked again (no tunneling). */
const MAX_SUBSTEP = 0.2;
/** Push-out passes per substep; more passes settle corners between two colliders. */
const PASSES = 3;

/** Rectangle movers cannot leave (world edge; later also deep water). */
export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** The ground, as far as walking cares: heights and where the water is too deep. */
export interface WalkableGround {
  heightAt(x: number, z: number): number;
  isDeepWater(height: number): boolean;
}

/**
 * Moves circles through the static colliders of a SpatialHash. Long moves (a dash) are split
 * into short substeps so a fast mover cannot pass through a thin wall.
 *
 * With a ground, a substep is also refused when it climbs a slope steeper than `maxSlope`
 * (rise per meter) or goes deeper into deep water. Going downhill on land, or climbing out of
 * the water, is always allowed, so a mover can never get stuck. A refused step tries each axis on its own, so you
 * slide along a cliff or a coast instead of stopping dead.
 */
export class CollisionWorld {
  private readonly nearby: Collider[] = [];

  constructor(
    readonly hash: SpatialHash,
    public bounds: Bounds | null = null,
    readonly ground: WalkableGround | null = null,
    /** Steepest climb allowed, as rise per meter (tan of the slope limit). */
    readonly maxSlope = Infinity,
  ) {}

  /** Moves `p` by (dx, dz) and resolves overlaps. `p` is updated in place. */
  moveCircle(p: PointXZ, radius: number, dx: number, dz: number): void {
    const length = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(1, Math.ceil(length / MAX_SUBSTEP));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      const fromX = p.x;
      const fromZ = p.z;
      p.x += sx;
      p.z += sz;
      this.resolve(p, radius);
      if (!this.ground || this.canWalk(fromX, fromZ, p.x, p.z)) continue;
      // Blocked by the ground: slide along x only, then along z only, else stay.
      p.x = fromX + sx;
      p.z = fromZ;
      this.resolve(p, radius);
      if (this.canWalk(fromX, fromZ, p.x, p.z)) continue;
      p.x = fromX;
      p.z = fromZ + sz;
      this.resolve(p, radius);
      if (this.canWalk(fromX, fromZ, p.x, p.z)) continue;
      p.x = fromX;
      p.z = fromZ;
    }
  }

  /** True when the ground lets a mover go from one point to the next. */
  canWalk(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    const ground = this.ground;
    if (!ground) return true;
    const from = ground.heightAt(fromX, fromZ);
    const to = ground.heightAt(toX, toZ);
    // Deeper into deep water: no. Out of it (uphill): always.
    if (to < from) return !ground.isDeepWater(to);
    if (to === from) return true;
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const distance = Math.sqrt(dx * dx + dz * dz);
    return distance < 1e-9 || (to - from) / distance <= this.maxSlope;
  }

  /** Pushes `p` out of every collider it overlaps and keeps it inside the bounds. */
  resolve(p: PointXZ, radius: number): void {
    const margin = radius + MAX_SUBSTEP;
    const nearby = this.hash.query(
      p.x - margin,
      p.z - margin,
      p.x + margin,
      p.z + margin,
      this.nearby,
    );
    for (let pass = 0; pass < PASSES; pass++) {
      let moved = false;
      for (let i = 0; i < nearby.length; i++) {
        if (pushOutOf(p, radius, nearby[i] as Collider)) moved = true;
      }
      const b = this.bounds;
      if (b && keepInside(p, radius, b.minX, b.minZ, b.maxX, b.maxZ)) moved = true;
      if (!moved) break;
    }
  }
}
