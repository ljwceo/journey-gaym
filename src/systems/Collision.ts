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

/**
 * Moves circles through the static colliders of a SpatialHash. Long moves (a dash) are split
 * into short substeps so a fast mover cannot pass through a thin wall.
 */
export class CollisionWorld {
  private readonly nearby: Collider[] = [];

  constructor(
    readonly hash: SpatialHash,
    public bounds: Bounds | null = null,
  ) {}

  /** Moves `p` by (dx, dz) and resolves overlaps. `p` is updated in place. */
  moveCircle(p: PointXZ, radius: number, dx: number, dz: number): void {
    const length = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(1, Math.ceil(length / MAX_SUBSTEP));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      p.x += sx;
      p.z += sz;
      this.resolve(p, radius);
    }
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
