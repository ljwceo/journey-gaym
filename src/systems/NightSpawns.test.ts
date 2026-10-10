import { describe, expect, it } from 'vitest';
import { monstersFileSchema, zonesFileSchema } from '../data/schemas';
import type { Zone } from '../data/types';
import { readPublicJson } from '../test/loadPublic';
import { pointInShape } from '../world/Shapes';
import { Enemies, type EnemiesWorld, type SpawnWorld } from './Enemies';
import type { EnemyTarget } from './EnemyAI';

const DT = 1 / 60;
const zonesFile = zonesFileSchema.parse(readPublicJson('data/zones.json'));
const monsters = monstersFileSchema.parse(readPublicJson('data/monsters.json'));
const ranges = { showRadius: 160, hideMargin: 20 };
const rules = zonesFile.world.nightSpawning;

/** A small test zone: a field with a spawn area, and a village (safe zone) in its middle. */
const field: Zone = {
  ...(zonesFile.zones[0] as Zone),
  id: 'test_field',
  scene: undefined,
  spawns: [],
  spawnAreas: [],
  safeZones: [{ id: 'village', shape: { type: 'circle', x: 0, z: 0, radius: 30 } }],
  nightSpawns: [
    {
      id: 'field_slimes',
      shape: { type: 'rect', minX: -100, minZ: -100, maxX: 100, maxZ: 100 },
      monsters: [{ monster: 'green_slime', weight: 1 }],
      maxAlive: 5,
      levelRange: [1, 2],
      respawnSeconds: 10,
    },
  ],
};

function world(spawning: boolean, testAreas = false): SpawnWorld {
  return { spawning, testAreas, heightAt: () => 0, canStand: () => true };
}

/** Flat ground without walls; the player is calm (monsters do not attack). */
const flat: EnemiesWorld = {
  mover: {
    moveCircle(p, _radius, dx, dz) {
      p.x += dx;
      p.z += dz;
    },
  },
  heightAt: () => 0,
  hitPlayer: () => {},
  shoot: () => {},
  alert: () => {},
  bossEvent: () => {},
};

function make(zones: Zone[]): Enemies {
  return new Enemies(zones, monsters, ranges, new Map(), rules, 1);
}

function run(enemies: Enemies, seconds: number, w: SpawnWorld, px = 0, pz = 0): void {
  const target: EnemyTarget = { x: px, z: pz, radius: 0.4, hostile: false };
  for (let i = 0; i < seconds * 60; i++) {
    enemies.stepSpawning(DT, px, pz, w);
    enemies.step(DT, target, flat);
  }
}

describe('night spawning', () => {
  it('spawns nothing by day', () => {
    const enemies = make([field]);
    run(enemies, 60, world(false));
    expect(enemies.nightAlive).toBe(0);
  });

  it('fills up to maxAlive at dusk and at night, never in a safe zone, not too close or far', () => {
    const enemies = make([field]);
    run(enemies, 60, world(true), 0, 0);
    expect(enemies.nightAlive).toBe(5);
    for (const e of enemies.list) {
      if (!e.active) continue;
      expect(pointInShape({ type: 'circle', x: 0, z: 0, radius: 30 }, e.x, e.z)).toBe(false);
      const d = Math.hypot(e.x, e.z);
      // Wandering may take them a little closer or further than where they appeared.
      expect(d).toBeGreaterThan(rules.minPlayerDistance - rules.wanderRadius - 1);
      expect(d).toBeLessThan(rules.maxPlayerDistance + rules.wanderRadius + 1);
    }
  });

  it('keeps monsters that are already there when the day comes (open question)', () => {
    const enemies = make([field]);
    run(enemies, 60, world(true));
    run(enemies, 60, world(false));
    expect(enemies.nightAlive).toBe(5);
  });

  it('a defeated monster disappears and its place fills again after respawnSeconds', () => {
    const enemies = make([field]);
    run(enemies, 60, world(true));
    const victim = enemies.list.find((e) => e.active);
    if (!victim) throw new Error('no monster');
    enemies.hit(victim, 1000);
    expect(enemies.nightAlive).toBe(4);
    run(enemies, monsters.settings.corpseSeconds + 1, world(false));
    expect(victim.active).toBe(false);
    run(enemies, 30, world(true));
    expect(enemies.nightAlive).toBe(5);
  });

  it('uses test-only areas only in debug mode', () => {
    const test: Zone = {
      ...field,
      nightSpawns: field.nightSpawns?.map((area) => ({ ...area, testOnly: true })),
    };
    const off = make([test]);
    run(off, 30, world(true, false));
    expect(off.nightAlive).toBe(0);
    const on = make([test]);
    run(on, 30, world(true, true));
    expect(on.nightAlive).toBeGreaterThan(0);
  });

  it('never spawns where a monster cannot stand (water, off the map)', () => {
    const enemies = make([field]);
    run(enemies, 60, { ...world(true), canStand: () => false });
    expect(enemies.nightAlive).toBe(0);
  });

  it('the real data: Greyhaven inside its walls is safe, the test fields outside are not', () => {
    const greyhaven = zonesFile.zones.find((zone) => zone.id === 'greyhaven');
    const enemies = make(zonesFile.zones);
    const monastery = greyhaven?.spawnPoints[0];
    const area = greyhaven?.nightSpawns?.[0];
    if (!monastery || !area || area.shape.type !== 'rect') throw new Error('data changed');
    expect(enemies.inSafeZone(monastery.x, monastery.z)).toBe(true);
    const cx = (area.shape.minX + area.shape.maxX) / 2;
    const cz = (area.shape.minZ + area.shape.maxZ) / 2;
    expect(enemies.inSafeZone(cx, cz)).toBe(false);
    expect(area.testOnly).toBe(true);
  });
});
