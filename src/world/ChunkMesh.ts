import type { TerrainField, TerrainSample } from './TerrainField';

/**
 * Terrain mesh data for one chunk, built from the TerrainField (in the terrain worker).
 * Plain typed arrays, so they can be transferred to the main thread without copying.
 *
 * Grid vertex (i, j) lies at local (i * step, j * step), index j * (n + 1) + i. Each grid cell
 * is split along the diagonal from (i + 1, j) to (i, j + 1); `gridHeight` samples exactly the
 * same triangles, so the player stands precisely on the drawn ground.
 * The chunk edge has a "skirt" hanging down, which hides gaps between chunks with different
 * levels of detail.
 */
export interface ChunkMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  index: Uint16Array | Uint32Array;
  /** Heights of the (n + 1)² grid vertices (for ground sampling and collision). */
  heights: Float32Array;
  segments: number;
}

const sample: TerrainSample = { height: 0, r: 0, g: 0, b: 0 };

/**
 * Style-guide colors are sRGB; Three.js expects vertex colors in linear space (a material
 * color is converted automatically, a vertex color attribute is not).
 */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Builds the mesh of chunk (cx, cz) with `segments` cells per side. */
export function buildChunkMesh(
  field: TerrainField,
  cx: number,
  cz: number,
  size: number,
  segments: number,
  skirtDepth: number,
): ChunkMeshData {
  const n = segments;
  const step = size / n;
  const originX = cx * size;
  const originZ = cz * size;
  const row = n + 1;
  const gridCount = row * row;
  const skirtCount = 4 * n;
  const vertexCount = gridCount + skirtCount;

  // Heights with a one-cell border, so normals match across chunk edges.
  const border = n + 3;
  const bordered = new Float32Array(border * border);
  for (let j = -1; j <= n + 1; j++) {
    for (let i = -1; i <= n + 1; i++) {
      bordered[(j + 1) * border + (i + 1)] = field.heightAt(originX + i * step, originZ + j * step);
    }
  }
  const heightAt = (i: number, j: number): number => bordered[(j + 1) * border + (i + 1)] as number;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const heights = new Float32Array(gridCount);

  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const v = j * row + i;
      const h = heightAt(i, j);
      heights[v] = h;
      positions[v * 3] = i * step;
      positions[v * 3 + 1] = h;
      positions[v * 3 + 2] = j * step;
      // Normal from central differences: (-dh/dx, 1, -dh/dz), normalised.
      const nx = -(heightAt(i + 1, j) - heightAt(i - 1, j)) / (2 * step);
      const nz = -(heightAt(i, j + 1) - heightAt(i, j - 1)) / (2 * step);
      const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      normals[v * 3] = nx * inv;
      normals[v * 3 + 1] = inv;
      normals[v * 3 + 2] = nz * inv;
      field.sample(originX + i * step, originZ + j * step, sample);
      colors[v * 3] = srgbToLinear(sample.r);
      colors[v * 3 + 1] = srgbToLinear(sample.g);
      colors[v * 3 + 2] = srgbToLinear(sample.b);
    }
  }

  // Perimeter loop: along +x (south edge), +z (east), -x (north), -z (west).
  const perimeter = new Uint32Array(skirtCount);
  let p = 0;
  for (let i = 0; i < n; i++) perimeter[p++] = i;
  for (let j = 0; j < n; j++) perimeter[p++] = j * row + n;
  for (let i = n; i > 0; i--) perimeter[p++] = n * row + i;
  for (let j = n; j > 0; j--) perimeter[p++] = j * row;
  for (let k = 0; k < skirtCount; k++) {
    const from = perimeter[k] as number;
    const v = gridCount + k;
    positions[v * 3] = positions[from * 3] as number;
    positions[v * 3 + 1] = (positions[from * 3 + 1] as number) - skirtDepth;
    positions[v * 3 + 2] = positions[from * 3 + 2] as number;
    for (let c = 0; c < 3; c++) {
      normals[v * 3 + c] = normals[from * 3 + c] as number;
      colors[v * 3 + c] = colors[from * 3 + c] as number;
    }
  }

  const triangleCount = n * n * 2 + skirtCount * 2;
  const index =
    vertexCount > 65535 ? new Uint32Array(triangleCount * 3) : new Uint16Array(triangleCount * 3);
  let t = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      // Counter-clockwise seen from above (front faces point up).
      index[t++] = a;
      index[t++] = c;
      index[t++] = b;
      index[t++] = b;
      index[t++] = c;
      index[t++] = d;
    }
  }
  for (let k = 0; k < skirtCount; k++) {
    const top0 = perimeter[k] as number;
    const top1 = perimeter[(k + 1) % skirtCount] as number;
    const low0 = gridCount + k;
    const low1 = gridCount + ((k + 1) % skirtCount);
    // Faces point outwards.
    index[t++] = top0;
    index[t++] = top1;
    index[t++] = low0;
    index[t++] = top1;
    index[t++] = low1;
    index[t++] = low0;
  }
  return { positions, normals, colors, index, heights, segments: n };
}

/**
 * Height of the drawn triangles at local position (lx, lz) of a chunk grid with `n` cells per
 * side of `size` meters. Positions outside the chunk are clamped to its edge.
 */
export function gridHeight(
  heights: ArrayLike<number>,
  n: number,
  size: number,
  lx: number,
  lz: number,
): number {
  const step = size / n;
  const gx = Math.min(n, Math.max(0, lx / step));
  const gz = Math.min(n, Math.max(0, lz / step));
  const i = Math.min(n - 1, Math.floor(gx));
  const j = Math.min(n - 1, Math.floor(gz));
  const fx = gx - i;
  const fz = gz - j;
  const row = n + 1;
  const a = heights[j * row + i] as number;
  const b = heights[j * row + i + 1] as number;
  const c = heights[(j + 1) * row + i] as number;
  const d = heights[(j + 1) * row + i + 1] as number;
  // Same split as the mesh: triangle (a, b, c) below the b–c diagonal, (b, c, d) above.
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

/** Low-detail map of the whole world (shown under and beyond the loaded chunks). */
export interface FarMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  index: Uint32Array;
  /** World position of local (0, 0). */
  originX: number;
  originZ: number;
}

/**
 * Builds the far map over the world plus `margin` meters of sea around it. Each vertex takes
 * the lowest height around it and sinks a little more, so the far map stays under the detailed
 * chunks where both exist.
 */
export function buildFarMesh(field: TerrainField, spacing: number, margin: number): FarMeshData {
  const cfg = field.config;
  const originX = cfg.minX - margin;
  const originZ = cfg.minZ - margin;
  const columns = Math.ceil((cfg.maxX - cfg.minX + margin * 2) / spacing);
  const rows = Math.ceil((cfg.maxZ - cfg.minZ + margin * 2) / spacing);
  const row = columns + 1;
  const count = row * (rows + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const heights = new Float32Array(count);
  const half = spacing / 2;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const x = originX + i * spacing;
      const z = originZ + j * spacing;
      let lowest = Infinity;
      for (let sz = -1; sz <= 1; sz++) {
        for (let sx = -1; sx <= 1; sx++) {
          lowest = Math.min(lowest, field.heightAt(x + sx * half, z + sz * half));
        }
      }
      const v = j * row + i;
      heights[v] = lowest - 1;
      positions[v * 3] = i * spacing;
      positions[v * 3 + 1] = lowest - 1;
      positions[v * 3 + 2] = j * spacing;
      field.sample(x, z, sample);
      colors[v * 3] = srgbToLinear(sample.r);
      colors[v * 3 + 1] = srgbToLinear(sample.g);
      colors[v * 3 + 2] = srgbToLinear(sample.b);
    }
  }
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const v = j * row + i;
      const left = heights[j * row + Math.max(0, i - 1)] as number;
      const right = heights[j * row + Math.min(columns, i + 1)] as number;
      const up = heights[Math.max(0, j - 1) * row + i] as number;
      const down = heights[Math.min(rows, j + 1) * row + i] as number;
      const nx = -(right - left) / (2 * spacing);
      const nz = -(down - up) / (2 * spacing);
      const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      normals[v * 3] = nx * inv;
      normals[v * 3 + 1] = inv;
      normals[v * 3 + 2] = nz * inv;
    }
  }
  const index = new Uint32Array(columns * rows * 6);
  let t = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      index[t++] = a;
      index[t++] = c;
      index[t++] = b;
      index[t++] = b;
      index[t++] = c;
      index[t++] = d;
    }
  }
  return { positions, normals, colors, index, originX, originZ };
}
