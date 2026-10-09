import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { zonesFileSchema } from '../data/schemas';
import { PropLibrary } from '../entities/PropFactory';
import { colorTokens } from '../render/palette';
import { Cheats, stepFlying } from '../systems/Cheats';
import { CollisionWorld } from '../systems/Collision';
import { MoverState } from '../systems/Movement';
import { readPublicJson } from '../test/loadPublic';
import { buildChunkMesh } from './ChunkMesh';
import { chunkKey, loadPriority, ringDistance, wantedLod } from './ChunkPlanner';
import { boxColliderAt } from './Colliders';
import { FloatingOrigin } from './FloatingOrigin';
import { GroundedMover } from './GroundedMover';
import { scatterChunk } from './Scatter';
import { SpatialHash } from './SpatialHash';
import { buildWorldGenConfig } from './terrainConfig';
import { TerrainField } from './TerrainField';
import type { TerrainRequest, TerrainResponse } from './terrainProtocol';
import { WorldStreamer } from './WorldStreamer';

const rings = { active: 2, preload: 4, unload: 5 };

describe('ChunkPlanner', () => {
  it('gives full detail near, low detail further, nothing beyond the preload ring', () => {
    expect(wantedLod(0, null, rings)).toBe(0);
    expect(wantedLod(2, null, rings)).toBe(0);
    expect(wantedLod(3, null, rings)).toBe(1);
    expect(wantedLod(4, null, rings)).toBe(1);
    expect(wantedLod(5, null, rings)).toBe(null);
  });

  it('has hysteresis: loaded chunks keep their state one ring longer', () => {
    // Full detail stays one ring past the active ring.
    expect(wantedLod(3, 0, rings)).toBe(0);
    expect(wantedLod(4, 0, rings)).toBe(1);
    // A loaded chunk unloads only beyond the unload ring.
    expect(wantedLod(5, 1, rings)).toBe(1);
    expect(wantedLod(6, 1, rings)).toBe(null);
  });

  it('loads close chunks first, and ahead before behind', () => {
    expect(loadPriority(1, 0, 0, 0)).toBeLessThan(loadPriority(3, 0, 0, 0));
    expect(loadPriority(0, 2, 0, 1)).toBeLessThan(loadPriority(0, -2, 0, 1));
    expect(loadPriority(0, 0, 1, 0)).toBeLessThan(loadPriority(1, 0, 1, 0));
    expect(ringDistance(-3, 2)).toBe(3);
    expect(chunkKey(-1, 5)).not.toBe(chunkKey(5, -1));
  });
});

describe('FloatingOrigin', () => {
  it('shifts to the player only beyond the distance, snapped to the chunk grid', () => {
    const origin = new FloatingOrigin(1000, 64);
    expect(origin.update(900, 0)).toBe(false);
    expect(origin.update(1001, 0)).toBe(true);
    expect(origin.x).toBe(1024);
    expect(origin.z).toBe(0);
    expect(origin.update(1500, 0)).toBe(false);
    expect(origin.shifts).toBe(1);
  });
});

describe('GroundedMover', () => {
  const slope = { heightAt: (x: number) => Math.max(0, x) * 2 }; // 63° hill east of x = 0
  const water = { heightAt: (x: number) => 1 - 0.5 * x }; // deeper than 1 m east of x = 4
  const make = (ground: { heightAt(x: number, z: number): number }) =>
    new GroundedMover(new CollisionWorld(new SpatialHash(8)), ground, {
      maxRise: Math.tan((40 * Math.PI) / 180),
      minHeight: -1,
    });

  it('stops at slopes steeper than the limit but slides along them', () => {
    const p = { x: -2, z: 0 };
    make(slope).moveCircle(p, 0.4, 4, 3);
    expect(p.x).toBeLessThanOrEqual(0.01);
    expect(p.z).toBeCloseTo(3, 5);
  });

  it('blocks deep water and lets you walk out of it', () => {
    const p = { x: 0, z: 0 };
    make(water).moveCircle(p, 0.4, 8, 0);
    expect(p.x).toBeLessThanOrEqual(4.01);
    expect(p.x).toBeGreaterThan(3.5);
    const swimmer = { x: 8, z: 0 };
    make(water).moveCircle(swimmer, 0.4, -5, 0);
    expect(swimmer.x).toBeCloseTo(3, 5);
  });

  it('still collides with walls', () => {
    const hash = new SpatialHash(8);
    hash.insert(boxColliderAt(3, 0, 1, 10));
    const mover = new GroundedMover(
      new CollisionWorld(hash),
      { heightAt: () => 0 },
      {
        maxRise: 1,
        minHeight: -1,
      },
    );
    const p = { x: 0, z: 0 };
    mover.moveCircle(p, 0.4, 5, 0);
    expect(p.x).toBeCloseTo(2.1, 5);
  });
});

describe('Cheats: flying', () => {
  const ground = () => 2;
  const fly = () => {
    const s = new MoverState();
    s.y = 2;
    const dt = 1 / 60;
    // The simulation always steps at 60 Hz; rendering fps only changes how often it is drawn.
    const steps = Math.round(60 * 2);
    for (let i = 0; i < steps; i++)
      stepFlying(s, { x: 0, z: 1, dash: false }, 1, 100, dt, ground, null);
    return { s };
  };

  it('flies at speed per second, up and forward, never below the ground', () => {
    const { s } = fly();
    expect(s.z).toBeCloseTo(200, 5);
    expect(s.y).toBeCloseTo(202, 5);
    const low = new MoverState();
    stepFlying(low, { x: 0, z: 0, dash: false }, -1, 100, 1, ground, null);
    expect(low.y).toBe(2);
  });

  it('stays inside the world', () => {
    const s = new MoverState();
    stepFlying(s, { x: 1, z: 0, dash: false }, 0, 1000, 1, ground, {
      minX: -10,
      minZ: -10,
      maxX: 10,
      maxZ: 10,
    });
    expect(s.x).toBe(10);
  });

  it('starts switched off', () => {
    const cheats = new Cheats();
    expect(cheats.active).toBe(false);
    cheats.speed = 5;
    expect(cheats.active).toBe(true);
    cheats.reset();
    expect(cheats.active).toBe(false);
  });
});

/** Worker stand-in that builds chunks synchronously on the main thread. */
class FakeWorker {
  onmessage: ((event: MessageEvent<TerrainResponse>) => void) | null = null;
  private field: TerrainField | null = null;
  private config: ReturnType<typeof buildWorldGenConfig> | null = null;
  terminated = false;

  postMessage(message: TerrainRequest): void {
    if (message.type === 'init') {
      this.config = message.config;
      this.field = new TerrainField(message.config.terrain);
      return; // the far map is skipped in this test
    }
    const { field, config } = this;
    if (!field || !config) return;
    if (message.type === 'density') {
      config.scatter.density = message.density;
      return;
    }
    const mesh = buildChunkMesh(field, message.cx, message.cz, config.chunkSize, 4, 2);
    const props = message.props
      ? scatterChunk(field, config.scatter, message.cx, message.cz, config.chunkSize)
      : [];
    this.onmessage?.({
      data: {
        type: 'chunk',
        id: message.id,
        cx: message.cx,
        cz: message.cz,
        lod: message.lod,
        mesh,
        props,
        ms: 0,
      },
    } as MessageEvent<TerrainResponse>);
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('WorldStreamer', () => {
  const zones = zonesFileSchema.parse(readPublicJson('data/zones.json'));
  const config = buildWorldGenConfig(zones, (token) => colorTokens.get(token) ?? 0, 1);

  function setup() {
    const root = new Group();
    const hash = new SpatialHash(8);
    const worker = new FakeWorker();
    const props = new PropLibrary(zones.world.props.map((prop) => prop.model));
    const streamer = new WorldStreamer({
      config,
      field: new TerrainField(config.terrain),
      root,
      hash,
      props,
      propColliders: zones.world.props.map((prop) => prop.colliderRadius),
      rings: { active: 1, preload: 2, unload: 3 },
      collisionRing: 1,
      createWorker: () => worker as unknown as Worker,
    });
    const settle = (x: number, z: number) => {
      for (let i = 0; i < 200; i++) streamer.update(x, z, 0, 0);
    };
    return { root, hash, worker, props, streamer, settle };
  }

  it('loads the rings around the player with full detail in the middle', () => {
    const { streamer, settle } = setup();
    settle(-1250, -400);
    expect(streamer.nearReady).toBe(true);
    // 5 × 5 preload ring, 3 × 3 of them in full detail.
    expect(streamer.chunks.size).toBe(25);
    expect(streamer.list.filter((chunk) => chunk.lod === 0).length).toBe(9);
  });

  it('does not grow while walking back and forth (chunks really unload)', () => {
    const { streamer, root, hash, settle } = setup();
    const walk = () => {
      for (let x = -1250; x <= -900; x += 16) settle(x, -400);
      for (let x = -900; x >= -1250; x -= 16) settle(x, -400);
    };
    walk();
    const chunks = streamer.chunks.size;
    const objects = root.children.length;
    // Never more than the unload ring (7 × 7), and the same after many more rounds.
    expect(chunks).toBeLessThanOrEqual(49);
    for (let round = 0; round < 5; round++) walk();
    expect(streamer.chunks.size).toBe(chunks);
    expect(root.children.length).toBe(objects);
    const colliders = streamer.list.reduce((sum, chunk) => sum + chunk.colliders.length, 0);
    expect(hash.size).toBe(colliders);
  });

  it('gives colliders only to chunks in the collision ring, whatever the graphics preset', () => {
    const { streamer, hash, settle } = setup();
    // Walk deep into the Greenwood (many trees).
    settle(-1250, -600);
    const size = streamer.chunkSize;
    const cx0 = Math.floor(-1250 / size);
    const cz0 = Math.floor(-600 / size);
    for (const chunk of streamer.list) {
      const distance = ringDistance(chunk.cx - cx0, chunk.cz - cz0);
      if (distance <= 1) expect(chunk.solid).toBe(true);
      if (distance > 2) expect(chunk.colliders.length).toBe(0);
    }
    expect(hash.size).toBeGreaterThan(0);
  });

  it('follows the drawn ground where loaded and the terrain function elsewhere', () => {
    const { streamer, settle } = setup();
    const field = new TerrainField(config.terrain);
    expect(streamer.heightAt(0, 0)).toBeCloseTo(field.heightAt(0, 0), 5);
    settle(-1250, -400);
    expect(Math.abs(streamer.heightAt(-1250, -400) - field.heightAt(-1250, -400))).toBeLessThan(3);
  });

  it('releases everything on dispose', () => {
    const { streamer, root, hash, worker, settle } = setup();
    settle(-1250, -400);
    streamer.dispose();
    expect(root.children.length).toBe(0);
    expect(hash.size).toBe(0);
    expect(worker.terminated).toBe(true);
  });
});
