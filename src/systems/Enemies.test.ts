import { describe, expect, it } from 'vitest';
import { monstersFileSchema, zonesFileSchema } from '../data/schemas';
import type { MonstersFile, Zone } from '../data/types';
import type { Enemy } from '../entities/Enemy';
import { hasEnemyModel } from '../entities/EnemyFactory';
import { readPublicJson } from '../test/loadPublic';
import type { PointXZ } from '../world/Colliders';
import { Enemies, type EnemiesWorld } from './Enemies';
import type { EnemyTarget } from './EnemyAI';
import type { Mover } from './Movement';
import { Projectiles } from './Projectiles';

const DT = 1 / 60;
const zones = zonesFileSchema.parse(readPublicJson('data/zones.json'));
const monsters = monstersFileSchema.parse(readPublicJson('data/monsters.json')) as MonstersFile;
const RANGES = { showRadius: 160, hideMargin: 20 };

const free: Mover = {
  moveCircle(p: PointXZ, _radius: number, dx: number, dz: number) {
    p.x += dx;
    p.z += dz;
  },
};

function def(id: string) {
  const found = monsters.monsters.find((m) => m.id === id);
  if (!found) throw new Error(`missing monster ${id}`);
  return found;
}

/** A test zone (copy of the Greenwood) with only the given monsters in it. */
function zoneWith(
  spawns: Zone['spawns'],
  spawnAreas: Zone['spawnAreas'] = [],
  areas: Zone['areas'] = [],
): Zone[] {
  const base = zones.zones.find((zone) => zone.id === 'greenwood');
  if (!base) throw new Error('missing greenwood');
  return [{ ...base, spawns, spawnAreas, areas }];
}

/** A small world around the enemies: flat ground, records hits on the player, real arrows. */
class Arena {
  readonly enemies: Enemies;
  readonly projectiles = new Projectiles();
  readonly target: EnemyTarget = { x: 0, z: 0, radius: 0.4, hostile: true };
  hits: number[] = [];
  readonly world: EnemiesWorld;

  constructor(list: Zone[], safeAreas = new Map()) {
    this.enemies = new Enemies(list, monsters, RANGES, safeAreas);
    const projectiles = this.projectiles;
    this.world = {
      mover: free,
      heightAt: () => 0,
      hitPlayer: (_e, damage) => this.hits.push(damage),
      shoot: (e, tx, tz, speed, damage) =>
        projectiles.fire(e.x, 1.1, e.z, tx, tz, speed, damage, e.def.ai?.attack.range ?? 12),
      alert: (e) => this.enemies.alert(e),
    };
  }

  /** Runs `seconds` of fixed steps (the player can move in `each`). */
  run(seconds: number, dt = DT, each?: (t: number) => void): void {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      each?.(i * dt);
      this.enemies.step(dt, this.target, this.world);
      this.projectiles.step(
        dt,
        this.target,
        { heightAt: () => 0, blocked: () => false },
        (damage) => this.hits.push(damage),
      );
    }
  }

  get(id: string): Enemy {
    const e = this.enemies.list.find((entry) => entry.id === id);
    if (!e) throw new Error(`missing enemy ${id}`);
    return e;
  }

  at(x: number, z: number): void {
    this.target.x = x;
    this.target.z = z;
  }
}

/** One monster at (x, z), roaming nowhere (wanderRadius 0). */
function single(monster: string, x = 0, z = 0, extra: object = {}): Zone['spawns'] {
  return [{ id: 'm', monster, x, z, wanderRadius: 0, respawnSeconds: 20, ...extra }];
}

describe('Enemies: data', () => {
  it('every monster model exists in the placeholder factory', () => {
    for (const m of monsters.monsters) {
      if (m.model) expect(hasEnemyModel(m.model), m.model).toBe(true);
    }
  });

  it('the Greenwood has slimes, goblins in packs of 2–3, archers, a chief and Treewardens', () => {
    const enemies = new Enemies(zones.zones, monsters, RANGES);
    const count = (id: string): number =>
      enemies.list.filter((e) => e.def.id === id && e.active).length;
    expect(count('green_slime')).toBeGreaterThanOrEqual(5);
    expect(count('big_slime')).toBeGreaterThanOrEqual(1);
    expect(count('goblin')).toBeGreaterThanOrEqual(4);
    expect(count('goblin_archer')).toBeGreaterThanOrEqual(2);
    expect(count('goblin_chief')).toBe(1);
    expect(count('treewarden')).toBe(10);
    // Goblin packs: 2 or 3 goblins, standing together.
    const packs = new Map<number, Enemy[]>();
    for (const e of enemies.list) {
      if (e.def.id !== 'goblin' || !e.active) continue;
      packs.set(e.pack, [...(packs.get(e.pack) ?? []), e]);
    }
    for (const pack of packs.values()) {
      expect(pack.length).toBeGreaterThanOrEqual(2);
      expect(pack.length).toBeLessThanOrEqual(3);
      const [a, b] = pack as [Enemy, Enemy];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(8);
    }
  });

  it('no monster spawns inside the elven city or near the Greenwood entrance', () => {
    const greenwood = zones.zones.find((zone) => zone.id === 'greenwood');
    const city = greenwood?.areas.find((area) => area.id === 'elven_city')?.shape;
    const entrance = greenwood?.spawnPoints[0];
    if (city?.type !== 'circle' || !entrance) throw new Error('missing city or entrance');
    for (const area of greenwood?.spawnAreas ?? []) {
      const toCity = Math.hypot(area.x - city.x, area.z - city.z);
      expect(toCity, area.id).toBeGreaterThan(city.radius + area.radius);
      expect(Math.hypot(area.x - entrance.x, area.z - entrance.z), area.id).toBeGreaterThan(60);
    }
  });
});

describe('Enemies: training dummies', () => {
  it('a dummy falls at 0 HP and stands up again with full HP', () => {
    const arena = new Arena(zoneWith(single('training_dummy')));
    const dummy = arena.get('m_0');
    arena.at(0, 3);
    arena.run(DT);
    expect(arena.enemies.shown).toContain(dummy);
    expect(arena.enemies.hit(dummy, dummy.maxHp - 1)).toBe(false);
    expect(arena.enemies.hit(dummy, 5)).toBe(true);
    expect(dummy.alive).toBe(false);
    arena.run(4);
    expect(dummy.alive).toBe(true);
    expect(dummy.hp).toBe(dummy.maxHp);
    expect(arena.hits).toEqual([]);
  });

  it('only near enemies are shown, the same on every graphics preset', () => {
    const arena = new Arena(zones.zones);
    arena.at(100_000, 100_000);
    arena.run(DT);
    expect(arena.enemies.shown).toHaveLength(0);
  });

  it('you cannot walk through a monster', () => {
    const arena = new Arena(zoneWith(single('training_dummy')));
    const dummy = arena.get('m_0');
    arena.at(0, 3);
    arena.run(DT);
    const p = { x: dummy.x + 0.1, z: dummy.z };
    expect(arena.enemies.pushOut(p, 0.4)).toBe(true);
    expect(Math.hypot(p.x - dummy.x, p.z - dummy.z)).toBeCloseTo(0.4 + dummy.radius);
  });
});

describe('Enemies: AI', () => {
  it('a slime notices you, hops over and jumps at you for 5 damage', () => {
    const arena = new Arena(zoneWith(single('green_slime')));
    const slime = arena.get('m_0');
    const aggro = def('green_slime').ai?.aggroRadius ?? 0;
    // Outside its aggro radius: nothing happens.
    arena.at(aggro + 2, 0);
    arena.run(3);
    expect(slime.engaged).toBe(false);
    arena.at(aggro - 1, 0);
    arena.run(6);
    expect(arena.hits.length).toBeGreaterThan(0);
    expect(arena.hits.every((damage) => damage === 5)).toBe(true);
  });

  it('a slime attacks just as often at 60 and 120 Hz', () => {
    const counts = [DT, DT / 2].map((dt) => {
      const arena = new Arena(zoneWith(single('green_slime')));
      arena.at(3, 0);
      arena.run(12, dt);
      return arena.hits.length;
    });
    expect(counts[0]).toBeGreaterThan(3);
    expect(Math.abs((counts[0] ?? 0) - (counts[1] ?? 0))).toBeLessThanOrEqual(1);
  });

  it('you can dodge a goblin by stepping away during its windup', () => {
    const arena = new Arena(zoneWith(single('goblin')));
    const goblin = arena.get('m_0');
    arena.at(1.5, 0);
    // Wait for the windup, then step back out of reach.
    for (let i = 0; i < 600 && goblin.mode !== 'windup'; i++) arena.run(DT);
    expect(goblin.mode).toBe('windup');
    arena.at(goblin.x + 5, goblin.z);
    arena.run(goblin.timer + DT);
    expect(arena.hits).toEqual([]);
    // Standing still, it hits (8 damage).
    arena.at(goblin.x + 1.2, goblin.z);
    arena.run(4);
    expect(arena.hits).toContain(8);
  });

  it('gives up when you run far from its home, walks back and heals', () => {
    const arena = new Arena(zoneWith(single('goblin')));
    const goblin = arena.get('m_0');
    arena.at(3, 0);
    arena.run(DT);
    arena.enemies.hit(goblin, 20);
    expect(goblin.engaged).toBe(true);
    const leash = def('goblin').ai?.leashRadius ?? 30;
    // Run away faster than the goblin, far beyond its leash (but within 60 m).
    arena.run(12, DT, (t) => arena.at(3 + t * 5, 0));
    expect(goblin.engaged).toBe(false);
    arena.run(20);
    expect(Math.hypot(goblin.x - goblin.homeX, goblin.z - goblin.homeZ)).toBeLessThan(1);
    expect(goblin.hp).toBe(goblin.maxHp);
    expect(leash).toBeLessThan(60);
  });

  it('hitting one goblin brings its whole pack', () => {
    const arena = new Arena(
      zoneWith(
        [],
        [{ id: 'g', monster: 'goblin', x: 0, z: 0, radius: 3, count: 1, respawnSeconds: 30 }],
      ),
    );
    const pack = arena.enemies.list.filter((e) => e.active);
    expect(pack.length).toBeGreaterThanOrEqual(2);
    arena.at(30, 0);
    arena.run(DT);
    arena.enemies.hit(pack[0] as Enemy, 1);
    for (const e of pack) expect(e.engaged).toBe(true);
  });

  it('a Big Slime splits into two Green Slimes; the pack respawns once you are away', () => {
    const arena = new Arena(zoneWith(single('big_slime')));
    const big = arena.get('m_0');
    arena.at(5, 0);
    arena.run(DT);
    expect(arena.enemies.hit(big, big.maxHp)).toBe(true);
    const children = arena.enemies.list.filter((e) => e.active && e.def.id === 'green_slime');
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.engaged).toBe(true);
      arena.enemies.hit(child, child.maxHp);
    }
    // All gone after lying down a moment; nearby, nothing comes back.
    arena.run(25);
    expect(big.active).toBe(false);
    // Far away (but the respawn time is over): the Big Slime is back, whole.
    arena.at(500, 0);
    arena.run(DT);
    expect(big.active).toBe(true);
    expect(big.hp).toBe(big.maxHp);
  });

  it('an archer keeps its distance and shoots arrows you can sidestep', () => {
    const arena = new Arena(zoneWith(single('goblin_archer')));
    const archer = arena.get('m_0');
    arena.at(4, 0);
    arena.run(3);
    // Stepped back to (about) its keep distance, and arrows hit a player who stands still.
    expect(Math.hypot(archer.x - 4, archer.z)).toBeGreaterThan(4.5);
    arena.run(6);
    expect(arena.hits).toContain(12);
    // A player who keeps moving sideways is (almost) never hit.
    arena.hits = [];
    arena.run(10, DT, (t) => arena.at(archer.x + 9, archer.z + Math.sin(t * 2) * 6));
    expect(arena.hits.length).toBeLessThanOrEqual(1);
  });

  it('the Goblin Chief warns before every third attack: a big swing all around him', () => {
    const arena = new Arena(zoneWith(single('goblin_chief')));
    const chief = arena.get('m_0');
    arena.at(2.5, 0);
    const kinds: string[] = [];
    let last = '';
    arena.run(15, DT, () => {
      const now = chief.mode === 'windup' ? chief.attackKind : '';
      if (now && now !== last) kinds.push(now);
      last = now;
    });
    expect(kinds.slice(0, 3)).toEqual(['normal', 'normal', 'special']);
    expect(arena.hits).toContain(20);
  });

  it('a Treewarden only fights back, and never inside the elven city', () => {
    const city = { type: 'circle' as const, x: 100, z: 0, radius: 20 };
    const areas = new Map([['elven_city', city]]);
    const arena = new Arena(zoneWith(single('treewarden')), areas);
    const warden = arena.get('m_0');
    arena.at(3, 0);
    arena.run(5);
    expect(warden.engaged).toBe(false);
    expect(arena.hits).toEqual([]);
    arena.enemies.hit(warden, 10);
    arena.run(6);
    expect(arena.hits).toContain(40);

    // The same Treewarden standing in the elven city cannot be hit.
    const safe = new Arena(zoneWith(single('treewarden', 100, 0)), areas);
    safe.at(103, 0);
    safe.run(DT);
    expect(safe.get('m_0').hittable).toBe(false);
  });

  it('with monsters switched off (debug) nobody notices you', () => {
    const arena = new Arena(zoneWith(single('goblin')));
    arena.target.hostile = false;
    arena.at(2, 0);
    arena.run(5);
    expect(arena.get('m_0').engaged).toBe(false);
    expect(arena.hits).toEqual([]);
  });

  it('after being knocked out everything is back at full strength', () => {
    const arena = new Arena(zoneWith(single('big_slime')));
    const big = arena.get('m_0');
    arena.at(5, 0);
    arena.run(DT);
    arena.enemies.hit(big, big.maxHp);
    arena.enemies.resetAll();
    expect(big.alive).toBe(true);
    expect(big.engaged).toBe(false);
    expect(arena.enemies.list.filter((e) => e.def.id === 'green_slime' && e.active)).toEqual([]);
  });
});
