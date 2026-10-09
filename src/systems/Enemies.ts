import { Enemy, WOBBLE_SECONDS } from '../entities/Enemy';
import type { MonstersFile, Zone } from '../data/types';
import type { PointXZ } from '../world/Colliders';

/** Seconds of the white flash after a hit. */
const FLASH_SECONDS = 0.12;
/** A static dummy without `resetSeconds` stands up again after this long. */
const DEFAULT_RESET_SECONDS = 3;

/** Distances (m) for showing monsters: the same on every graphics preset (§2.3). */
export interface EnemyRanges {
  showRadius: number;
  hideMargin: number;
}

/**
 * All monsters from the zones' `spawns` (zones.json + monsters.json). Monsters are shown and
 * simulated within `showRadius` of the player (with a margin before they hide), on every
 * graphics preset the same. Phase 2.1: static training dummies that flash when hit, fall over
 * at 0 HP and stand up again with full HP. Allocation-free on the fixed step.
 */
export class Enemies {
  readonly list: Enemy[] = [];
  /** The enemies shown this step (a reused array). */
  readonly shown: Enemy[] = [];

  constructor(
    zones: readonly Zone[],
    monsters: MonstersFile,
    private readonly ranges: EnemyRanges,
  ) {
    const byId = new Map(monsters.monsters.map((m) => [m.id, m]));
    for (const zone of zones) {
      for (const spawn of zone.spawns ?? []) {
        const def = byId.get(spawn.monster);
        if (!def) throw new Error(`Unknown monster "${spawn.monster}" in ${zone.id}`);
        this.list.push(new Enemy(spawn.id, def, spawn.x, spawn.z));
      }
    }
  }

  /** One fixed step: which enemies are shown, their timers and ground height. */
  step(dt: number, px: number, pz: number, heightAt: (x: number, z: number) => number): void {
    const show2 = this.ranges.showRadius ** 2;
    const hide2 = (this.ranges.showRadius + this.ranges.hideMargin) ** 2;
    this.shown.length = 0;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i] as Enemy;
      const dx = e.x - px;
      const dz = e.z - pz;
      const d2 = dx * dx + dz * dz;
      if (e.shown ? d2 > hide2 : d2 > show2) {
        e.shown = false;
        continue;
      }
      e.shown = true;
      this.shown.push(e);
      e.beginStep();
      e.sinceHit += dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      if (e.wobble > 0) e.wobble = Math.max(0, e.wobble - dt);
      if (e.def.behavior === 'static') this.stepDummy(e, dt);
      e.y = heightAt(e.x, e.z);
    }
  }

  /** Deals damage to an enemy. Returns true when this hit defeated it. */
  hit(e: Enemy, damage: number): boolean {
    if (!e.alive) return false;
    e.hp = Math.max(0, e.hp - damage);
    e.sinceHit = 0;
    e.flash = FLASH_SECONDS;
    e.wobble = WOBBLE_SECONDS;
    if (e.hp > 0) return false;
    e.downTime = e.def.resetSeconds ?? DEFAULT_RESET_SECONDS;
    return true;
  }

  /** Pushes a walking circle out of every shown, standing enemy (you cannot walk through). */
  pushOut(p: PointXZ, radius: number): boolean {
    let moved = false;
    for (let i = 0; i < this.shown.length; i++) {
      const e = this.shown[i] as Enemy;
      const min = radius + e.radius;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-6) {
        p.x = e.x + min;
      } else {
        p.x = e.x + (dx / d) * min;
        p.z = e.z + (dz / d) * min;
      }
      moved = true;
    }
    return moved;
  }

  /** Training dummy: after a pause without hits (or after falling over) it is whole again. */
  private stepDummy(e: Enemy, dt: number): void {
    const reset = e.def.resetSeconds ?? DEFAULT_RESET_SECONDS;
    if (!e.alive) {
      e.downTime = Math.max(0, e.downTime - dt);
      if (e.downTime === 0) e.hp = e.maxHp;
    } else if (e.hp < e.maxHp && e.sinceHit >= reset) {
      e.hp = e.maxHp;
    }
  }
}
