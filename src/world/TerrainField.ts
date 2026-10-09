import type { Shape } from '../data/types';
import { Noise2D } from './Noise';
import { type Box, emptyBox, pointInShape, shapeBounds } from './Shapes';

/**
 * Everything the terrain needs, as plain numbers and arrays: built once from zones.json on the
 * main thread (TerrainSpec.ts) and sent to the terrain worker as-is.
 */
export interface TerrainSpec {
  seed: number;
  worldBounds: Box;
  chunkSize: number;
  blendWidth: number;
  seaLevel: number;
  seaFloor: number;
  deepWaterDepth: number;
  skirtDepth: number;
  /** Linear RGB of the ground outside every zone (sea floor). */
  outsideColor: [number, number, number];
  zones: TerrainZoneSpec[];
  props: PropSpec[];
}

export interface TerrainZoneSpec {
  id: string;
  priority: number;
  bounds: Shape;
  baseHeight: number;
  amplitude: number;
  scale: number;
  /** Linear RGB of the zone's ground. */
  color: [number, number, number];
  /** Props per chunk, by index into `TerrainSpec.props` (0 = none). */
  scatter: number[];
  /** Shapes in which nothing is scattered. */
  exclude: Shape[];
}

export interface PropSpec {
  id: string;
  colliderRadius: number;
  scaleMin: number;
  scaleMax: number;
  maxPerChunk: number;
  minHeightAboveSea: number;
  decor: boolean;
}

/** Octaves of hill noise and of the small color variation. */
const HEIGHT_OCTAVES = 5;
const COLOR_OCTAVES = 2;
/** Size (m) of the color blotches on the ground. */
const COLOR_SCALE = 23;
/** Water deeper than this (m) shows the full sea-floor color. */
const UNDERWATER_FADE = 4;

/**
 * The height and color of the ground anywhere in the world, as a pure function of (x, z).
 *
 * Every zone has its own hills (base height + noise). Near zone edges the zones blend over
 * `blendWidth` meters, so walking from one zone into the next never shows a step or a seam.
 * Outside all zones lies the sea floor, so the edge of the world becomes a coast.
 * A zone with a higher priority (the Black Citadel inside Morvath) covers lower ones.
 *
 * Deterministic and allocation-free: the worker builds meshes with it, and the simulation uses
 * the same function for walking (slopes, water), so gameplay never depends on the mesh detail.
 */
export class TerrainField {
  readonly spec: TerrainSpec;
  private readonly noise: Noise2D;
  /** Zone indices sorted by priority (highest first) and where each priority group ends. */
  private readonly order: number[];
  private readonly groupEnds: number[];
  /** Per-zone bounding boxes grown by half the blend width (cheap rejection). */
  private readonly reach: Box[];
  /** Scratch: blend weight per zone and its final share of the ground. */
  private readonly weights: Float64Array;
  private readonly shares: Float64Array;
  private seaShare = 0;

  /** Color of the last `sample` call (linear RGB). */
  r = 0;
  g = 0;
  b = 0;

  constructor(spec: TerrainSpec) {
    this.spec = spec;
    this.noise = new Noise2D(spec.seed);
    const count = spec.zones.length;
    this.weights = new Float64Array(count);
    this.shares = new Float64Array(count);
    this.order = spec.zones
      .map((_, i) => i)
      .sort((a, b) => (spec.zones[b]?.priority ?? 0) - (spec.zones[a]?.priority ?? 0));
    this.groupEnds = [];
    for (let i = 1; i <= this.order.length; i++) {
      const prev = spec.zones[this.order[i - 1] as number];
      const next = i < this.order.length ? spec.zones[this.order[i] as number] : undefined;
      if (!next || next.priority !== prev?.priority) this.groupEnds.push(i);
    }
    const half = spec.blendWidth / 2;
    this.reach = spec.zones.map((zone) => {
      const box = shapeBounds(zone.bounds, emptyBox());
      return {
        minX: box.minX - half,
        minZ: box.minZ - half,
        maxX: box.maxX + half,
        maxZ: box.maxZ + half,
      };
    });
  }

  /** Ground height (m) at (x, z). */
  heightAt(x: number, z: number): number {
    this.blend(x, z);
    let height = this.seaShare * this.spec.seaFloor;
    const zones = this.spec.zones;
    for (let i = 0; i < zones.length; i++) {
      const share = this.shares[i] as number;
      if (share > 0) height += share * this.zoneHeight(zones[i] as TerrainZoneSpec, x, z);
    }
    return height;
  }

  /** Height at (x, z) (returned) and its ground color (in `r`, `g`, `b`). */
  sample(x: number, z: number): number {
    const height = this.heightAt(x, z);
    const outside = this.spec.outsideColor;
    let r = this.seaShare * outside[0];
    let g = this.seaShare * outside[1];
    let b = this.seaShare * outside[2];
    const zones = this.spec.zones;
    for (let i = 0; i < zones.length; i++) {
      const share = this.shares[i] as number;
      if (share <= 0) continue;
      const color = (zones[i] as TerrainZoneSpec).color;
      r += share * color[0];
      g += share * color[1];
      b += share * color[2];
    }
    // Soft blotches so the ground is not one flat color.
    const shade = 0.88 + 0.24 * this.noise.fbm(x / COLOR_SCALE, z / COLOR_SCALE, COLOR_OCTAVES);
    r *= shade;
    g *= shade;
    b *= shade;
    // Under water the ground fades into the sea-floor color.
    const depth = this.spec.seaLevel - height;
    if (depth > 0) {
      const t = depth >= UNDERWATER_FADE ? 1 : depth / UNDERWATER_FADE;
      r += (outside[0] - r) * t;
      g += (outside[1] - g) * t;
      b += (outside[2] - b) * t;
    }
    this.r = r;
    this.g = g;
    this.b = b;
    return height;
  }

  /** True where the water is too deep to walk. */
  isDeepWater(height: number): boolean {
    return height < this.spec.seaLevel - this.spec.deepWaterDepth;
  }

  /**
   * Index of the zone (x, z) belongs to: the highest-priority zone containing it, the first one
   * listed on a tie. -1 outside every zone.
   */
  zoneIndexAt(x: number, z: number): number {
    let best = -1;
    let bestPriority = -Infinity;
    const zones = this.spec.zones;
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i] as TerrainZoneSpec;
      if (zone.priority > bestPriority && pointInShape(zone.bounds, x, z)) {
        best = i;
        bestPriority = zone.priority;
      }
    }
    return best;
  }

  private zoneHeight(zone: TerrainZoneSpec, x: number, z: number): number {
    const n = this.noise.fbm(x / zone.scale, z / zone.scale, HEIGHT_OCTAVES);
    return zone.baseHeight + zone.amplitude * n;
  }

  /**
   * Fills `shares` (each zone's part of the ground at x, z) and `seaShare`, which add up to 1.
   * Zones of the same priority share the ground by their weights; a higher-priority group
   * takes its part first and the rest goes to the lower groups and finally the sea.
   */
  private blend(x: number, z: number): void {
    const zones = this.spec.zones;
    const blend = this.spec.blendWidth;
    for (let i = 0; i < zones.length; i++) {
      this.shares[i] = 0;
      const r = this.reach[i] as Box;
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) {
        this.weights[i] = 0;
        continue;
      }
      const d = signedDistance((zones[i] as TerrainZoneSpec).bounds, x, z);
      this.weights[i] = smoothstep(d / blend + 0.5);
    }
    let remaining = 1;
    let start = 0;
    for (const end of this.groupEnds) {
      let sum = 0;
      for (let k = start; k < end; k++) sum += this.weights[this.order[k] as number] as number;
      if (sum > 0) {
        const cover = sum < 1 ? sum : 1;
        const scale = (remaining * cover) / sum;
        for (let k = start; k < end; k++) {
          const i = this.order[k] as number;
          this.shares[i] = (this.weights[i] as number) * scale;
        }
        remaining *= 1 - cover;
      }
      start = end;
    }
    this.seaShare = remaining;
  }
}

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Distance from (x, z) to the edge of a shape: positive inside, negative outside. */
export function signedDistance(shape: Shape, x: number, z: number): number {
  switch (shape.type) {
    case 'circle': {
      const dx = x - shape.x;
      const dz = z - shape.z;
      return shape.radius - Math.sqrt(dx * dx + dz * dz);
    }
    case 'rect': {
      const inX = Math.min(x - shape.minX, shape.maxX - x);
      const inZ = Math.min(z - shape.minZ, shape.maxZ - z);
      if (inX >= 0 && inZ >= 0) return Math.min(inX, inZ);
      const ox = inX < 0 ? -inX : 0;
      const oz = inZ < 0 ? -inZ : 0;
      return -Math.sqrt(ox * ox + oz * oz);
    }
    case 'polygon': {
      const points = shape.points;
      let best = Infinity;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [ax, az] = points[j] as [number, number];
        const [bx, bz] = points[i] as [number, number];
        const ex = bx - ax;
        const ez = bz - az;
        const lengthSq = ex * ex + ez * ez;
        let t = lengthSq > 0 ? ((x - ax) * ex + (z - az) * ez) / lengthSq : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (ax + ex * t);
        const dz = z - (az + ez * t);
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      const distance = Math.sqrt(best);
      return pointInShape(shape, x, z) ? distance : -distance;
    }
  }
}
