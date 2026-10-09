import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { validateGameData } from '../data/DataValidator';
import type { GameData } from '../data/types';
import { readAllData } from '../test/loadPublic';
import { NONE } from './ChunkPlanner';
import { World } from './World';

const data = validateGameData(readAllData()).data as GameData;
const preset = (id: string) => {
  const found = data.quality.presets.find((p) => p.id === id);
  if (!found) throw new Error(id);
  return found;
};

/** Without Web Workers (Node), chunks are built on the main thread: same results. */
function makeWorld(quality = 'low'): { world: World; problems: string[] } {
  const problems: string[] = [];
  const world = new World(new Scene(), data, preset(quality), (m) => problems.push(m));
  return { world, problems };
}

/** Runs frames until nothing is queued any more (or the limit). */
function settle(world: World, x: number, z: number, limit = 2000): void {
  for (let i = 0; i < limit; i++) {
    world.frame(x, z, 0, 0, 1 / 60, false);
    const s = world.streamer.stats({} as never);
    if (s.queued === 0 && s.inFlight === 0) return;
  }
}

describe('World', () => {
  it('starts with real ground and colliders around the player', () => {
    const { world, problems } = makeWorld();
    world.start(-1250, -400);
    expect(problems.some((p) => p.includes('main thread'))).toBe(true);
    const planner = world.streamer.planner;
    const here = planner.get(Math.floor(-1250 / 64), Math.floor(-400 / 64));
    expect(here?.shownLod).not.toBe(NONE);
    for (const record of planner.records) {
      if (record.used && record.active) expect(record.shownLod).not.toBe(NONE);
    }
    expect(world.currentZone).toBe('greenwood');
    world.dispose();
  });

  it('walks across the whole world and back without growing (memory stays flat)', () => {
    const { world } = makeWorld();
    const hash = world.collision.hash;
    world.start(-1900, -100);
    settle(world, -1900, -100);
    const capacity = world.streamer.planner.records.length;
    let maxGeometries = 0;
    let maxColliders = 0;
    const counts: number[] = [];
    for (let lap = 0; lap < 2; lap++) {
      for (let x = -1900; x <= 1900; x += 4) {
        world.frame(x, -100, 1, 0, 1 / 60, false);
        maxGeometries = Math.max(maxGeometries, world.streamer.geometryCount);
        maxColliders = Math.max(maxColliders, hash.size);
      }
      for (let x = 1900; x >= -1900; x -= 4) {
        world.frame(x, -100, -1, 0, 1 / 60, false);
        maxGeometries = Math.max(maxGeometries, world.streamer.geometryCount);
      }
      settle(world, -1900, -100);
      counts.push(world.streamer.geometryCount, hash.size);
    }
    // Two identical laps end in exactly the same state: nothing leaks.
    expect(counts[2]).toBe(counts[0]);
    expect(counts[3]).toBe(counts[1]);
    expect(maxGeometries).toBeLessThanOrEqual(capacity * 2);
    expect(world.streamer.planner.usedCount).toBeLessThanOrEqual(capacity);
    world.dispose();
    expect(hash.size).toBe(0);
    expect(maxColliders).toBeLessThan(2000);
  });

  it('keeps colliders only in the active ring', () => {
    const { world } = makeWorld();
    world.start(-1100, -500);
    settle(world, -1100, -500);
    const hash = world.collision.hash;
    expect(hash.size).toBeGreaterThan(0);
    const out: { x: number; z: number }[] = [];
    hash.query(-1100 - 500, -500 - 500, -1100 + 500, -500 + 500, out as never);
    const size = 64;
    const pcx = Math.floor(-1100 / size);
    const pcz = Math.floor(-500 / size);
    expect(out.length).toBe(hash.size);
    for (const c of out) {
      expect(Math.abs(Math.floor(c.x / size) - pcx)).toBeLessThanOrEqual(1);
      expect(Math.abs(Math.floor(c.z / size) - pcz)).toBeLessThanOrEqual(1);
    }
    world.dispose();
  });

  it('moves the floating origin on long walks and keeps meshes in place', () => {
    const { world } = makeWorld();
    world.start(-1900, 0);
    for (let x = -1900; x <= 0; x += 2) world.frame(x, 0, 1, 0, 1 / 60, false);
    settle(world, 0, 0);
    expect(world.origin.shifts).toBeGreaterThan(0);
    expect(Math.abs(world.origin.x)).toBeLessThanOrEqual(1000);
    for (const record of world.streamer.planner.records) {
      const position = world.streamer.meshPosition(record.index);
      if (!record.used || !position) continue;
      expect(position.x).toBe(record.cx * 64 - world.origin.x);
      expect(position.z).toBe(record.cz * 64 - world.origin.z);
    }
    world.dispose();
  });

  it('reports a new zone once when the player crosses a border', () => {
    const { world } = makeWorld();
    world.start(-1520, -100);
    const entered: string[] = [];
    for (let x = -1520; x <= -1460; x += 1) {
      const zone = world.trackZone(x, -100);
      if (zone) entered.push(zone);
    }
    expect(entered).toEqual(['greenwood']);
    world.dispose();
  });

  it('switches graphics presets without losing the ground', () => {
    const { world } = makeWorld('low');
    world.start(-1250, -400);
    world.setPreset(preset('high'), -1250, -400);
    const here = world.streamer.planner.get(Math.floor(-1250 / 64), Math.floor(-400 / 64));
    expect(here?.shownLod).not.toBe(NONE);
    settle(world, -1250, -400);
    expect(world.streamer.planner.usedCount).toBe(13 * 13);
    world.dispose();
  });
});
