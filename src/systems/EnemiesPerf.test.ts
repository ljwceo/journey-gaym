import { describe, expect, it } from 'vitest';
import { monstersFileSchema, zonesFileSchema } from '../data/schemas';
import type { MonstersFile } from '../data/types';
import { readPublicJson } from '../test/loadPublic';
import type { PointXZ } from '../world/Colliders';
import { Enemies, type EnemiesWorld } from './Enemies';
import type { EnemyTarget } from './EnemyAI';
import { Projectiles } from './Projectiles';

const DT = 1 / 60;
const zones = zonesFileSchema.parse(readPublicJson('data/zones.json'));
const monsters = monstersFileSchema.parse(readPublicJson('data/monsters.json')) as MonstersFile;

/**
 * Performance check (step 2.7): the cost of all monsters on the fixed step where most of them
 * fight the player at once. Budget: one fixed step must stay far below a frame (8.3 ms at
 * 120 fps); the monsters get a small part of it.
 */
describe('enemy simulation cost', () => {
  it('stays well under a millisecond per step at the busiest spot', () => {
    const enemies = new Enemies(zones.zones, monsters, { showRadius: 160, hideMargin: 20 });
    // The busiest spot: where the most monsters stand within the fighting distance.
    const sim = monsters.settings.simulateRadius;
    let best = { x: 0, z: 0, count: 0 };
    for (const e of enemies.list) {
      if (!e.active) continue;
      let count = 0;
      for (const o of enemies.list) {
        if (o.active && Math.hypot(o.x - e.x, o.z - e.z) <= sim) count++;
      }
      if (count > best.count) best = { x: e.x, z: e.z, count };
    }
    const projectiles = new Projectiles();
    let hits = 0;
    const target: EnemyTarget = { x: best.x, z: best.z, radius: 0.4, hostile: true };
    const world: EnemiesWorld = {
      mover: {
        moveCircle: (p: PointXZ, _r: number, dx: number, dz: number) => ((p.x += dx), (p.z += dz)),
      },
      heightAt: () => 0,
      hitPlayer: () => hits++,
      shoot: (e, tx, tz, speed, damage) => projectiles.fire(e.x, 1, e.z, tx, tz, speed, damage, 12),
      alert: (e) => enemies.alert(e),
      bossEvent: () => {},
    };
    // Warm up (JIT), then measure 20 s of fighting.
    for (let i = 0; i < 300; i++) enemies.step(DT, target, world);
    const steps = 1200;
    let worst = 0;
    const start = performance.now();
    for (let i = 0; i < steps; i++) {
      const t0 = performance.now();
      // The player circles around so everyone keeps chasing.
      target.x = best.x + Math.sin(i * 0.01) * 6;
      target.z = best.z + Math.cos(i * 0.01) * 6;
      enemies.step(DT, target, world);
      projectiles.step(DT, target, { heightAt: () => 0, blocked: () => false }, () => hits++);
      worst = Math.max(worst, performance.now() - t0);
    }
    const avg = (performance.now() - start) / steps;
    console.log(
      `${best.count} monsters within ${sim} m, ${enemies.engagedCount} fighting: ` +
        `avg ${avg.toFixed(3)} ms / step, worst ${worst.toFixed(3)} ms, ${hits} hits on the player`,
    );
    expect(enemies.engagedCount).toBeGreaterThan(5);
    expect(avg).toBeLessThan(0.5);
  });

  it('stays cheap with every monster of the world fighting you at once (stress test)', () => {
    const enemies = new Enemies(zones.zones, monsters, { showRadius: 160, hideMargin: 20 });
    // Everyone (except dummies and bosses) is moved within 25 m of the player.
    let n = 0;
    for (const e of enemies.list) {
      if (!e.active || e.boss || e.def.behavior === 'static') continue;
      const angle = n * 2.4;
      const r = 5 + (n % 5) * 4;
      e.homeX = Math.sin(angle) * r;
      e.homeZ = Math.cos(angle) * r;
      e.spawn(e.homeX, e.homeZ, 0);
      n++;
    }
    const projectiles = new Projectiles();
    const target: EnemyTarget = { x: 0, z: 0, radius: 0.4, hostile: true };
    const world: EnemiesWorld = {
      mover: {
        moveCircle: (p: PointXZ, _r: number, dx: number, dz: number) => ((p.x += dx), (p.z += dz)),
      },
      heightAt: () => 0,
      hitPlayer: () => {},
      shoot: (e, tx, tz, speed, damage) => projectiles.fire(e.x, 1, e.z, tx, tz, speed, damage, 12),
      alert: (e) => enemies.alert(e),
      bossEvent: () => {},
    };
    for (let i = 0; i < 300; i++) enemies.step(DT, target, world);
    const steps = 1200;
    const start = performance.now();
    for (let i = 0; i < steps; i++) {
      target.x = Math.sin(i * 0.01) * 6;
      target.z = Math.cos(i * 0.01) * 6;
      enemies.step(DT, target, world);
      projectiles.step(DT, target, { heightAt: () => 0, blocked: () => false }, () => {});
    }
    const avg = (performance.now() - start) / steps;
    console.log(
      `stress: ${n} monsters around you, ${enemies.engagedCount} fighting, ` +
        `${projectiles.activeCount} arrows: avg ${avg.toFixed(3)} ms / step`,
    );
    expect(enemies.engagedCount).toBeGreaterThan(20);
    expect(avg).toBeLessThan(1);
  });
});
