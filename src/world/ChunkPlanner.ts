/** Chunk rings from the graphics preset (in chunks, counted outward from the player's chunk). */
export interface RingConfig {
  /** Fully live: colliders (and later enemies). The same on every preset. */
  active: number;
  /** Loaded and drawn. */
  preload: number;
  /** Kept until a chunk is further than this (hysteresis: no flicker at the edge). */
  unload: number;
  /** Up to this ring the detailed terrain mesh is used. */
  lodRing: number;
}

/** No mesh / no build. */
export const NONE = -1;
export const LOD_NEAR = 0;
export const LOD_FAR = 1;

/** One chunk the world keeps track of. Records are pooled; `index` is a stable slot number. */
export class ChunkRecord {
  used = false;
  cx = 0;
  cz = 0;
  key = 0;
  /** Ring distance to the player's chunk (Chebyshev, in chunks). */
  ring = 0;
  /** Detail level it should show. */
  wantLod = LOD_FAR;
  /** Should have its colliders in the world. */
  active = false;
  /** Detail level of the mesh on screen (NONE = not built yet). */
  shownLod = NONE;
  /** Detail level of the build in progress (NONE = nothing in progress). */
  pendingLod = NONE;
  /** Load order: lower goes first. */
  score = 0;

  constructor(readonly index: number) {}

  /** True when a build of the wanted detail level must still be started. */
  get needsBuild(): boolean {
    return this.wantLod !== this.shownLod && this.wantLod !== this.pendingLod;
  }
}

const KEY_OFFSET = 1 << 15;
const KEY_SPAN = 1 << 16;

export function chunkKey(cx: number, cz: number): number {
  return (cx + KEY_OFFSET) * KEY_SPAN + (cz + KEY_OFFSET);
}

/** Number of chunks in a square ring area of the given radius. */
export function ringArea(radius: number): number {
  return (2 * radius + 1) * (2 * radius + 1);
}

/**
 * Decides which chunks exist around the player and in which order they load. Pure logic (no
 * Three.js, no workers), so it can be tested; WorldStreamer does the actual loading.
 *
 * - Every chunk within the preload ring gets a record; the active ring also gets colliders.
 * - Chunks are only dropped beyond the unload ring, so walking back and forth over a chunk edge
 *   never loads and unloads the same chunks again.
 * - The build queue is sorted by distance, with a bonus for chunks in the walking direction.
 *
 * Planning only runs when the player enters another chunk or the rings change; the rest of the
 * time `update` does nothing. It never allocates after construction (the pool is fixed).
 */
export class ChunkPlanner {
  readonly records: ChunkRecord[];
  /** Records that need a build, best first. Rebuilt on every plan. */
  readonly queue: ChunkRecord[] = [];
  private readonly byKey = new Map<number, ChunkRecord>();
  private rings: RingConfig;
  private centerX = Number.NaN;
  private centerZ = Number.NaN;
  private dirty = true;

  /** Called when a record is dropped (free its mesh, colliders, ...). */
  onRelease: (record: ChunkRecord) => void = () => {};

  constructor(
    readonly chunkSize: number,
    rings: RingConfig,
    capacity: number,
    private readonly directionBonus = 0.75,
  ) {
    this.rings = rings;
    this.records = Array.from({ length: capacity }, (_, i) => new ChunkRecord(i));
  }

  get ringConfig(): RingConfig {
    return this.rings;
  }

  setRings(rings: RingConfig): void {
    this.rings = rings;
    this.dirty = true;
  }

  /** Forces a new plan on the next update (e.g. after a build finished or failed). */
  invalidate(): void {
    this.dirty = true;
  }

  get(cx: number, cz: number): ChunkRecord | undefined {
    return this.byKey.get(chunkKey(cx, cz));
  }

  /**
   * @param x, z player position (m)
   * @param dirX, dirZ walking direction (any length; 0 = standing still)
   * @returns true when a new plan was made
   */
  update(x: number, z: number, dirX: number, dirZ: number): boolean {
    const size = this.chunkSize;
    const pcx = Math.floor(x / size);
    const pcz = Math.floor(z / size);
    if (!this.dirty && pcx === this.centerX && pcz === this.centerZ) return false;
    this.dirty = false;
    this.centerX = pcx;
    this.centerZ = pcz;
    const { active, preload, unload, lodRing } = this.rings;

    // Drop what is too far; update the ring of what stays.
    for (const record of this.records) {
      if (!record.used) continue;
      const ring = Math.max(Math.abs(record.cx - pcx), Math.abs(record.cz - pcz));
      if (ring > unload) {
        this.release(record);
        continue;
      }
      record.ring = ring;
      record.active = ring <= active;
      // Between preload and unload a chunk is only kept: no upgrades for it.
      record.wantLod = ring <= lodRing ? LOD_NEAR : LOD_FAR;
    }

    // Make sure everything within the preload ring exists.
    for (let dz = -preload; dz <= preload; dz++) {
      for (let dx = -preload; dx <= preload; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (this.byKey.has(chunkKey(cx, cz))) continue;
        const record = this.acquire(cx, cz);
        if (!record) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        record.ring = ring;
        record.active = ring <= active;
        record.wantLod = ring <= lodRing ? LOD_NEAR : LOD_FAR;
      }
    }

    // Load order: distance from the player in chunks, minus a bonus in the walking direction.
    const dirLength = Math.sqrt(dirX * dirX + dirZ * dirZ);
    const ux = dirLength > 1e-6 ? dirX / dirLength : 0;
    const uz = dirLength > 1e-6 ? dirZ / dirLength : 0;
    const px = x / size;
    const pz = z / size;
    this.queue.length = 0;
    for (const record of this.records) {
      if (!record.used) continue;
      const ox = record.cx + 0.5 - px;
      const oz = record.cz + 0.5 - pz;
      const distance = Math.sqrt(ox * ox + oz * oz);
      const along = distance > 1e-6 ? (ox * ux + oz * uz) / distance : 0;
      record.score = distance - this.directionBonus * (along > 0 ? along : 0);
      if (record.ring <= preload && record.needsBuild) this.queue.push(record);
    }
    this.queue.sort(byScore);
    return true;
  }

  /** Number of records in use. */
  get usedCount(): number {
    return this.byKey.size;
  }

  private acquire(cx: number, cz: number): ChunkRecord | null {
    // Lowest free slot first, so instanced props stay packed at the start of their buffers.
    for (const record of this.records) {
      if (record.used) continue;
      record.used = true;
      record.cx = cx;
      record.cz = cz;
      record.key = chunkKey(cx, cz);
      record.shownLod = NONE;
      record.pendingLod = NONE;
      record.active = false;
      this.byKey.set(record.key, record);
      return record;
    }
    return null;
  }

  private release(record: ChunkRecord): void {
    this.onRelease(record);
    record.used = false;
    record.active = false;
    record.shownLod = NONE;
    record.pendingLod = NONE;
    this.byKey.delete(record.key);
  }

  /** Drops every record (leaving the world). */
  clear(): void {
    for (const record of this.records) if (record.used) this.release(record);
    this.queue.length = 0;
    this.dirty = true;
  }
}

function byScore(a: ChunkRecord, b: ChunkRecord): number {
  return a.score - b.score;
}
