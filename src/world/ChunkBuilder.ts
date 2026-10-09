import { Random, hashSeed } from '../core/Random';
import { pointInShape } from './Shapes';
import type { TerrainField, TerrainZoneSpec } from './TerrainField';

/** Numbers stored per scattered prop: local x, y, local z, rotation (rad), scale. */
export const PROP_STRIDE = 5;

/**
 * Where everything sits in one chunk's Float32Array (filled by the worker, read by the main
 * thread). Vertex data is local to the chunk's corner, so the numbers stay small (precision).
 *
 * Vertices: a (segments+1)² grid, then a skirt: a copy of the edge vertices hanging down,
 * which hides cracks where a detailed chunk meets a coarse one.
 */
export interface ChunkLayout {
  segments: number;
  gridVertices: number;
  vertexCount: number;
  positions: number;
  normals: number;
  colors: number;
  /** Offset of each prop kind's block (maxPerChunk × PROP_STRIDE floats). */
  props: number[];
  /** Total floats. */
  length: number;
}

export function chunkLayout(segments: number, maxPerChunk: readonly number[]): ChunkLayout {
  const side = segments + 1;
  const gridVertices = side * side;
  const vertexCount = gridVertices + 4 * side;
  const positions = 0;
  const normals = vertexCount * 3;
  const colors = vertexCount * 6;
  let offset = vertexCount * 9;
  const props: number[] = [];
  for (const max of maxPerChunk) {
    props.push(offset);
    offset += max * PROP_STRIDE;
  }
  return { segments, gridVertices, vertexCount, positions, normals, colors, props, length: offset };
}

/**
 * Triangle indices for a chunk mesh with `segments` cells per side, including the skirt.
 * Every triangle faces up (top) or outward (skirt). Built once per detail level.
 */
export function chunkIndices(segments: number): Uint16Array | Uint32Array {
  const side = segments + 1;
  const grid = side * side;
  const triangles = segments * segments * 2 + 4 * segments * 2;
  const indices =
    grid + 4 * side > 65535 ? new Uint32Array(triangles * 3) : new Uint16Array(triangles * 3);
  let n = 0;
  const top = (i: number, j: number): number => j * side + i;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = top(i, j);
      const b = top(i, j + 1);
      const c = top(i + 1, j);
      const d = top(i + 1, j + 1);
      indices[n++] = a;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = c;
      indices[n++] = b;
      indices[n++] = d;
    }
  }
  // Skirt vertices: north (j = 0), south (j = s), west (i = 0), east (i = s), each `side` long.
  const north = grid;
  const south = grid + side;
  const west = grid + side * 2;
  const east = grid + side * 3;
  for (let k = 0; k < segments; k++) {
    // North faces -z.
    let t0 = top(k, 0);
    let t1 = top(k + 1, 0);
    let s0 = north + k;
    let s1 = north + k + 1;
    n = quad(indices, n, t0, t1, s0, s1);
    // South faces +z: reversed.
    t0 = top(k, segments);
    t1 = top(k + 1, segments);
    s0 = south + k;
    s1 = south + k + 1;
    n = quad(indices, n, t1, t0, s1, s0);
    // West faces -x.
    t0 = top(0, k);
    t1 = top(0, k + 1);
    s0 = west + k;
    s1 = west + k + 1;
    n = quad(indices, n, t1, t0, s1, s0);
    // East faces +x.
    t0 = top(segments, k);
    t1 = top(segments, k + 1);
    s0 = east + k;
    s1 = east + k + 1;
    n = quad(indices, n, t0, t1, s0, s1);
  }
  return indices;
}

/** Two triangles (t0, t1, s0) and (t1, s1, s0). */
function quad(
  out: Uint16Array | Uint32Array,
  n: number,
  t0: number,
  t1: number,
  s0: number,
  s1: number,
): number {
  out[n++] = t0;
  out[n++] = t1;
  out[n++] = s0;
  out[n++] = t1;
  out[n++] = s1;
  out[n++] = s0;
  return n;
}

/**
 * Builds one chunk's terrain mesh data and scattered props into `out`.
 * Runs in the terrain worker (or on the main thread as a fallback); pure and deterministic.
 */
export class ChunkBuilder {
  private heights = new Float64Array(0);
  private readonly random = new Random(0);

  constructor(private readonly field: TerrainField) {}

  /**
   * @param density share of decor props to keep (graphics preset); never affects props with
   *   colliders, so gameplay is the same on every preset
   * @param propCounts receives how many props of each kind were placed
   */
  build(
    cx: number,
    cz: number,
    layout: ChunkLayout,
    density: number,
    out: Float32Array,
    propCounts: Int32Array | number[],
  ): void {
    this.buildTerrain(cx, cz, layout, out);
    this.scatter(cx, cz, layout, density, out, propCounts);
  }

  private buildTerrain(cx: number, cz: number, layout: ChunkLayout, out: Float32Array): void {
    const field = this.field;
    const spec = field.spec;
    const size = spec.chunkSize;
    const segments = layout.segments;
    const step = size / segments;
    const side = segments + 1;
    const originX = cx * size;
    const originZ = cz * size;
    // Heights with a one-vertex border, so normals at the edges match the neighbor chunk.
    const border = side + 2;
    if (this.heights.length < border * border) this.heights = new Float64Array(border * border);
    const heights = this.heights;
    for (let j = 0; j < border; j++) {
      for (let i = 0; i < border; i++) {
        const x = originX + (i - 1) * step;
        const z = originZ + (j - 1) * step;
        const inside = i > 0 && j > 0 && i <= side && j <= side;
        if (inside) {
          const v = (j - 1) * side + (i - 1);
          const height = field.sample(x, z);
          heights[j * border + i] = height;
          out[layout.positions + v * 3] = (i - 1) * step;
          out[layout.positions + v * 3 + 1] = height;
          out[layout.positions + v * 3 + 2] = (j - 1) * step;
          out[layout.colors + v * 3] = field.r;
          out[layout.colors + v * 3 + 1] = field.g;
          out[layout.colors + v * 3 + 2] = field.b;
        } else {
          heights[j * border + i] = field.heightAt(x, z);
        }
      }
    }
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const h = (di: number, dj: number): number =>
          heights[(j + 1 + dj) * border + (i + 1 + di)] as number;
        let nx = h(-1, 0) - h(1, 0);
        let ny = 2 * step;
        let nz = h(0, -1) - h(0, 1);
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= length;
        ny /= length;
        nz /= length;
        const v = j * side + i;
        out[layout.normals + v * 3] = nx;
        out[layout.normals + v * 3 + 1] = ny;
        out[layout.normals + v * 3 + 2] = nz;
      }
    }
    // Skirt: copies of the edge vertices, lowered.
    const drop = spec.skirtDepth;
    for (let k = 0; k < side; k++) {
      this.skirt(layout, out, layout.gridVertices + k, k, drop); // north: (k, 0)
      this.skirt(layout, out, layout.gridVertices + side + k, segments * side + k, drop); // south
      this.skirt(layout, out, layout.gridVertices + side * 2 + k, k * side, drop); // west
      this.skirt(layout, out, layout.gridVertices + side * 3 + k, k * side + segments, drop); // east
    }
  }

  private skirt(layout: ChunkLayout, out: Float32Array, to: number, from: number, drop: number) {
    for (let c = 0; c < 3; c++) {
      out[layout.positions + to * 3 + c] = out[layout.positions + from * 3 + c] as number;
      out[layout.normals + to * 3 + c] = out[layout.normals + from * 3 + c] as number;
      out[layout.colors + to * 3 + c] = out[layout.colors + from * 3 + c] as number;
    }
    out[layout.positions + to * 3 + 1] = (out[layout.positions + from * 3 + 1] as number) - drop;
  }

  /**
   * Scatters props with one random stream per chunk and prop kind, so the result never depends
   * on loading order, on the mesh detail or on other prop kinds. Every candidate always uses the
   * same random numbers; rejected candidates (water, excluded areas, too few for this zone)
   * just leave a gap.
   */
  private scatter(
    cx: number,
    cz: number,
    layout: ChunkLayout,
    density: number,
    out: Float32Array,
    propCounts: Int32Array | number[],
  ): void {
    const field = this.field;
    const spec = field.spec;
    const size = spec.chunkSize;
    const originX = cx * size;
    const originZ = cz * size;
    const random = this.random;
    spec.props.forEach((prop, k) => {
      random.reseed(hashSeed(spec.seed, cx, cz, k));
      let count = 0;
      let offset = layout.props[k] as number;
      for (let i = 0; i < prop.maxPerChunk; i++) {
        const lx = random.next() * size;
        const lz = random.next() * size;
        const roll = random.next() * prop.maxPerChunk;
        const rotation = random.next() * Math.PI * 2;
        const scale = prop.scaleMin + (prop.scaleMax - prop.scaleMin) * random.next();
        const decorRoll = random.next();
        const x = originX + lx;
        const z = originZ + lz;
        const zoneIndex = field.zoneIndexAt(x, z);
        if (zoneIndex < 0) continue;
        const zone = spec.zones[zoneIndex] as TerrainZoneSpec;
        if (roll >= (zone.scatter[k] ?? 0)) continue;
        if (prop.decor && decorRoll >= density) continue;
        if (excluded(zone, x, z)) continue;
        const y = field.heightAt(x, z);
        if (y < spec.seaLevel + prop.minHeightAboveSea) continue;
        out[offset++] = lx;
        out[offset++] = y;
        out[offset++] = lz;
        out[offset++] = rotation;
        out[offset++] = scale;
        count++;
      }
      propCounts[k] = count;
    });
  }
}

function excluded(zone: TerrainZoneSpec, x: number, z: number): boolean {
  for (const shape of zone.exclude) if (pointInShape(shape, x, z)) return true;
  return false;
}
