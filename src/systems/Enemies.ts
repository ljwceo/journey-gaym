import { Enemy, WOBBLE_SECONDS } from '../entities/Enemy';
import type {
  MonsterDef,
  MonstersFile,
  NightSpawnDef,
  Shape,
  Zone,
  ZonesFile,
} from '../data/types';
import { hashSeed, Random } from '../core/Random';
import type { PointXZ } from '../world/Colliders';
import { emptyBox, pointInShape, shapeBounds } from '../world/Shapes';
import type { Mover } from './Movement';

/** Seconds of the white flash after a hit. */
const FLASH_SECONDS = 0.12;
/** A static dummy without `resetSeconds` stands up again after this long. */
const DEFAULT_RESET_SECONDS = 3;
/** Random spots tried per spawn attempt (some fall in safe zones, water or too close). */
const SPAWN_TRIES = 8;
/** Seconds a wandering monster waits at a spot: min + random up to this much more. */
const WAIT_MIN = 1;
const WAIT_EXTRA = 3;
/** Close enough (m) to a wander target. */
const ARRIVED = 0.3;

/** Distances (m) for showing monsters: the same on every graphics preset (§2.3). */
export interface EnemyRanges {
  showRadius: number;
  hideMargin: number;
}

/** Night spawning rules (zones.json `world.nightSpawning`). */
export type NightSpawnRules = ZonesFile['world']['nightSpawning'];

/** What spawning needs from the world each step. */
export interface SpawnWorld {
  /** True while monsters appear (dusk and night). */
  spawning: boolean;
  /** Also use test-only areas (debug mode). */
  testAreas: boolean;
  heightAt(x: number, z: number): number;
  /** Can a monster stand here (ground, not deep water, loaded)? */
  canStand(x: number, z: number): boolean;
}

/** One night spawn area with its pool slots. */
interface SpawnArea {
  def: NightSpawnDef;
  monsters: { def: MonsterDef; weight: number }[];
  totalWeight: number;
  slots: Enemy[];
  /** Seconds until each slot may be filled again (after its monster disappeared). */
  cooldown: number[];
  timer: number;
  random: Random;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * All monsters: training dummies from the zones' `spawns`, plus a fixed pool per night spawn
 * area (`nightSpawns`, filled at dusk and at night, never inside a safe zone). Monsters are shown
 * and simulated within `showRadius` of the player (with a margin before they hide), on every
 * graphics preset the same. Dummies flash, fall over at 0 HP and stand up again. Night monsters
 * wander around where they appeared (real AI comes with step 2.3), lie down when defeated and
 * then disappear; their slot fills again after `respawnSeconds`. What happens to them by day is
 * still open: for now they simply stay. Allocation-free on the fixed step.
 */
export class Enemies {
  readonly list: Enemy[] = [];
  /** The enemies shown this step (a reused array). */
  readonly shown: Enemy[] = [];
  private readonly areas: SpawnArea[] = [];
  private readonly safeZones: Shape[] = [];
  private readonly speeds: Record<string, number>;

  constructor(
    zones: readonly Zone[],
    monsters: MonstersFile,
    private readonly ranges: EnemyRanges,
    private readonly rules: NightSpawnRules | null = null,
    seed = 0,
  ) {
    this.speeds = monsters.speedClasses;
    const byId = new Map(monsters.monsters.map((m) => [m.id, m]));
    for (const zone of zones) {
      for (const spawn of zone.spawns ?? []) {
        const def = byId.get(spawn.monster);
        if (!def) throw new Error(`Unknown monster "${spawn.monster}" in ${zone.id}`);
        this.list.push(new Enemy(spawn.id, def, spawn.x, spawn.z));
      }
      for (const safe of zone.safeZones ?? []) this.safeZones.push(safe.shape);
      if (!rules) continue;
      for (const area of zone.nightSpawns ?? []) {
        const entries = area.monsters.map((entry) => {
          const def = byId.get(entry.monster);
          if (!def) throw new Error(`Unknown monster "${entry.monster}" in ${area.id}`);
          return { def, weight: entry.weight };
        });
        const first = entries[0]?.def;
        if (!first) continue;
        const possible = entries.map((entry) => entry.def);
        const slots: Enemy[] = [];
        for (let i = 0; i < area.maxAlive; i++) {
          const enemy = new Enemy(`${area.id}_${i}`, first, 0, 0, possible);
          enemy.active = false;
          slots.push(enemy);
          this.list.push(enemy);
        }
        const box = shapeBounds(area.shape, emptyBox());
        this.areas.push({
          def: area,
          monsters: entries,
          totalWeight: entries.reduce((sum, entry) => sum + entry.weight, 0),
          slots,
          cooldown: slots.map(() => 0),
          // Spread the first attempts so areas do not all try in the same step.
          timer: (this.areas.length * 0.37) % rules.checkSeconds,
          random: new Random(hashSeed(seed, this.areas.length, area.maxAlive)),
          ...box,
        });
      }
    }
  }

  /** Night monsters alive right now (debug). */
  get nightAlive(): number {
    let count = 0;
    for (const area of this.areas) {
      for (const slot of area.slots) if (slot.active && slot.alive) count++;
    }
    return count;
  }

  /** True when (x, z) is in a safe zone (city, village, Monastery, shrine). */
  inSafeZone(x: number, z: number): boolean {
    for (let i = 0; i < this.safeZones.length; i++) {
      if (pointInShape(this.safeZones[i] as Shape, x, z)) return true;
    }
    return false;
  }

  /**
   * One fixed step: which enemies are shown, their timers, wandering and ground height.
   * `mover` (walls) is optional: without it wandering monsters ignore walls.
   */
  step(
    dt: number,
    px: number,
    pz: number,
    heightAt: (x: number, z: number) => number,
    mover?: Mover,
  ): void {
    const show2 = this.ranges.showRadius ** 2;
    const hide2 = (this.ranges.showRadius + this.ranges.hideMargin) ** 2;
    this.shown.length = 0;
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i] as Enemy;
      if (!e.active) {
        e.shown = false;
        continue;
      }
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
      else this.stepWanderer(e, dt, mover);
      e.y = heightAt(e.x, e.z);
    }
  }

  /**
   * Night spawning, once per fixed step: every `checkSeconds` each area fills one free slot at a
   * random spot (inside the area, outside every safe zone, between min and max distance from the
   * player, on ground). Defeated night monsters disappear after `corpseSeconds` (also when far).
   */
  stepSpawning(dt: number, px: number, pz: number, world: SpawnWorld): void {
    const rules = this.rules;
    if (!rules) return;
    for (let a = 0; a < this.areas.length; a++) {
      const area = this.areas[a] as SpawnArea;
      for (let s = 0; s < area.slots.length; s++) {
        const slot = area.slots[s] as Enemy;
        if (slot.active && !slot.alive) {
          slot.downTime -= dt;
          if (slot.downTime <= 0) {
            slot.active = false;
            area.cooldown[s] = area.def.respawnSeconds;
          }
        } else if (!slot.active && (area.cooldown[s] as number) > 0) {
          area.cooldown[s] = Math.max(0, (area.cooldown[s] as number) - dt);
        }
      }
      area.timer -= dt;
      if (area.timer > 0) continue;
      area.timer += rules.checkSeconds;
      if (!world.spawning || (area.def.testOnly && !world.testAreas)) continue;
      const free = this.freeSlot(area);
      if (free < 0) continue;
      this.trySpawn(area, area.slots[free] as Enemy, px, pz, world);
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
    e.downTime =
      e.def.behavior === 'static'
        ? (e.def.resetSeconds ?? DEFAULT_RESET_SECONDS)
        : (this.rules?.corpseSeconds ?? DEFAULT_RESET_SECONDS);
    return true;
  }

  /** Pushes a walking circle out of every shown, standing enemy (you cannot walk through). */
  pushOut(p: PointXZ, radius: number): boolean {
    let moved = false;
    for (let i = 0; i < this.shown.length; i++) {
      const e = this.shown[i] as Enemy;
      // A fallen dummy still blocks (as before); a defeated monster no longer does.
      if (!e.alive && e.def.behavior !== 'static') continue;
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

  /** Walks slowly to a spot near where it appeared, waits, picks the next spot. */
  private stepWanderer(e: Enemy, dt: number, mover: Mover | undefined): void {
    const rules = this.rules;
    if (!e.alive || !rules) return;
    if (e.waitTime > 0) {
      e.waitTime -= dt;
      if (e.waitTime <= 0) this.pickTarget(e, rules.wanderRadius);
      return;
    }
    const dx = e.targetX - e.x;
    const dz = e.targetZ - e.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance < ARRIVED) {
      e.waitTime = WAIT_MIN + this.wanderNoise(e) * WAIT_EXTRA;
      return;
    }
    const speed = this.speeds[e.def.speed] ?? 1;
    const step = Math.min(distance, speed * dt);
    const fromX = e.x;
    const fromZ = e.z;
    const mx = (dx / distance) * step;
    const mz = (dz / distance) * step;
    if (mover) mover.moveCircle(e, e.radius, mx, mz);
    else {
      e.x += mx;
      e.z += mz;
    }
    // Never wander into a safe zone; stuck against a wall = wait and pick another spot.
    const moved = Math.abs(e.x - fromX) + Math.abs(e.z - fromZ);
    if (this.inSafeZone(e.x, e.z) || moved < step * 0.2) {
      e.x = fromX;
      e.z = fromZ;
      e.waitTime = WAIT_MIN;
    } else {
      e.moveTime += dt;
      e.heading = Math.atan2(dx, dz);
    }
  }

  /** A new wander spot within `radius` of home (fixed pattern per monster, no Math.random). */
  private pickTarget(e: Enemy, radius: number): void {
    const angle = this.wanderNoise(e) * Math.PI * 2;
    const r = radius * Math.sqrt(this.wanderNoise(e));
    e.targetX = e.homeX + Math.sin(angle) * r;
    e.targetZ = e.homeZ + Math.cos(angle) * r;
  }

  /** 0–1 from the monster's own position and time (stable, allocation-free). */
  private wanderNoise(e: Enemy): number {
    const h = hashSeed(Math.floor(e.x * 7), Math.floor(e.z * 7), Math.floor(e.moveTime * 10));
    return h / 4294967296;
  }

  private freeSlot(area: SpawnArea): number {
    for (let s = 0; s < area.slots.length; s++) {
      if (!(area.slots[s] as Enemy).active && (area.cooldown[s] as number) <= 0) return s;
    }
    return -1;
  }

  private trySpawn(area: SpawnArea, slot: Enemy, px: number, pz: number, world: SpawnWorld): void {
    const rules = this.rules;
    if (!rules) return;
    const r = area.random;
    const min2 = rules.minPlayerDistance ** 2;
    const max2 = rules.maxPlayerDistance ** 2;
    for (let i = 0; i < SPAWN_TRIES; i++) {
      const x = r.range(area.minX, area.maxX);
      const z = r.range(area.minZ, area.maxZ);
      if (!pointInShape(area.def.shape, x, z) || this.inSafeZone(x, z)) continue;
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < min2 || d2 > max2 || !world.canStand(x, z)) continue;
      const def = this.pickMonster(area);
      const level = r.int(area.def.levelRange[0], area.def.levelRange[1]);
      slot.spawn(def, x, z, level, r.range(-Math.PI, Math.PI));
      slot.y = world.heightAt(x, z);
      slot.waitTime = WAIT_MIN;
      return;
    }
  }

  private pickMonster(area: SpawnArea): MonsterDef {
    let roll = area.random.next() * area.totalWeight;
    for (const entry of area.monsters) {
      roll -= entry.weight;
      if (roll <= 0) return entry.def;
    }
    return (area.monsters[area.monsters.length - 1] as { def: MonsterDef }).def;
  }
}
