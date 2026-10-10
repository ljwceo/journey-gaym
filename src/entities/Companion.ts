import type { Random } from '../core/Random';
import { angleDelta, type Mover } from '../systems/Movement';
import { turnTowards, walkTowards, type WalkerState } from '../systems/NpcBehavior';

const DEG = Math.PI / 180;

export interface FollowConfig {
  /** Roams between these distances (m) around the player. */
  minDistance: number;
  maxDistance: number;
  /** Trotting speed (m/s) while the player travels; a bit faster than the player. */
  speed: number;
  /** Strolling speed (m/s) while the player stands still. */
  strollSpeed: number;
  /** Seconds it sits between strolls while the player stands still [min, max]. */
  idlePauseMin: number;
  idlePauseMax: number;
  /** Further away than this, it simply appears beside the player again. */
  teleportDistance: number;
  turnSpeed: number;
  bodyRadius: number;
}

/** What the companion sees of the player this step (a reused object). */
export interface FollowTarget {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
  /** Where the camera looks (yaw): the camera stands behind the player in this direction. */
  viewYaw: number;
}

export type FollowResult = 'idle' | 'walk' | 'teleport';

/** The player walks this long (s) before it counts as travelling (shorter = walking up to pet). */
const TRAVEL_SECONDS = 1.2;
/**
 * Spots are to the side of the player, measured from where the player goes (or looks):
 * never straight ahead (in the way) or straight behind (between the player and the camera).
 * Travelling the band is narrower than while standing still.
 */
const TRAVEL_ANGLES: readonly [number, number] = [65 * DEG, 135 * DEG];
const IDLE_ANGLES: readonly [number, number] = [40 * DEG, 145 * DEG];
/** While travelling, a new spot beside the player every few seconds [min, max]. */
const TRAVEL_SPOT_SECONDS: readonly [number, number] = [1.5, 4];
/** Now and then it stops to sniff at something while you travel, then catches up. */
const SNIFF_CHANCE = 0.2;
const SNIFF_SECONDS: readonly [number, number] = [0.6, 1.4];
/** Right after the player stops: it keeps still a moment before strolling. */
const SETTLE_SECONDS: readonly [number, number] = [0.3, 1];
/** Mostly stays on the side it is on (switching means crossing the player's path). */
const SWITCH_SIDE_CHANCE = 0.2;
/** Strolls keep at least this far (m) from the player's feet; tries this many spots. */
const CLEARANCE = 1.2;
const STROLL_ATTEMPTS = 4;
/** Close enough to its spot. */
const ARRIVED = 0.25;
/** A stroll that makes no progress for this long is given up (a wall). */
const STROLL_STUCK_SECONDS = 1.5;
/** A follower that makes no progress for this long while far away jumps to the player. */
const STUCK_SECONDS = 3;
const STUCK_DISTANCE = 6;
/** Where a companion appears, relative to the player's heading: behind and to the right. */
const BEHIND_ANGLE = -Math.PI * 0.7;

type Mode = 'sit' | 'stroll' | 'travel' | 'sniff';

/**
 * A companion that roams around the player (Pringle the cat). Not on a leash: it picks spots
 * beside you at varying distances. While you stand still it sits, looks around and strolls to
 * another spot now and then. While you travel it trots along beside you (never in front of you,
 * never between you and the camera), stops to sniff now and then and catches up. Walking up to
 * it to pet it works: it only starts trotting along once you really travel. After a teleport, or
 * when stuck behind a wall far away, it jumps back beside you. Seeded: always the same way.
 */
export class Companion {
  walking = false;
  private mode: Mode = 'sit';
  private timer = 0;
  private travelTime = 0;
  /** The spot: world point (stroll) or angle/distance relative to the player (travel). */
  private targetX = 0;
  private targetZ = 0;
  private spotAngle = 0;
  private spotDistance = 0;
  private lookHeading = 0;
  private stuckTime = 0;
  /** Distance left on a stroll at the last progress check. */
  private lastDistance = 0;
  /** Distance to the player last step (for "stuck far away"). */
  private followDistance = 0;

  constructor(
    readonly cfg: FollowConfig,
    private readonly rng: Random,
  ) {}

  step(s: WalkerState, p: FollowTarget, dt: number, mover: Mover): FollowResult {
    const c = this.cfg;
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > c.teleportDistance || this.stuckTime > STUCK_SECONDS) {
      this.placeBehind(s, p.x, p.z, p.heading);
      return 'teleport';
    }
    this.travelTime = p.moving ? this.travelTime + dt : 0;
    const travelling = p.moving && (this.travelTime >= TRAVEL_SECONDS || distance > c.maxDistance);

    if (travelling) {
      if (this.mode === 'sit' || this.mode === 'stroll') this.startTravel(s, p);
    } else if (this.mode === 'travel' || this.mode === 'sniff') {
      // The player stopped: sit down where it is (a moment), then stroll around.
      this.sit(s, p, SETTLE_SECONDS[0], SETTLE_SECONDS[1]);
    } else if (distance > c.maxDistance + 1) {
      // Standing still but far away (e.g. after a long dash): come closer.
      this.startStroll(s, p);
    }

    let result: FollowResult = 'idle';
    switch (this.mode) {
      case 'travel':
        result = this.stepTravel(s, p, distance, dt, mover);
        break;
      case 'sniff':
        this.timer -= dt;
        if (this.timer <= 0 || distance > c.maxDistance) this.startTravel(s, p);
        break;
      case 'stroll':
        result = this.stepStroll(s, p, distance, dt, mover);
        break;
      case 'sit':
        s.heading = turnTowards(s.heading, this.lookHeading, c.turnSpeed * 0.5 * dt);
        this.timer -= dt;
        if (this.timer <= 0) this.startStroll(s, p);
        break;
    }
    this.walking = result === 'walk';
    this.trackStuck(s, p, result, dt);
    return result;
  }

  /**
   * Puts the companion beside and a bit behind the player (spawn, teleport), so it does not
   * sit between the player and the camera.
   */
  placeBehind(s: WalkerState, playerX: number, playerZ: number, playerHeading: number): void {
    const c = this.cfg;
    const angle = playerHeading + BEHIND_ANGLE;
    const distance = (c.minDistance + c.maxDistance) / 2;
    s.x = playerX + Math.sin(angle) * distance;
    s.z = playerZ + Math.cos(angle) * distance;
    s.heading = playerHeading;
    this.walking = false;
    this.stuckTime = 0;
    this.travelTime = 0;
    this.followDistance = distance;
    this.mode = 'sit';
    this.timer = this.between(SETTLE_SECONDS);
    this.lookHeading = playerHeading;
  }

  /** Which side of the player it is on (+1 / -1), seen from `forward`. */
  private sideOf(s: WalkerState, p: FollowTarget, forward: number): number {
    const toCat = Math.atan2(s.x - p.x, s.z - p.z);
    return angleDelta(forward, toCat) >= 0 ? 1 : -1;
  }

  /** Picks a spot beside the player: an angle from `forward` and a distance. */
  private pickSpot(s: WalkerState, p: FollowTarget, forward: number, angles: readonly number[]) {
    const c = this.cfg;
    let side = this.sideOf(s, p, forward);
    if (this.rng.next() < SWITCH_SIDE_CHANCE && !p.moving) side = -side;
    const [lo, hi] = angles as [number, number];
    this.spotAngle = side * (lo + this.rng.next() * (hi - lo));
    this.spotDistance = c.minDistance + this.rng.next() * (c.maxDistance - c.minDistance);
  }

  private startTravel(s: WalkerState, p: FollowTarget): void {
    this.mode = 'travel';
    this.pickSpot(s, p, p.heading, TRAVEL_ANGLES);
    this.timer = this.between(TRAVEL_SPOT_SECONDS);
  }

  private stepTravel(
    s: WalkerState,
    p: FollowTarget,
    distance: number,
    dt: number,
    mover: Mover,
  ): FollowResult {
    const c = this.cfg;
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.rng.next() < SNIFF_CHANCE && distance <= c.maxDistance) {
        this.mode = 'sniff';
        this.timer = this.between(SNIFF_SECONDS);
        return 'idle';
      }
      this.pickSpot(s, p, p.heading, TRAVEL_ANGLES);
      this.timer = this.between(TRAVEL_SPOT_SECONDS);
    }
    // The spot moves with the player. Keep to the side it is on (after the player turns).
    const side = this.sideOf(s, p, p.heading);
    const angle = p.heading + side * Math.abs(this.spotAngle);
    const tx = p.x + Math.sin(angle) * this.spotDistance;
    const tz = p.z + Math.cos(angle) * this.spotDistance;
    const left = Math.hypot(tx - s.x, tz - s.z);
    if (left <= ARRIVED) {
      // Keeping pace: face the way the player goes.
      s.heading = turnTowards(s.heading, p.heading, c.turnSpeed * dt);
      walkTowards(s, tx, tz, c.speed, dt, mover, c.bodyRadius, 0);
      return 'walk';
    }
    // Far behind: run a little faster.
    const speed = distance > c.maxDistance * 2 ? c.speed * 1.3 : c.speed;
    walkTowards(s, tx, tz, speed, dt, mover, c.bodyRadius, c.turnSpeed);
    return 'walk';
  }

  private startStroll(s: WalkerState, p: FollowTarget): void {
    const forward = p.viewYaw;
    // A spot whose straight path passes close by the player's feet is not taken (a cat
    // weaving through your legs is in the way); then it simply sits a while longer.
    for (let attempt = 0; attempt < STROLL_ATTEMPTS; attempt++) {
      this.pickSpot(s, p, forward, IDLE_ANGLES);
      const angle = forward + this.spotAngle;
      const tx = p.x + Math.sin(angle) * this.spotDistance;
      const tz = p.z + Math.cos(angle) * this.spotDistance;
      if (segmentDistance(p.x, p.z, s.x, s.z, tx, tz) < CLEARANCE) continue;
      this.targetX = tx;
      this.targetZ = tz;
      this.mode = 'stroll';
      this.timer = STROLL_STUCK_SECONDS;
      this.lastDistance = Math.hypot(tx - s.x, tz - s.z);
      return;
    }
    this.sit(s, p, this.cfg.idlePauseMin, this.cfg.idlePauseMax);
  }

  private stepStroll(
    s: WalkerState,
    p: FollowTarget,
    distance: number,
    dt: number,
    mover: Mover,
  ): FollowResult {
    const c = this.cfg;
    // Far away: trot instead of strolling.
    const speed = distance > c.maxDistance ? c.speed : c.strollSpeed;
    const left = walkTowards(
      s,
      this.targetX,
      this.targetZ,
      speed,
      dt,
      mover,
      c.bodyRadius,
      c.turnSpeed,
    );
    if (left <= ARRIVED) {
      this.sit(s, p, c.idlePauseMin, c.idlePauseMax);
      return 'idle';
    }
    // Blocked (a wall, water): give up and sit.
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.lastDistance - left < speed * STROLL_STUCK_SECONDS * 0.25) {
        this.sit(s, p, c.idlePauseMin, c.idlePauseMax);
        return 'idle';
      }
      this.lastDistance = left;
      this.timer = STROLL_STUCK_SECONDS;
    }
    return 'walk';
  }

  /** Sits down; looks at the player, or (sometimes) somewhere else. */
  private sit(s: WalkerState, p: FollowTarget, min: number, max: number): void {
    this.mode = 'sit';
    this.timer = min + this.rng.next() * Math.max(0, max - min);
    this.lookHeading =
      this.rng.next() < 0.6
        ? Math.atan2(p.x - s.x, p.z - s.z)
        : s.heading + (this.rng.next() - 0.5) * Math.PI;
  }

  /** Stuck = far away and not getting closer (the player may walk away too, so be lenient). */
  private trackStuck(s: WalkerState, p: FollowTarget, result: FollowResult, dt: number): void {
    const now = Math.hypot(p.x - s.x, p.z - s.z);
    const progress = this.followDistance - now;
    this.followDistance = now;
    if (result === 'walk' && now > STUCK_DISTANCE && progress < this.cfg.speed * dt * 0.1) {
      this.stuckTime += dt;
    } else {
      this.stuckTime = 0;
    }
  }

  private between(range: readonly [number, number]): number {
    return range[0] + this.rng.next() * (range[1] - range[0]);
  }
}

/** Distance from (px, pz) to the line segment (ax, az)–(bx, bz). */
function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
