import type { MonsterDef } from '../data/types';
import type { SwordTarget } from '../systems/Combat';

/** Default body radius (m) when monsters.json gives none. */
export const DEFAULT_ENEMY_RADIUS = 0.5;
/** Seconds a hit target wobbles (drawn only). */
export const WOBBLE_SECONDS = 0.3;

/** Model name of a monster (monsters.json `model`, else "placeholder:<id>"). */
export function enemyModelKey(def: MonsterDef): string {
  return def.model ?? `placeholder:${def.id}`;
}

/**
 * One monster in the world (simulation state only; EnemyRenderer draws it). Training dummies
 * stand still; monsters that appear at night come from a pool: an inactive slot is filled again
 * with `spawn` (no new objects while playing). Position and heading are interpolated between
 * fixed steps like the player's.
 */
export class Enemy implements SwordTarget {
  x: number;
  y = 0;
  z: number;
  heading = 0;
  /** Near enough to the player to be simulated and drawn. */
  shown = false;
  /** False for an empty pool slot (a night monster that has not appeared, or is gone again). */
  active = true;
  hp: number;
  maxHp: number;
  radius: number;
  level = 1;
  /** Seconds until a defeated dummy stands up again / a defeated monster disappears. */
  downTime = 0;
  /** Seconds since the last hit taken (dummies reset after a pause). */
  sinceHit = Infinity;
  /** Seconds of the white hit flash left. */
  flash = 0;
  /** Seconds of the "knocked back" wobble left (drawn only). */
  wobble = 0;
  /** Wandering: where to, and seconds to wait before picking a new spot. */
  targetX = 0;
  targetZ = 0;
  waitTime = 0;
  /** Seconds spent moving (drives the hop of a slime; drawn only). */
  moveTime = 0;
  /** Every model this slot can take (night areas can mix monsters), for the renderer. */
  readonly possibleModels: string[];
  private prevX: number;
  private prevZ: number;

  constructor(
    readonly id: string,
    public def: MonsterDef,
    public homeX: number,
    public homeZ: number,
    possible: readonly MonsterDef[] = [def],
  ) {
    this.x = this.prevX = homeX;
    this.z = this.prevZ = homeZ;
    this.hp = this.maxHp = def.hp;
    this.radius = def.radius ?? DEFAULT_ENEMY_RADIUS;
    this.possibleModels = [...new Set(possible.map(enemyModelKey))];
    this.targetX = homeX;
    this.targetZ = homeZ;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get hittable(): boolean {
    return this.active && this.hp > 0;
  }

  /** Fills a pool slot: this monster appears at (x, z) with full HP. */
  spawn(def: MonsterDef, x: number, z: number, level: number, heading: number): void {
    this.def = def;
    this.active = true;
    this.level = level;
    this.hp = this.maxHp = def.hp;
    this.radius = def.radius ?? DEFAULT_ENEMY_RADIUS;
    this.homeX = this.targetX = this.x = this.prevX = x;
    this.homeZ = this.targetZ = this.z = this.prevZ = z;
    this.heading = heading;
    this.downTime = 0;
    this.sinceHit = Infinity;
    this.flash = 0;
    this.wobble = 0;
    this.waitTime = 0;
    this.moveTime = 0;
    this.shown = false;
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
