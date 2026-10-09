import { describe, expect, it } from 'vitest';
import { validateGameData } from '../data/DataValidator';
import type { GameData } from '../data/types';
import { readAllData } from '../test/loadPublic';
import { ChunkBuilder, PROP_STRIDE, chunkIndices, chunkLayout } from './ChunkBuilder';
import { Noise2D } from './Noise';
import { TerrainField, type TerrainSpec, signedDistance } from './TerrainField';
import { buildTerrainSpec } from './TerrainSpec';

const data = validateGameData(readAllData()).data as GameData;
const spec = buildTerrainSpec(data);

/** A tiny two-zone world for exact checks. */
function testSpec(overrides: Partial<TerrainSpec> = {}): TerrainSpec {
  const zone = (id: string, minX: number, maxX: number, baseHeight: number) => ({
    id,
    priority: 0,
    bounds: { type: 'rect' as const, minX, minZ: -500, maxX, maxZ: 500 },
    baseHeight,
    amplitude: 0,
    scale: 100,
    color: [0.2, 0.4, 0.1] as [number, number, number],
    scatter: [10],
    exclude: [],
  });
  return {
    seed: 7,
    worldBounds: { minX: -500, minZ: -500, maxX: 500, maxZ: 500 },
    chunkSize: 64,
    blendWidth: 40,
    seaLevel: 0,
    seaFloor: -10,
    deepWaterDepth: 0.8,
    skirtDepth: 5,
    outsideColor: [0, 0, 0.3],
    zones: [zone('west', -500, 0, 10), zone('east', 0, 500, 20)],
    props: [
      {
        id: 'tree',
        colliderRadius: 0.3,
        scaleMin: 1,
        scaleMax: 1,
        maxPerChunk: 20,
        minHeightAboveSea: 0.5,
        decor: false,
      },
    ],
    ...overrides,
  };
}

describe('Noise2D', () => {
  it('is deterministic and stays in range', () => {
    const a = new Noise2D(1);
    const b = new Noise2D(1);
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 20;
      const z = i * 0.71 + 5;
      expect(a.fbm(x, z, 5)).toBe(b.fbm(x, z, 5));
      expect(a.fbm(x, z, 5)).toBeGreaterThanOrEqual(0);
      expect(a.fbm(x, z, 5)).toBeLessThanOrEqual(1);
    }
    expect(new Noise2D(2).fbm(3.3, 4.4, 5)).not.toBe(a.fbm(3.3, 4.4, 5));
  });

  it('is continuous (no jumps between neighboring points)', () => {
    const noise = new Noise2D(5);
    for (let i = 0; i < 1000; i++) {
      const x = i * 0.013;
      expect(Math.abs(noise.sample(x + 0.001, 2.5) - noise.sample(x, 2.5))).toBeLessThan(0.01);
    }
  });
});

describe('signedDistance', () => {
  it('is positive inside and negative outside', () => {
    const rect = { type: 'rect' as const, minX: 0, minZ: 0, maxX: 10, maxZ: 10 };
    expect(signedDistance(rect, 5, 5)).toBe(5);
    expect(signedDistance(rect, 1, 5)).toBe(1);
    expect(signedDistance(rect, -3, 5)).toBe(-3);
    expect(signedDistance(rect, 13, 14)).toBeCloseTo(-5);
    const circle = { type: 'circle' as const, x: 0, z: 0, radius: 4 };
    expect(signedDistance(circle, 1, 0)).toBe(3);
    expect(signedDistance(circle, 6, 0)).toBe(-2);
    const triangle = {
      type: 'polygon' as const,
      points: [
        [0, 0],
        [10, 0],
        [0, 10],
      ] as [number, number][],
    };
    expect(signedDistance(triangle, 1, 1)).toBeCloseTo(1);
    expect(signedDistance(triangle, -2, 5)).toBeCloseTo(-2);
  });
});

describe('TerrainField', () => {
  it('blends two zones smoothly over the blend width', () => {
    const field = new TerrainField(testSpec());
    expect(field.heightAt(-100, 0)).toBeCloseTo(10);
    expect(field.heightAt(100, 0)).toBeCloseTo(20);
    // Exactly on the border: halfway.
    expect(field.heightAt(0, 0)).toBeCloseTo(15);
    // Monotonic and without jumps across the blend.
    let previous = field.heightAt(-30, 0);
    for (let x = -29.5; x <= 30; x += 0.5) {
      const height = field.heightAt(x, 0);
      expect(height).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(height - previous).toBeLessThan(0.5);
      previous = height;
    }
  });

  it('turns into sea floor outside every zone', () => {
    const field = new TerrainField(testSpec());
    expect(field.heightAt(-480, 0)).toBeCloseTo(10);
    expect(field.heightAt(-500, 0)).toBeCloseTo(0); // half land (10), half sea floor (-10)
    expect(field.heightAt(-600, 0)).toBeCloseTo(-10);
    expect(field.isDeepWater(field.heightAt(-600, 0))).toBe(true);
    expect(field.isDeepWater(-0.5)).toBe(false);
  });

  it('lets a higher-priority zone cover a lower one', () => {
    const base = testSpec();
    const citadel = {
      ...(base.zones[1] as TerrainSpec['zones'][number]),
      id: 'citadel',
      priority: 1,
      bounds: { type: 'rect' as const, minX: 200, minZ: -100, maxX: 400, maxZ: 100 },
      baseHeight: 50,
    };
    const field = new TerrainField({ ...base, zones: [...base.zones, citadel] });
    expect(field.heightAt(300, 0)).toBeCloseTo(50);
    expect(field.heightAt(100, 0)).toBeCloseTo(20);
    expect(field.zoneIndexAt(300, 0)).toBe(2);
    expect(field.zoneIndexAt(100, 0)).toBe(1);
    expect(field.zoneIndexAt(-100, 0)).toBe(0);
    expect(field.zoneIndexAt(900, 0)).toBe(-1);
  });

  it('puts the spawn point in Greyhaven on dry land, inside the start zone', () => {
    const field = new TerrainField(spec);
    const greyhaven = data.zones.zones.find((zone) => zone.id === 'greyhaven');
    const bed = greyhaven?.spawnPoints[0];
    expect(bed).toBeDefined();
    if (!bed) return;
    expect(spec.zones[field.zoneIndexAt(bed.x, bed.z)]?.id).toBe('greyhaven');
    expect(field.heightAt(bed.x, bed.z)).toBeGreaterThan(spec.seaLevel + 1);
  });

  it('has dry land at every spawn point and checkpoint', () => {
    const field = new TerrainField(spec);
    for (const zone of data.zones.zones) {
      for (const point of [...zone.spawnPoints, ...(zone.checkpoint ? [zone.checkpoint] : [])]) {
        expect(field.isDeepWater(field.heightAt(point.x, point.z)), `${zone.id}/${point.id}`).toBe(
          false,
        );
      }
    }
  });
});

describe('chunkIndices', () => {
  it('makes every top triangle face up and every skirt triangle face outward', () => {
    const segments = 4;
    const layout = chunkLayout(segments, []);
    const field = new TerrainField(testSpec({ zones: [] }));
    const out = new Float32Array(layout.length);
    new ChunkBuilder(field).build(0, 0, layout, 1, out, []);
    const indices = chunkIndices(segments);
    const p = (v: number) =>
      [out[v * 3], out[v * 3 + 1], out[v * 3 + 2]] as [number, number, number];
    const center = 32;
    let skirts = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const a = p(indices[t] as number);
      const b = p(indices[t + 1] as number);
      const c = p(indices[t + 2] as number);
      const ux = b[0] - a[0];
      const uy = b[1] - a[1];
      const uz = b[2] - a[2];
      const vx = c[0] - a[0];
      const vy = c[1] - a[1];
      const vz = c[2] - a[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      if (Math.abs(ny) > 1e-6) {
        expect(ny).toBeGreaterThan(0);
      } else {
        skirts++;
        // Outward: the normal points away from the chunk center.
        const mx = (a[0] + b[0] + c[0]) / 3 - center;
        const mz = (a[2] + b[2] + c[2]) / 3 - center;
        expect(nx * mx + nz * mz).toBeGreaterThan(0);
      }
    }
    expect(skirts).toBe(4 * segments * 2);
  });
});

describe('ChunkBuilder', () => {
  const field = new TerrainField(spec);
  const maxPerChunk = spec.props.map((prop) => prop.maxPerChunk);

  function build(cx: number, cz: number, segments: number, density = 1) {
    const layout = chunkLayout(segments, maxPerChunk);
    const out = new Float32Array(layout.length);
    const counts = new Int32Array(spec.props.length);
    new ChunkBuilder(field).build(cx, cz, layout, density, out, counts);
    return { layout, out, counts };
  }

  it('is deterministic', () => {
    const a = build(-25, -3, 16);
    const b = build(-25, -3, 16);
    expect(Array.from(a.out)).toEqual(Array.from(b.out));
    expect(Array.from(a.counts)).toEqual(Array.from(b.counts));
  });

  it('matches neighboring chunks exactly along the shared edge (no seams)', () => {
    const left = build(-22, -4, 16);
    const right = build(-21, -4, 16);
    const side = 17;
    for (let j = 0; j < side; j++) {
      const l = (j * side + 16) * 3;
      const r = (j * side + 0) * 3;
      expect(left.out[l + 1]).toBe(right.out[r + 1]); // height
      expect(left.out[left.layout.normals + l]).toBeCloseTo(
        right.out[right.layout.normals + r] as number,
        6,
      );
      expect(left.out[left.layout.colors + l]).toBe(right.out[right.layout.colors + r]);
    }
  });

  it('places the same props with colliders on every graphics preset', () => {
    const full = build(-19, -10, 16, 1);
    const low = build(-19, -10, 8, 0.2);
    spec.props.forEach((prop, k) => {
      if (prop.decor) {
        expect(low.counts[k]).toBeLessThanOrEqual(full.counts[k] as number);
        return;
      }
      expect(low.counts[k]).toBe(full.counts[k]);
      const count = (full.counts[k] as number) * PROP_STRIDE;
      const a = full.out.subarray(full.layout.props[k], (full.layout.props[k] as number) + count);
      const b = low.out.subarray(low.layout.props[k], (low.layout.props[k] as number) + count);
      expect(Array.from(b)).toEqual(Array.from(a));
    });
  });

  it('fills the Greenwood with trees and keeps the city of Greyhaven free', () => {
    const tree = spec.props.findIndex((prop) => prop.id === 'tree');
    // A chunk in the middle of the Greenwood (x -1100, z -400).
    const forest = build(Math.floor(-1100 / 64), Math.floor(-400 / 64), 8);
    expect(forest.counts[tree]).toBeGreaterThan(20);
    // A chunk inside the city walls of Greyhaven.
    const city = build(Math.floor(-1760 / 64), Math.floor(-130 / 64), 8);
    expect(Array.from(city.counts)).toEqual(spec.props.map(() => 0));
  });
});
