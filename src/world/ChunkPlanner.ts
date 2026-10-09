/**
 * Pure decisions for chunk streaming (no Three.js), so they can be tested:
 * which detail level a chunk should have, when it unloads, and which chunk loads first.
 *
 * Distances are in chunks, measured as the larger of |dx| and |dz| (square rings).
 * - Active ring (≤ active): full detail, props and collision.
 * - Preload ring (≤ preload): loaded in the background with low detail.
 * - Unload ring: a loaded chunk only unloads beyond `unload`; together with the one-ring margin
 *   for dropping detail this is the hysteresis that stops chunks flickering at a ring edge.
 */
export interface ChunkRings {
  active: number;
  preload: number;
  unload: number;
}

/** Detail level: 0 = near (full detail), 1 = far (low detail). */
export type ChunkLod = 0 | 1;

/** Ring distance between two chunk coordinates. */
export function ringDistance(dx: number, dz: number): number {
  return Math.max(Math.abs(dx), Math.abs(dz));
}

/**
 * What a chunk at ring distance `distance` should be, given what it is now
 * (`current` = null when it is not loaded): a detail level, or null for "not loaded".
 */
export function wantedLod(
  distance: number,
  current: ChunkLod | null,
  rings: ChunkRings,
): ChunkLod | null {
  if (distance <= rings.active) return 0;
  if (distance > rings.unload) return null;
  if (current === null) return distance <= rings.preload ? 1 : null;
  // Keep full detail one ring beyond the active ring before dropping it.
  if (current === 0 && distance <= rings.active + 1) return 0;
  return 1;
}

/**
 * Load order (lower first): close chunks first, and among equally close chunks the ones in the
 * walking direction (dirX, dirZ: unit vector, or 0, 0 when standing still).
 */
export function loadPriority(dx: number, dz: number, dirX: number, dirZ: number): number {
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance === 0) return -1;
  const ahead = (dx * dirX + dz * dirZ) / distance;
  return distance - ahead * 0.9;
}

/** Chunk coordinate of a world position. */
export function chunkCoord(value: number, chunkSize: number): number {
  return Math.floor(value / chunkSize);
}

/** Map key of chunk (cx, cz); valid for |cx|, |cz| < 32768. */
export function chunkKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}
