import type { MonsterDef } from '../data/types';
import type { SwordTarget } from '../systems/Combat';

/** Default body radius (m) when monsters.json gives none. */
export const DEFAULT_ENEMY_RADIUS = 0.5;
/** Seconds a hit target wobbles (drawn only). */
export const WOBBLE_SECONDS = 0.3;

/**
 * One monster in the world (simulation state only; EnemyRenderer draws it). Phase 2.1 has only
 * static training dummies; walking, attacking and respawning monsters build on the same state.
 * Position and heading are interpolated between fixed steps like the player's.
 */
export class Enemy implements SwordTarget {
  x: number;
  y = 0;
  z: number;
  heading = 0;
  /** Near enough to the player to be simulated and drawn. */
  shown = false;
  hp: number;
  readonly maxHp: number;
  readonly radius: number;
  /** Seconds until a defeated dummy stands up again (0 = standing). */
  downTime = 0;
  /** Seconds since the last hit taken (dummies reset after a pause). */
  sinceHit = Infinity;
  /** Seconds of the white hit flash left. */
  flash = 0;
  /** Seconds of the "knocked back" wobble left (drawn only). */
  wobble = 0;
  private prevX: number;
  private prevZ: number;

  constructor(
    readonly id: string,
    readonly def: MonsterDef,
    readonly homeX: number,
    readonly homeZ: number,
  ) {
    this.x = this.prevX = homeX;
    this.z = this.prevZ = homeZ;
    this.hp = this.maxHp = def.hp;
    this.radius = def.radius ?? DEFAULT_ENEMY_RADIUS;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get hittable(): boolean {
    return this.hp > 0;
  }

  beginStep(): void {
    this.prevX = this.x;
    this.prevZ = this.z;
  }

  drawX(alpha: number): number {
    return this.prevX + (this.x - this.prevX) * alpha;
  }

  drawZ(alpha: number): number {
    return this.prevZ + (this.z - this.prevZ) * alpha;
  }
}
