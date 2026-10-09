import { describe, expect, it } from 'vitest';
import { zonesFileSchema } from '../data/schemas';
import { hasPropModel } from '../entities/PropFactory';
import { colorTokens } from '../render/palette';
import { readPublicJson } from '../test/loadPublic';
import { buildChunkMesh, buildFarMesh, gridHeight } from './ChunkMesh';
import { fbm2, noise2 } from './Noise';
import { PROP_STRIDE, scatterChunk } from './Scatter';
import { buildWorldGenConfig } from './terrainConfig';
import { TerrainField } from './TerrainField';

const zones = zonesFileSchema.parse(readPublicJson('data/zones.json'));
const color = (token: string): number => colorTokens.get(token) ?? 0;
const config = buildWorldGenConfig(zones, color, 1);
const field = new TerrainField(config.terrain);

describe('Noise', () => {
  it('is deterministic and stays in range', () => {
    for (let i = 0; i < 500; i++) {
      const x = i * 7.31 - 900;
      const z = i * 3.17 + 50;
      expect(noise2(42, x, z)).toBe(noise2(42, x, z));
      expect(Math.abs(fbm2(42, x, z, 100, 5))).toBeLessThanOrEqual(1.01);
    }
    expect(noise2(1, 10.5, 3.25)).not.toBe(noise2(2, 10.5, 3.25));
  });

  it('is continuous (no jumps between lattice cells)', () => {
    for (let x = -5; x < 5; x += 0.01) {
      expect(Math.abs(noise2(7, x + 0.001, 0.37) - noise2(7, x, 0.37))).toBeLessThan(0.01);
    }
  });
});

describe('TerrainField', () => {
  it('blends smoothly across zone borders (no steps)', () => {
    // Greyhaven (x < -1500) meets the Greenwood / Mournfen at x = -1500.
    for (let z = -300; z <= 300; z += 50) {
      for (let x = -1520; x < -1480; x += 0.5) {
        expect(Math.abs(field.heightAt(x + 0.5, z) - field.heightAt(x, z))).toBeLessThan(0.6);
      }
    }
  });

  it('uses each zone’s own height away from borders', () => {
    const fen = zones.zones.find((zone) => zone.id === 'mournfen');
    if (!fen) throw new Error('mournfen missing');
    const h = field.heightAt(-1100, 800);
    expect(h).toBeGreaterThanOrEqual(fen.terrain.baseHeight - 0.01);
    expect(h).toBeLessThanOrEqual(fen.terrain.baseHeight + fen.terrain.amplitude + 0.01);
  });

  it('sinks into the sea at the world edge (the coast of Greyhaven)', () => {
    expect(field.heightAt(-2000, 0)).toBeCloseTo(zones.world.terrain.seaFloor, 5);
    expect(field.heightAt(-1700, 0)).toBeGreaterThan(zones.world.terrain.seaLevel);
  });
});

describe('ChunkMesh', () => {
  const size = config.chunkSize;
  const mesh = buildChunkMesh(field, -27, -2, size, 16, 4);

  it('stands exactly on the drawn triangles', () => {
    const n = mesh.segments;
    const step = size / n;
    // At grid vertices gridHeight returns the vertex height.
    for (const [i, j] of [
      [0, 0],
      [3, 7],
      [n, n],
    ] as const) {
      expect(gridHeight(mesh.heights, n, size, i * step, j * step)).toBeCloseTo(
        mesh.heights[j * (n + 1) + i] as number,
        5,
      );
    }
    // Between vertices it stays within the heights of the cell corners.
    const h = gridHeight(mesh.heights, n, size, 2.3 * step, 5.6 * step);
    const corners = [
      mesh.heights[5 * (n + 1) + 2],
      mesh.heights[5 * (n + 1) + 3],
      mesh.heights[6 * (n + 1) + 2],
      mesh.heights[6 * (n + 1) + 3],
    ] as number[];
    expect(h).toBeGreaterThanOrEqual(Math.min(...corners) - 1e-6);
    expect(h).toBeLessThanOrEqual(Math.max(...corners) + 1e-6);
  });

  it('matches the terrain function closely', () => {
    const x = 10.3;
    const z = 41.9;
    const drawn = gridHeight(mesh.heights, mesh.segments, size, x, z);
    expect(Math.abs(drawn - field.heightAt(-27 * size + x, -2 * size + z))).toBeLessThan(0.3);
  });

  it('has normals pointing up and front faces facing up', () => {
    const p = mesh.positions;
    const i = mesh.index;
    const a = (i[0] as number) * 3;
    const b = (i[1] as number) * 3;
    const c = (i[2] as number) * 3;
    // Face normal of triangle (a, b, c): (b - a) × (c - a); its y must be positive.
    const ux = (p[b] as number) - (p[a] as number);
    const uz = (p[b + 2] as number) - (p[a + 2] as number);
    const vx = (p[c] as number) - (p[a] as number);
    const vz = (p[c + 2] as number) - (p[a + 2] as number);
    expect(uz * vx - ux * vz).toBeGreaterThan(0);
    for (let v = 0; v < mesh.heights.length; v++) {
      expect(mesh.normals[v * 3 + 1] as number).toBeGreaterThan(0.2);
    }
  });

  it('builds a far map that stays under the detailed ground', () => {
    const far = buildFarMesh(field, 64, 0);
    for (let v = 0; v < far.positions.length / 3; v += 37) {
      const x = far.originX + (far.positions[v * 3] as number);
      const z = far.originZ + (far.positions[v * 3 + 2] as number);
      expect(far.positions[v * 3 + 1] as number).toBeLessThan(field.heightAt(x, z));
    }
  });
});

describe('Scatter', () => {
  it('places the same props every time, only on dry, gentle ground', () => {
    // A chunk in the Greenwood (dense trees).
    const a = scatterChunk(field, config.scatter, -16, -10, config.chunkSize);
    const b = scatterChunk(field, config.scatter, -16, -10, config.chunkSize);
    expect(a).toEqual(b);
    const trees = a[config.scatter.props.indexOf('tree')] as Float32Array;
    expect(trees.length / PROP_STRIDE).toBeGreaterThan(5);
    for (let i = 0; i < trees.length; i += PROP_STRIDE) {
      expect(trees[i + 1] as number).toBeGreaterThanOrEqual(config.scatter.minHeight);
      expect(trees[i] as number).toBeGreaterThanOrEqual(0);
      expect(trees[i] as number).toBeLessThanOrEqual(config.chunkSize);
    }
  });

  it('keeps spawn points and checkpoints clear', () => {
    const cp = zones.zones.find((zone) => zone.id === 'greenwood')?.checkpoint;
    if (!cp) throw new Error('greenwood checkpoint missing');
    const size = config.chunkSize;
    const cx = Math.floor(cp.x / size);
    const cz = Math.floor(cp.z / size);
    const props = scatterChunk(field, config.scatter, cx, cz, size);
    for (const list of props) {
      for (let i = 0; i < list.length; i += PROP_STRIDE) {
        const x = cx * size + (list[i] as number);
        const z = cz * size + (list[i + 2] as number);
        expect(Math.hypot(x - cp.x, z - cp.z)).toBeGreaterThanOrEqual(
          zones.world.terrain.clearingRadius,
        );
      }
    }
  });

  it('follows the quality density', () => {
    const half = buildWorldGenConfig(zones, color, 0.5);
    const count = (lists: Float32Array[]) => lists.reduce((sum, list) => sum + list.length, 0);
    const full = count(scatterChunk(field, config.scatter, -16, -10, config.chunkSize));
    const less = count(scatterChunk(field, half.scatter, -16, -10, config.chunkSize));
    expect(less).toBeLessThan(full * 0.75);
  });

  it('has a placeholder model for every prop in zones.json', () => {
    for (const prop of zones.world.props) expect(hasPropModel(prop.model)).toBe(true);
  });
});
