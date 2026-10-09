import type { Mover } from '../systems/Movement';
import { turnTowards, walkTowards, type WalkerState } from '../systems/NpcBehavior';

export interface FollowConfig {
  /** Stays about this far (m) from the player. */
  distance: number;
  /** Walking speed (m/s); a bit faster than the player so it catches up. */
  speed: number;
  /** Further away than this, it simply appears behind the player again. */
  teleportDistance: number;
  turnSpeed: number;
  bodyRadius: number;
}

export type FollowResult = 'idle' | 'walk' | 'teleport';

/** Starts walking again once this much further than `distance` (no stop-start jitter). */
const RESTART_MARGIN = 0.8;
/** Close enough to `distance` to sit down (walking aims exactly at it). */
const ARRIVE_MARGIN = 0.05;
/** A follower that makes no progress for this long while far away jumps to the player. */
const STUCK_SECONDS = 3;
const STUCK_DISTANCE = 6;
/** Where a companion appears, relative to the player's heading: behind and to the right. */
const BEHIND_ANGLE = -Math.PI * 0.7;

/**
 * A companion that follows the player (Pringle the cat). Walks to the player when it falls
 * behind, sits when close, faces the player while sitting, and jumps back behind the player
 * after a teleport or when it got stuck behind a wall far away.
 */
export class Companion {
  walking = false;
  private stuckTime = 0;
  private lastDistance = 0;

  constructor(readonly cfg: FollowConfig) {}

  step(
    s: WalkerState,
    playerX: number,
    playerZ: number,
    playerHeading: number,
    dt: number,
    mover: Mover,
  ): FollowResult {
    const c = this.cfg;
    const distance = Math.hypot(playerX - s.x, playerZ - s.z);
    if (distance > c.teleportDistance || this.stuckTime > STUCK_SECONDS) {
      this.placeBehind(s, playerX, playerZ, playerHeading);
      return 'teleport';
    }
    if (!this.walking && distance > c.distance + RESTART_MARGIN) this.walking = true;
    if (this.walking && distance <= c.distance + ARRIVE_MARGIN) this.walking = false;

    if (!this.walking) {
      this.stuckTime = 0;
      // Sitting: look at the player.
      if (distance > 1e-3) {
        const target = Math.atan2(playerX - s.x, playerZ - s.z);
        s.heading = turnTowards(s.heading, target, c.turnSpeed * dt);
      }
      return 'idle';
    }
    // Aim at the point `distance` short of the player, so it stops beside you, not in you.
    const k = (distance - c.distance) / distance;
    const tx = s.x + (playerX - s.x) * k;
    const tz = s.z + (playerZ - s.z) * k;
    walkTowards(s, tx, tz, c.speed, dt, mover, c.bodyRadius, c.turnSpeed);
    const now = Math.hypot(playerX - s.x, playerZ - s.z);
    // Stuck = far away and not getting closer (the player may walk away too, so be lenient).
    const progress = this.lastDistance - now;
    this.lastDistance = now;
    if (now > STUCK_DISTANCE && progress < c.speed * dt * 0.1) this.stuckTime += dt;
    else this.stuckTime = 0;
    return 'walk';
  }

  /**
   * Puts the companion `distance` away, behind the player and to the side (spawn, teleport),
   * so it does not sit between the player and the camera.
   */
  placeBehind(s: WalkerState, playerX: number, playerZ: number, playerHeading: number): void {
    const c = this.cfg;
    const angle = playerHeading + BEHIND_ANGLE;
    s.x = playerX + Math.sin(angle) * c.distance;
    s.z = playerZ + Math.cos(angle) * c.distance;
    s.heading = playerHeading;
    this.walking = false;
    this.stuckTime = 0;
    this.lastDistance = c.distance;
  }
}
