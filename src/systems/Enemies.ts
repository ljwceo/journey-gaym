import { hashSeed, Random } from '../core/Random';
import { Enemy, WOBBLE_SECONDS } from '../entities/Enemy';
import type { MonsterDef, MonstersFile, Shape, Zone } from '../data/types';
import type { PointXZ } from '../world/Colliders';
import { pointInShape } from '../world/Shapes';
import {
  defeat,
  type EnemyAiConfig,
  enemyAiConfig,
  type EnemyTarget,
  type EnemyWorld,
  engage,
  stepEnemyAi,
} from './EnemyAI';

/** Seconds of the white flash after a hit. */
const FLASH_SECONDS = 0.12;
/** A static dummy without `resetSeconds` stands up again after this long. */
const DEFAULT_RESET_SECONDS = 3;
/** Pack mates stand within this distance (m) of the pack's spot. */
const PACK_SPREAD = 2.5;
/** Pack mates roam this far (m) around the pack's spot, so a pack stays together. */
const PACK_WANDER = 4;
/** Lone monsters of a spawn area roam this fraction of the area's radius around their spot. */
const AREA_WANDER_FRACTION = 0.5;
/** Monsters split from a dying one appear this far (m) to its sides. */
const SPLIT_OFFSET = 0.9;
/** Monsters push each other apart by this fraction of the overlap per step. */
const SEPARATION = 0.5;
const DEFAULT_SPEED = 2;

/** Distances (m) for showing monsters: the same on every graphics preset (§2.3). */
export interface EnemyRanges {
  showRadius: number;
  hideMargin: number;
}

/** A group that spawns, fights and respawns together (one goblin pack, one slime, ...). */
interface Pack {
  members: Enemy[];
  /** Pool slots for monsters split from members (Big Slime → Green Slimes). */
  children: Enemy[];
  /** Spawn area (radius 0 = a fixed spot). */
  x: number;
  z: number;
  radius: number;
  def: MonsterDef;
  respawnSeconds: number;
  /** Seconds until the pack comes back (counts once everyone is gone). */
  timer: number;
  /** Rolls pack sizes and spots; seeded from the spawn id. */
  rng: Random;
  /** Fixed spots (training dummy, Treewarden, chief) never move to a new spot. */
  fixed: boolean;
  wanderRadius: number;
}

/** The world as monsters see it: walking (EnemyWorld) plus the ground height. */
export interface EnemiesWorld extends EnemyWorld {
  heightAt(x: number, z: number): number;
}

/**
 * All monsters of the open world, in one pool built from zones.json (`spawns` and
 * `spawnAreas`) and monsters.json. Monsters are drawn within `showRadius` of the player (with
 * a margin before they hide) and move and fight within `settings.simulateRadius`, the same on
 * every graphics preset. Packs (goblins in twos and threes) notice you together; a defeated
 * pack comes back after `respawnSeconds`, once you are away. A Big Slime splits into two
 * Green Slimes from slots kept for it. Training dummies stand still and get up again.
 * Allocation-free on the fixed step.
 */
export class Enemies {
  readonly list: Enemy[] = [];
  /** The enemies shown this step (a reused array). */
  readonly shown: Enemy[] = [];
  readonly ai: EnemyAiConfig;
  private readonly packs: Pack[] = [];
  private readonly packOf = new Map<Enemy, Pack>();
  private readonly speeds: Readonly<Record<string, number>>;
  private readonly simulateRadius: number;
  private readonly respawnDistance: number;
  private readonly packAggroRadius: number;
  /** Simulated (moving) this step: separation only between these. */
  private readonly moving: Enemy[] = [];
  private world: EnemiesWorld | null = null;

  constructor(
    zones: readonly Zone[],
    monsters: MonstersFile,
    private readonly ranges: EnemyRanges,
    private readonly safeAreas: ReadonlyMap<string, Shape> = new Map(),
  ) {
    this.ai = enemyAiConfig(monsters);
    this.speeds = monsters.speedClasses;
    this.simulateRadius = monsters.settings.simulateRadius;
    this.respawnDistance = monsters.settings.respawnMinPlayerDistance;
    this.packAggroRadius = monsters.settings.packAggroRadius;
    const byId = new Map(monsters.monsters.map((m) => [m.id, m]));
    const find = (zone: Zone, id: string): MonsterDef => {
      const def = byId.get(id);
      if (!def) throw new Error(`Unknown monster "${id}" in ${zone.id}`);
      return def;
    };
    for (const zone of zones) {
      for (const spawn of zone.spawns ?? []) {
        this.addPack(spawn.id, find(zone, spawn.monster), byId, {
          x: spawn.x,
          z: spawn.z,
          radius: 0,
          wanderRadius: spawn.wanderRadius ?? 0,
          respawnSeconds: spawn.respawnSeconds ?? Infinity,
          fixed: true,
        });
      }
      for (const area of zone.spawnAreas ?? []) {
        const def = find(zone, area.monster);
        for (let i = 0; i < area.count; i++) {
          this.addPack(`${area.id}_${i}`, def, byId, {
            x: area.x,
            z: area.z,
            radius: area.radius,
            wanderRadius: def.groupSize ? PACK_WANDER : area.radius * AREA_WANDER_FRACTION,
            respawnSeconds: area.respawnSeconds,
            fixed: false,
          });
        }
      }
    }
    for (const pack of this.packs) this.spawnPack(pack);
  }

  /** Number of monsters fighting the player right now (debug). */
  get engagedCount(): number {
    let n = 0;
    for (let i = 0; i < this.shown.length; i++) if ((this.shown[i] as Enemy).engaged) n++;
    return n;
  }

  /** The nearest living monster that is shown, or null (debug). */
  nearest(x: number, z: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD2 = Infinity;
    for (let i = 0; i < this.shown.length; i++) {
      const e = this.shown[i] as Enemy;
      if (!e.alive) continue;
      const d2 = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d2 < bestD2) {
        best = e;
        bestD2 = d2;
      }
    }
    return best;
  }

  /** Number of monsters in the world (alive or lying down). */
  get activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.list.length; i++) if ((this.list[i] as Enemy).active) n++;
    return n;
  }

  /**
   * One fixed step: which enemies are shown, their AI (near the player), pushing apart, ground
   * height and respawns. `target` is the player (radius, and whether monsters may attack).
   */
  step(dt: number, target: EnemyTarget, world: EnemiesWorld): void {
    this.world = world;
    const px = target.x;
    const pz = target.z;
    const show2 = this.ranges.showRadius ** 2;
    const hide2 = (this.ranges.showRadius + this.ranges.hideMargin) ** 2;
    const sim2 = this.simulateRadius ** 2;
    this.shown.length = 0;
    this.moving.length = 0;
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
      if (!e.shown) {
        e.shown = true;
        e.y = world.heightAt(e.x, e.z);
        e.settleY();
      }
      this.shown.push(e);
      e.beginStep();
      e.sinceHit += dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      if (e.wobble > 0) e.wobble = Math.max(0, e.wobble - dt);
      e.safe = this.inSafeArea(e);
      if (e.def.behavior === 'static') {
        this.stepDummy(e, dt);
      } else if (d2 <= sim2) {
        stepEnemyAi(e, e.speed, this.ai, target, world, dt);
        if (e.alive) this.moving.push(e);
      } else if (e.engaged || e.mode === 'return') {
        // Left far behind (no collision out here): back home, healed.
        this.sendHome(e);
      }
      e.y = world.heightAt(e.x, e.z);
    }
    this.separate(target);
    this.stepPacks(dt, px, pz);
  }

  /**
   * Deals damage to an enemy. Returns true when this hit defeated it. A hit monster fights
   * back (with its pack); a defeated Big Slime splits.
   */
  hit(e: Enemy, damage: number): boolean {
    if (!e.alive) return false;
    e.hp = Math.max(0, e.hp - damage);
    e.sinceHit = 0;
    e.flash = FLASH_SECONDS;
    e.wobble = WOBBLE_SECONDS;
    if (e.def.behavior === 'static') {
      if (e.hp > 0) return false;
      e.downTime = e.def.resetSeconds ?? DEFAULT_RESET_SECONDS;
      return true;
    }
    if (e.hp > 0) {
      if (e.mode === 'return') e.mode = 'chase';
      engage(e);
      this.alert(e);
      return false;
    }
    defeat(e, this.ai);
    this.split(e);
    return true;
  }

  /** `e` noticed the player: its pack mates nearby join in. */
  alert(e: Enemy): void {
    const pack = this.packOf.get(e);
    if (!pack) return;
    const r2 = this.packAggroRadius * this.packAggroRadius;
    for (let i = 0; i < pack.members.length; i++) {
      const m = pack.members[i] as Enemy;
      if (m === e || !m.alive || m.engaged) continue;
      const dx = m.x - e.x;
      const dz = m.z - e.z;
      if (dx * dx + dz * dz <= r2) engage(m);
    }
  }

  /** Pushes a walking circle out of every shown, standing enemy (you cannot walk through). */
  pushOut(p: PointXZ, radius: number): boolean {
    let moved = false;
    for (let i = 0; i < this.shown.length; i++) {
      const e = this.shown[i] as Enemy;
      if (!e.alive) continue;
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

  /**
   * Everyone back at full strength (after the player was knocked out): packs at their spots,
   * calm, split slimes gone, dummies standing.
   */
  resetAll(): void {
    for (const pack of this.packs) this.spawnPack(pack);
  }

  private addPack(
    id: string,
    def: MonsterDef,
    byId: ReadonlyMap<string, MonsterDef>,
    where: Pick<Pack, 'x' | 'z' | 'radius' | 'wanderRadius' | 'respawnSeconds' | 'fixed'>,
  ): void {
    const seed = hashSeed(...Array.from(id, (c) => c.charCodeAt(0)));
    const size = def.groupSize?.max ?? 1;
    const pack: Pack = {
      ...where,
      def,
      members: [],
      children: [],
      timer: 0,
      rng: new Random(seed),
    };
    const childDef = def.splitsInto ? byId.get(def.splitsInto.monster) : undefined;
    for (let i = 0; i < size; i++) {
      pack.members.push(this.addEnemy(`${id}_${i}`, def, pack, seed + i));
      if (!childDef || !def.splitsInto) continue;
      for (let c = 0; c < def.splitsInto.count; c++) {
        const child = this.addEnemy(
          `${id}_${i}_split${c}`,
          childDef,
          pack,
          seed + 100 + i * 10 + c,
        );
        child.active = false;
        pack.children.push(child);
      }
    }
    this.packs.push(pack);
  }

  private addEnemy(id: string, def: MonsterDef, pack: Pack, seed: number): Enemy {
    const e = new Enemy(id, def, pack.x, pack.z, seed, pack.wanderRadius);
    e.speed = this.speeds[def.speed] ?? DEFAULT_SPEED;
    e.pack = this.packs.length;
    this.list.push(e);
    this.packOf.set(e, pack);
    return e;
  }

  /**
   * Puts a pack (back) in the world: a new spot in its area (fixed spots stay), a rolled pack
   * size, members around the spot.
   */
  private spawnPack(pack: Pack): void {
    const rng = pack.rng;
    let cx = pack.x;
    let cz = pack.z;
    if (!pack.fixed) {
      const angle = rng.next() * Math.PI * 2;
      // Keep the whole pack (and its roaming) inside the area.
      const r = Math.sqrt(rng.next()) * Math.max(0, pack.radius - pack.wanderRadius * 0.5);
      cx += Math.sin(angle) * r;
      cz += Math.cos(angle) * r;
    }
    const group = pack.def.groupSize;
    const count = group ? rng.int(group.min, group.max) : 1;
    for (let i = 0; i < pack.members.length; i++) {
      const e = pack.members[i] as Enemy;
      if (i >= count) {
        e.active = false;
        continue;
      }
      let x = cx;
      let z = cz;
      if (pack.members.length > 1) {
        const a = rng.next() * Math.PI * 2;
        x += Math.sin(a) * PACK_SPREAD * rng.next();
        z += Math.cos(a) * PACK_SPREAD * rng.next();
      }
      e.homeX = x;
      e.homeZ = z;
      e.spawn(x, z, pack.fixed ? 0 : rng.next() * Math.PI * 2);
      e.timer = rng.next() * this.ai.wanderPauseMax;
      if (this.world) {
        e.y = this.world.heightAt(x, z);
        e.settleY();
      }
    }
    for (const child of pack.children) child.active = false;
    pack.timer = 0;
  }

  /** Respawns: a pack whose monsters are all gone comes back after its time, out of sight. */
  private stepPacks(dt: number, px: number, pz: number): void {
    for (let i = 0; i < this.packs.length; i++) {
      const pack = this.packs[i] as Pack;
      if (pack.def.behavior === 'static' || !Number.isFinite(pack.respawnSeconds)) continue;
      if (anyActive(pack.members) || anyActive(pack.children)) {
        pack.timer = pack.respawnSeconds;
        continue;
      }
      pack.timer -= dt;
      if (pack.timer > 0) continue;
      const dx = pack.x - px;
      const dz = pack.z - pz;
      const away = pack.radius + this.respawnDistance;
      if (dx * dx + dz * dz < away * away) continue;
      this.spawnPack(pack);
    }
  }

  /** A dying Big Slime becomes two Green Slimes that go straight for the player. */
  private split(e: Enemy): void {
    const pack = this.packOf.get(e);
    const split = e.def.splitsInto;
    if (!pack || !split) return;
    let made = 0;
    for (let i = 0; i < pack.children.length && made < split.count; i++) {
      const child = pack.children[i] as Enemy;
      if (child.active) continue;
      const side = made % 2 === 0 ? 1 : -1;
      const offset = SPLIT_OFFSET * (1 + Math.floor(made / 2));
      const x = e.x + Math.cos(e.heading) * offset * side;
      const z = e.z - Math.sin(e.heading) * offset * side;
      child.homeX = e.homeX;
      child.homeZ = e.homeZ;
      child.wanderRadius = e.wanderRadius;
      child.spawn(x, z, e.heading);
      child.y = e.y;
      child.settleY();
      engage(child);
      made++;
    }
  }

  /** Far away from the player: straight home, healed and calm. */
  private sendHome(e: Enemy): void {
    e.x = e.homeX;
    e.z = e.homeZ;
    e.hp = e.maxHp;
    e.mode = 'idle';
    e.timer = this.ai.wanderPauseMin;
    e.attackCount = 0;
  }

  /** Monsters do not stand inside each other, nor inside the player. */
  private separate(target: EnemyTarget): void {
    const list = this.moving;
    for (let i = 0; i < list.length; i++) {
      const a = list[i] as Enemy;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j] as Enemy;
        const min = a.radius + b.radius;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * SEPARATION * 0.5;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
      const min = a.radius + target.radius;
      const dx = a.x - target.x;
      const dz = a.z - target.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      a.x = target.x + (dx / d) * min;
      a.z = target.z + (dz / d) * min;
    }
  }

  private inSafeArea(e: Enemy): boolean {
    const ids = e.def.safeAreas;
    if (!ids) return false;
    for (let i = 0; i < ids.length; i++) {
      const shape = this.safeAreas.get(ids[i] as string);
      if (shape && pointInShape(shape, e.x, e.z)) return true;
    }
    return false;
  }

  /** Training dummy: after a pause without hits (or after falling over) it is whole again. */
  private stepDummy(e: Enemy, dt: number): void {
    const reset = e.def.resetSeconds ?? DEFAULT_RESET_SECONDS;
    if (e.hp <= 0) {
      e.downTime = Math.max(0, e.downTime - dt);
      if (e.downTime === 0) e.hp = e.maxHp;
    } else if (e.hp < e.maxHp && e.sinceHit >= reset) {
      e.hp = e.maxHp;
    }
  }
}

function anyActive(list: readonly Enemy[]): boolean {
  for (let i = 0; i < list.length; i++) if ((list[i] as Enemy).active) return true;
  return false;
}
