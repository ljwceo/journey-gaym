import { fbm2 } from './Noise';

/**
 * The height and color of the ground anywhere in the world, as a pure function of the data in
 * zones.json and the world seed. The terrain worker builds chunk meshes from it; the main thread
 * uses the same function for places that are not loaded yet (spawning, teleporting), so both
 * always agree.
 *
 * Every zone has a base height, a hill amplitude and a color. Near a border the values of the
 * neighboring zones blend over `blendWidth` meters, so there is never a step between zones.
 * Zones with a higher priority (the Black Citadel inside Morvath) are painted over the others.
 * Towards the world edge the ground sinks to the sea floor (the coast).
 */

/** One zone, reduced to what the terrain needs. Plain numbers: it is sent to the worker. */
export interface TerrainZone {
  id: string;
  priority: number;
  /** Bounding box (zones are rectangles for now; other shapes use their bounding box). */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  baseHeight: number;
  amplitude: number;
  /** Terrain color as 0xRRGGBB. */
  color: number;
}

export interface TerrainConfig {
  seed: number;
  /** World rectangle; outside it is sea. */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Height of the sea floor (below sea level). */
  seaFloor: number;
  /** Width (m) of the coast where the land sinks to the sea floor at the world edge. */
  coastWidth: number;
  /** Width (m) over which two zones blend at their border. */
  blendWidth: number;
  /** Wavelength (m) of the largest hills, and how many finer layers of detail are added. */
  wavelength: number;
  octaves: number;
  /** Color of the sea floor, 0xRRGGBB. */
  seaColor: number;
  zones: TerrainZone[];
}

/** Result of `TerrainField.sample` (reused; no allocation). */
export interface TerrainSample {
  height: number;
  /** Color channels 0–1. */
  r: number;
  g: number;
  b: number;
}

/** Brightness variation of the ground color (fraction), so slopes and fields are readable. */
const COLOR_VARIATION = 0.08;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class TerrainField {
  private readonly zones: TerrainZone[];
  /** Index in `zones` where each priority group starts (zones are sorted by priority). */
  private readonly groupStarts: number[] = [];
  private readonly seaR: number;
  private readonly seaG: number;
  private readonly seaB: number;
  private readonly scratch: TerrainSample = { height: 0, r: 0, g: 0, b: 0 };

  constructor(readonly config: TerrainConfig) {
    this.zones = [...config.zones].sort((a, b) => a.priority - b.priority);
    this.zones.forEach((zone, i) => {
      if (i === 0 || zone.priority !== this.zones[i - 1]?.priority) this.groupStarts.push(i);
    });
    this.groupStarts.push(this.zones.length);
    this.seaR = ((config.seaColor >> 16) & 255) / 255;
    this.seaG = ((config.seaColor >> 8) & 255) / 255;
    this.seaB = (config.seaColor & 255) / 255;
  }

  /** Ground height at (x, z). */
  heightAt(x: number, z: number): number {
    return this.sample(x, z, this.scratch).height;
  }

  /** Height and color at (x, z), written into `out`. Allocation-free. */
  sample(x: number, z: number, out: TerrainSample): TerrainSample {
    const cfg = this.config;
    const half = cfg.blendWidth / 2;
    // Start from the sea; each priority group is painted over what lies below it.
    let base = cfg.seaFloor;
    let amplitude = 0;
    let r = this.seaR;
    let g = this.seaG;
    let b = this.seaB;
    const starts = this.groupStarts;
    for (let group = 0; group < starts.length - 1; group++) {
      let weight = 0;
      let gBase = 0;
      let gAmp = 0;
      let gR = 0;
      let gG = 0;
      let gB = 0;
      for (let i = starts[group] as number; i < (starts[group + 1] as number); i++) {
        const zone = this.zones[i] as TerrainZone;
        // Signed distance into the zone rectangle (negative outside).
        const inside = Math.min(x - zone.minX, zone.maxX - x, z - zone.minZ, zone.maxZ - z);
        if (inside <= -half) continue;
        // smoothstep(-h, h, d) + smoothstep(-h, h, -d) = 1: two neighbors always add up to 1.
        const w = smoothstep(-half, half, inside);
        weight += w;
        gBase += zone.baseHeight * w;
        gAmp += zone.amplitude * w;
        gR += ((zone.color >> 16) & 255) * w;
        gG += ((zone.color >> 8) & 255) * w;
        gB += (zone.color & 255) * w;
      }
      if (weight <= 1e-6) continue;
      const cover = Math.min(1, weight);
      const inv = 1 / weight;
      base += (gBase * inv - base) * cover;
      amplitude += (gAmp * inv - amplitude) * cover;
      r += ((gR * inv) / 255 - r) * cover;
      g += ((gG * inv) / 255 - g) * cover;
      b += ((gB * inv) / 255 - b) * cover;
    }

    // Hills: 0..1 noise, so the base height is the lowest point of a zone's land.
    const hills = fbm2(cfg.seed, x, z, cfg.wavelength, cfg.octaves) * 0.5 + 0.5;
    let height = base + amplitude * hills;

    // Coast: the land sinks to the sea floor towards the world edge.
    const toEdge = Math.min(x - cfg.minX, cfg.maxX - x, z - cfg.minZ, cfg.maxZ - z);
    const land = smoothstep(0, cfg.coastWidth, toEdge);
    height = cfg.seaFloor + (height - cfg.seaFloor) * land;
    r = this.seaR + (r - this.seaR) * land;
    g = this.seaG + (g - this.seaG) * land;
    b = this.seaB + (b - this.seaB) * land;

    // Slight brightness variation, from a finer noise layer than the hills.
    const shade = 1 + fbm2((cfg.seed ^ 0x5bd1e995) | 0, x, z, 40, 2) * COLOR_VARIATION * 2;
    out.height = height;
    out.r = Math.min(1, r * shade);
    out.g = Math.min(1, g * shade);
    out.b = Math.min(1, b * shade);
    return out;
  }
}
