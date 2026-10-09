import type { Random } from '../core/Random';
import type { PointXZ } from '../world/Colliders';
import { angleDelta, type Mover } from './Movement';

/** Where an NPC is and which way it faces. Heading 0 faces +z (like the player). */
export interface WalkerState extends PointXZ {
  heading: number;
}

/** Turns `heading` towards `target` by at most `maxTurn` radians. */
export function turnTowards(heading: number, target: number, maxTurn: number): number {
  const delta = angleDelta(heading, target);
  const next = Math.abs(delta) <= maxTurn ? target : heading + Math.sign(delta) * maxTurn;
  return angleDelta(0, next);
}

/**
 * Walks one fixed step towards (tx, tz) at `speed` m/s through the world (collision, slopes,
 * water) and turns to face the walking direction. Never overshoots the target.
 * Returns the distance that is left.
 */
export function walkTowards(
  s: WalkerState,
  tx: number,
  tz: number,
  speed: number,
  dt: number,
  mover: Mover,
  radius: number,
  turnSpeed: number,
): number {
  const dx = tx - s.x;
  const dz = tz - s.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance < 1e-4) return 0;
  const step = Math.min(distance, speed * dt);
  mover.moveCircle(s, radius, (dx / distance) * step, (dz / distance) * step);
  s.heading = turnTowards(s.heading, Math.atan2(dx, dz), turnSpeed * dt);
  return Math.hypot(tx - s.x, tz - s.z);
}

export interface WanderConfig {
  /** Home point and how far from it the NPC may roam. */
  homeX: number;
  homeZ: number;
  radius: number;
  speed: number;
  pauseMin: number;
  pauseMax: number;
  turnSpeed: number;
  /** Collision radius used while walking. */
  bodyRadius: number;
}

/** A walk that makes less progress than this fraction of its speed for a while is stuck. */
const STUCK_PROGRESS = 0.25;
const STUCK_SECONDS = 1.5;
const ARRIVED = 0.3;

/**
 * Wandering (Treewardens): wait a random time, walk to a random point within the radius
 * around home, wait again. A walk that gets stuck (tree, wall, water) is given up. Uses the
 * NPC's own seeded Random, so the same NPC always wanders the same way.
 */
export class Wander {
  walking = false;
  targetX = 0;
  targetZ = 0;
  /** Seconds left to wait (pause) or until the progress check (walking). */
  private timer = 0;
  private checkDistance = 0;
  private stuckTimer = 0;

  constructor(
    readonly cfg: WanderConfig,
    private readonly rng: Random,
  ) {
    this.timer = this.pauseTime();
  }

  step(s: WalkerState, dt: number, mover: Mover): void {
    const c = this.cfg;
    if (!this.walking) {
      this.timer -= dt;
      if (this.timer > 0) return;
      // Uniform over the disc: sqrt for the distance.
      const angle = this.rng.next() * Math.PI * 2;
      const distance = Math.sqrt(this.rng.next()) * c.radius;
      this.targetX = c.homeX + Math.sin(angle) * distance;
      this.targetZ = c.homeZ + Math.cos(angle) * distance;
      this.walking = true;
      this.checkDistance = Math.hypot(this.targetX - s.x, this.targetZ - s.z);
      this.stuckTimer = STUCK_SECONDS;
      return;
    }
    const left = walkTowards(
      s,
      this.targetX,
      this.targetZ,
      c.speed,
      dt,
      mover,
      c.bodyRadius,
      c.turnSpeed,
    );
    if (left <= ARRIVED) {
      this.stop();
      return;
    }
    this.stuckTimer -= dt;
    if (this.stuckTimer > 0) return;
    if (this.checkDistance - left < c.speed * STUCK_SECONDS * STUCK_PROGRESS) {
      this.stop();
      return;
    }
    this.checkDistance = left;
    this.stuckTimer = STUCK_SECONDS;
  }

  private stop(): void {
    this.walking = false;
    this.timer = this.pauseTime();
  }

  private pauseTime(): number {
    const c = this.cfg;
    return c.pauseMin + this.rng.next() * Math.max(0, c.pauseMax - c.pauseMin);
  }
}
