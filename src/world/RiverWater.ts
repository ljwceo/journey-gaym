import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshLambertMaterial } from 'three';
import type { TerrainField, TerrainRiver } from './TerrainField';

/** Distance (m) between cross sections of the water ribbon. */
const STEP = 4;
/** Smoothing passes over the water level (removes small bumps of the land noise). */
const SMOOTHING = 3;

/**
 * Center line samples of a river every STEP meters: x, z and the water level (the land beside
 * the river minus `drop`, smoothed). Pure numbers, so it can be tested.
 */
export function riverProfile(field: TerrainField, river: TerrainRiver, drop: number): number[] {
  const p = river.points;
  const out: number[] = [];
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = p[i] as number;
    const az = p[i + 1] as number;
    const bx = p[i + 2] as number;
    const bz = p[i + 3] as number;
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / STEP));
    // The last segment also adds its end point.
    const last = i + 4 >= p.length ? steps : steps - 1;
    for (let s = 0; s <= last; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      out.push(x, z, field.landHeightAt(x, z) - drop);
    }
  }
  for (let pass = 0; pass < SMOOTHING; pass++) {
    const levels = out.filter((_, k) => k % 3 === 2);
    for (let k = 1; k < levels.length - 1; k++) {
      out[k * 3 + 2] =
        ((levels[k - 1] as number) + (levels[k] as number) * 2 + (levels[k + 1] as number)) / 4;
    }
  }
  return out;
}

/**
 * Water surfaces of all rivers as one mesh (one draw call): a ribbon along each center line,
 * a little wider than the water, whose edges disappear under the banks. Built once when the
 * world opens; rivers are thin, so the whole thing is a few thousand triangles.
 */
export function buildRiverWater(
  field: TerrainField,
  rivers: readonly TerrainRiver[],
  drop: number,
  color: number,
): Mesh | null {
  const positions: number[] = [];
  const index: number[] = [];
  for (const river of rivers) {
    const samples = riverProfile(field, river, drop);
    const count = samples.length / 3;
    if (count < 2) continue;
    const half = river.half + river.bank * 0.5;
    const first = positions.length / 3;
    for (let k = 0; k < count; k++) {
      // Direction along the river from the neighbors (smooth corners).
      const prev = Math.max(0, k - 1) * 3;
      const next = Math.min(count - 1, k + 1) * 3;
      let dx = (samples[next] as number) - (samples[prev] as number);
      let dz = (samples[next + 1] as number) - (samples[prev + 1] as number);
      const length = Math.hypot(dx, dz) || 1;
      dx /= length;
      dz /= length;
      const x = samples[k * 3] as number;
      const z = samples[k * 3 + 1] as number;
      const y = samples[k * 3 + 2] as number;
      // Left and right of the flow direction.
      positions.push(x - dz * half, y, z + dx * half, x + dz * half, y, z - dx * half);
      if (k > 0) {
        const a = first + (k - 1) * 2;
        const b = first + k * 2;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  if (positions.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(index), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  // Seen from both sides: the winding depends on the flow direction.
  const mesh = new Mesh(geometry, new MeshLambertMaterial({ color, side: DoubleSide }));
  mesh.name = 'rivers';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
