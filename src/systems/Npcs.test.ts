import { describe, expect, it } from 'vitest';
import { npcsFileSchema, triggersFileSchema, zonesFileSchema } from '../data/schemas';
import type { NpcsFile } from '../data/types';
import { Companion } from '../entities/Companion';
import { dialogueLines, isAttackable } from '../entities/Npc';
import { hasNpcModel } from '../entities/NpcFactory';
import { readPublicJson } from '../test/loadPublic';
import type { PointXZ } from '../world/Colliders';
import { Random } from '../core/Random';
import type { Mover } from './Movement';
import { turnTowards, Wander, walkTowards } from './NpcBehavior';
import { type NpcWorld, Npcs } from './Npcs';

const DT = 1 / 60;

/** Moves freely (no walls). */
const free: Mover = {
  moveCircle(p: PointXZ, _radius: number, dx: number, dz: number) {
    p.x += dx;
    p.z += dz;
  },
};

/** A wall at x = 5: nothing gets past it. */
const wall: Mover = {
  moveCircle(p: PointXZ, _radius: number, dx: number, dz: number) {
    p.x = Math.min(5, p.x + dx);
    p.z += dz;
  },
};

const flatWorld: NpcWorld = { mover: free, heightAt: () => 2, resolve: () => {} };

function npcsFile(): NpcsFile {
  return npcsFileSchema.parse(readPublicJson('data/npcs.json'));
}

describe('walkTowards / turnTowards', () => {
  it('walks at speed per second, the same at 60 and 120 Hz, without overshooting', () => {
    const a = { x: 0, z: 0, heading: 0 };
    const b = { x: 0, z: 0, heading: 0 };
    for (let i = 0; i < 60; i++) walkTowards(a, 10, 0, 2, DT, free, 0.3, 10);
    for (let i = 0; i < 120; i++) walkTowards(b, 10, 0, 2, DT / 2, free, 0.3, 10);
    expect(a.x).toBeCloseTo(2, 6);
    expect(b.x).toBeCloseTo(2, 6);
    for (let i = 0; i < 1000; i++) walkTowards(a, 10, 0, 2, DT, free, 0.3, 10);
    expect(a.x).toBeCloseTo(10, 6);
    // Faces the walking direction (+x = heading 90°).
    expect(a.heading).toBeCloseTo(Math.PI / 2, 3);
  });

  it('turns the short way and never further than allowed', () => {
    expect(turnTowards(0, 0.1, 1)).toBeCloseTo(0.1);
    expect(turnTowards(0, 2, 0.5)).toBeCloseTo(0.5);
    // From 170° to -170°: the short way is +20°, across ±180°.
    const h = turnTowards((170 * Math.PI) / 180, (-170 * Math.PI) / 180, 0.1);
    expect(Math.abs(h)).toBeGreaterThan((170 * Math.PI) / 180);
  });
});

describe('Wander', () => {
  const cfg = {
    homeX: 0,
    homeZ: 0,
    radius: 20,
    speed: 1,
    pauseMin: 0.5,
    pauseMax: 1,
    turnSpeed: 5,
    bodyRadius: 1,
  };

  it('stays within its radius and walks the same way every time (seeded)', () => {
    const run = () => {
      const wander = new Wander(cfg, new Random(42));
      const s = { x: 0, z: 0, heading: 0 };
      let maxDistance = 0;
      for (let i = 0; i < 60 * 120; i++) {
        wander.step(s, DT, free);
        maxDistance = Math.max(maxDistance, Math.hypot(s.x, s.z));
      }
      return { s, maxDistance };
    };
    const first = run();
    const second = run();
    expect(first.maxDistance).toBeLessThanOrEqual(cfg.radius + 1e-6);
    expect(first.maxDistance).toBeGreaterThan(1);
    expect(second.s).toEqual(first.s);
  });

  it('gives up a walk that is blocked', () => {
    const wander = new Wander({ ...cfg, homeX: 5 }, new Random(7));
    const s = { x: 5, z: 0, heading: 0 };
    let walkTime = 0;
    let longest = 0;
    for (let i = 0; i < 60 * 120; i++) {
      wander.step(s, DT, wall);
      walkTime = wander.walking ? walkTime + DT : 0;
      longest = Math.max(longest, walkTime);
    }
    expect(s.x).toBeLessThanOrEqual(5);
    // The longest possible free walk is 40 m at 1 m/s; blocked walks end much sooner.
    expect(longest).toBeLessThan(41);
  });
});

describe('Companion (Pringle)', () => {
  const cfg = { distance: 1.8, speed: 4.5, teleportDistance: 30, turnSpeed: 6, bodyRadius: 0.25 };

  it('catches up with a walking player and stops beside them', () => {
    const cat = new Companion(cfg);
    const s = { x: 0, z: 0, heading: 0 };
    cat.placeBehind(s, 0, 0, 0);
    // The player walks 4 m/s along +z for 5 s.
    for (let i = 0; i < 300; i++) cat.step(s, 0, (i + 1) * 4 * DT, 0, DT, free);
    const playerZ = 20;
    expect(playerZ - s.z).toBeLessThan(cfg.distance + 1);
    // The player stops: the cat settles at about `distance`.
    for (let i = 0; i < 120; i++) cat.step(s, 0, playerZ, 0, DT, free);
    expect(Math.hypot(s.x, playerZ - s.z)).toBeCloseTo(cfg.distance, 1);
    expect(cat.walking).toBe(false);
  });

  it('jumps behind the player after a teleport', () => {
    const cat = new Companion(cfg);
    const s = { x: 0, z: 0, heading: 0 };
    expect(cat.step(s, 500, 500, Math.PI / 2, DT, free)).toBe('teleport');
    // Heading 90° faces +x: the cat lands `distance` away, behind (x < 500), off to the side.
    expect(Math.hypot(s.x - 500, s.z - 500)).toBeCloseTo(cfg.distance);
    expect(s.x).toBeLessThan(500);
    expect(Math.abs(s.z - 500)).toBeGreaterThan(0.5);
  });

  it('jumps to the player when stuck behind a wall far away', () => {
    const cat = new Companion(cfg);
    const s = { x: 0, z: 0, heading: 0 };
    let result = 'walk';
    for (let i = 0; i < 60 * 5 && result !== 'teleport'; i++) {
      result = cat.step(s, 20, 0, 0, DT, wall);
    }
    expect(result).toBe('teleport');
  });
});

describe('Npcs', () => {
  it('shows NPCs near the player only, with a margin before hiding', () => {
    const npcs = new Npcs(npcsFile(), 'summer', () => 0xffffff);
    const ansel = npcs.byId('brother_ansel');
    const treewarden = npcs.byId('treewarden_1');
    if (!ansel || !treewarden) throw new Error('missing NPCs');
    const { x, z } = ansel.def.position;
    npcs.update(DT, x + 5, z, 0, flatWorld, null);
    expect(ansel.shown).toBe(true);
    expect(ansel.state.y).toBe(2);
    expect(treewarden.shown).toBe(false);
    const { showRadius, hideMargin } = npcs.settings;
    npcs.update(DT, x + showRadius + hideMargin / 2, z, 0, flatWorld, null);
    expect(ansel.shown).toBe(true);
    npcs.update(DT, x + showRadius + hideMargin + 1, z, 0, flatWorld, null);
    expect(ansel.shown).toBe(false);
  });

  it('keeps the companion with the player everywhere', () => {
    const npcs = new Npcs(npcsFile(), 'summer', () => 0xffffff);
    const pringle = npcs.byId('pringle');
    npcs.update(DT, -1000, -600, 0, flatWorld, null);
    expect(pringle?.shown).toBe(true);
    expect(Math.hypot((pringle?.state.x ?? 0) + 1000, (pringle?.state.z ?? 0) + 600)).toBeLessThan(
      3,
    );
  });

  it('turns a static NPC towards a player who comes close', () => {
    const npcs = new Npcs(npcsFile(), 'summer', () => 0xffffff);
    const marco = npcs.byId('marco');
    if (!marco) throw new Error('missing Marco');
    const { x, z } = marco.def.position;
    // Player 2 m east of Marco: Marco should end up facing +x (90°).
    for (let i = 0; i < 120; i++) npcs.update(DT, x + 2, z, 0, flatWorld, null);
    expect(marco.state.heading).toBeCloseTo(Math.PI / 2, 3);
    // Player gone: back to the home heading.
    for (let i = 0; i < 120; i++) npcs.update(DT, x + 50, z, 0, flatWorld, null);
    expect(marco.state.heading).toBeCloseTo(marco.homeHeading, 3);
  });

  it('pushes the player out of solid NPCs but not out of Pringle', () => {
    const npcs = new Npcs(npcsFile(), 'summer', () => 0xffffff);
    const ansel = npcs.byId('brother_ansel');
    const pringle = npcs.byId('pringle');
    if (!ansel || !pringle) throw new Error('missing NPCs');
    const { x, z } = ansel.def.position;
    npcs.update(DT, x + 1, z, 0, flatWorld, null);
    const p = { x: x + 0.3, z };
    expect(npcs.pushOut(p, 0.4)).toBe(true);
    expect(p.x - x).toBeCloseTo(0.4 + ansel.solidRadius);
    const q = { x: pringle.state.x, z: pringle.state.z };
    expect(npcs.pushOut(q, 0.4)).toBe(false);
  });

  it('finds the nearest NPC you can talk to, never a Treewarden', () => {
    const npcs = new Npcs(npcsFile(), 'summer', () => 0xffffff);
    const hilda = npcs.byId('hilda');
    if (!hilda) throw new Error('missing Hilda');
    const { x, z } = hilda.def.position;
    npcs.update(DT, x + 1, z, 0, flatWorld, null);
    expect(npcs.nearestInteractable(x + 1, z)?.id).toBe('hilda');
    expect(npcs.nearestInteractable(x + 20, z)?.id).not.toBe('hilda');

    const warden = npcs.byId('treewarden_2');
    if (!warden) throw new Error('missing Treewarden');
    const w = warden.def.position;
    npcs.update(DT, w.x + 1, w.z, 0, flatWorld, null);
    // Pringle sits at its follow distance, outside the (smaller) pet range.
    expect(npcs.nearestInteractable(w.x + 1, w.z)).toBeNull();
    const pringle = npcs.byId('pringle');
    if (!pringle) throw new Error('missing Pringle');
    expect(npcs.nearestInteractable(pringle.state.x + 0.8, pringle.state.z)?.id).toBe('pringle');
  });

  it('leaves out NPCs of another season', () => {
    const file = npcsFile();
    const base = file.npcs[0];
    if (!base) throw new Error('no NPCs');
    file.npcs.push({ ...base, id: 'spring_only', season: 'spring' });
    expect(new Npcs(file, 'summer', () => 0).byId('spring_only')).toBeUndefined();
    expect(new Npcs(file, 'spring', () => 0).byId('spring_only')).toBeDefined();
  });
});

describe('NPC data', () => {
  it('uses only placeholder models the factory can build', () => {
    for (const role of npcsFile().roles) expect(hasNpcModel(role.model), role.model).toBe(true);
  });

  it('picks conditional dialogue (Master Brink from level 5)', () => {
    const conditions = triggersFileSchema.parse(readPublicJson('data/triggers.json')).conditions;
    const brink = npcsFile().npcs.find((npc) => npc.id === 'master_brink');
    if (!brink) throw new Error('missing Master Brink');
    const low = { level: 1, completedQuests: new Set<string>() };
    const high = { level: 5, completedQuests: new Set<string>() };
    expect(dialogueLines(brink, conditions, low)).toEqual(brink.dialogue);
    expect(dialogueLines(brink, conditions, high)).toEqual(['npc.master_brink.ready']);
  });

  it('never makes Treewardens attackable in the elven city', () => {
    const zones = zonesFileSchema.parse(readPublicJson('data/zones.json'));
    const areas = new Map(
      zones.zones.flatMap((zone) => zone.areas.map((area) => [area.id, area.shape] as const)),
    );
    const warden = npcsFile().npcs.find((npc) => npc.id === 'treewarden_1');
    const ansel = npcsFile().npcs.find((npc) => npc.id === 'brother_ansel');
    if (!warden || !ansel) throw new Error('missing NPCs');
    const city = areas.get('elven_city');
    if (city?.type !== 'circle') throw new Error('elven_city should be a circle');
    expect(isAttackable(warden, city.x, city.z, areas)).toBe(false);
    expect(isAttackable(warden, city.x + city.radius + 50, city.z, areas)).toBe(true);
    // Not a monster: never.
    expect(isAttackable(ansel, 0, 0, areas)).toBe(false);
  });
});
