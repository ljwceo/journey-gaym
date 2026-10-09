import {
  type BufferGeometry,
  BufferAttribute,
  BufferGeometry as Geometry,
  DynamicDrawUsage,
  Group,
  Mesh,
  MeshLambertMaterial,
} from 'three';
import { type CircleCollider, circleCollider } from './Colliders';
import { PROP_STRIDE, chunkIndices } from './ChunkBuilder';
import { ChunkPlanner, type ChunkRecord, LOD_NEAR, NONE, type RingConfig } from './ChunkPlanner';
import { ChunkTiles } from './ChunkTiles';
import type { FloatingOrigin } from './FloatingOrigin';
import { PropLayer } from './PropLayer';
import { propGeometry } from './PropModels';
import type { SpatialHash } from './SpatialHash';
import type { TerrainJobRunner } from './TerrainJobs';
import { TerrainWorkers } from './TerrainWorkers';

/** What the graphics preset decides about streaming (looks only, never gameplay). */
export interface StreamPreset {
  rings: RingConfig;
  segmentsNear: number;
  segmentsFar: number;
  /** Share of decor props to keep (0..1). */
  decorDensity: number;
}

/** Limits from quality.json → streaming (the same on every preset). */
export interface StreamLimits {
  frameBudgetMs: number;
  maxAppliesPerFrame: number;
  maxJobsInFlight: number;
  maxWorkers: number;
  directionBonus: number;
}

/** A prop kind as the streamer needs it: how to draw it. */
export interface PropLook {
  model: string;
  colors: number[];
}

/** Numbers for the debug overlay. */
export interface StreamStats {
  records: number;
  shown: number;
  active: number;
  queued: number;
  inFlight: number;
  tiles: number;
  props: number;
  colliders: number;
  mode: 'worker' | 'main';
  /** Slowest frame (ms) spent putting chunks into the world, over the last second. */
  applyMaxMs: number;
  applied: number;
}

const STATS_WINDOW_SECONDS = 1;

/**
 * Loads and unloads the world around the player, chunk by chunk (CLAUDE.md §6).
 *
 * - ChunkPlanner decides which chunks exist and in which order they load.
 * - Terrain meshes and prop positions are built in Web Workers (TerrainWorkers).
 * - Each frame only a small, budgeted amount of finished work is put into the world (by
 *   default at most 2 chunks or 2 ms), so loading never causes a frame drop.
 * - Geometries, buffers, colliders and instance slots are pooled: walking around for a long
 *   time does not grow memory, and unloading really frees chunk slots for reuse.
 * - Props (trees, rocks, bushes) are one InstancedMesh per kind for the whole world.
 * - Chunks that are still loading show a flat tile in the zone color: never a hole.
 * - Colliders exist only in the active ring, which is the same on every graphics preset.
 */
export class WorldStreamer {
  readonly planner: ChunkPlanner;
  /** Terrain meshes (positions relative to the floating origin). */
  readonly group = new Group();
  private readonly workers: TerrainWorkers;
  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  private readonly tileMaterial = new MeshLambertMaterial();
  private readonly propMaterial = new MeshLambertMaterial({ vertexColors: true });
  private readonly tiles: ChunkTiles;
  private readonly layers: PropLayer[];
  private readonly meshes: (Mesh | null)[];
  private readonly meshSegments: Int32Array;
  /** Free terrain geometries per segment count. */
  private readonly pools = new Map<number, BufferGeometry[]>();
  private readonly indices = new Map<number, Uint16Array | Uint32Array>();
  /** Per record: the job in progress and its segment count. */
  private readonly jobOf: Int32Array;
  private readonly jobSegments: Int32Array;
  /** Per record and prop kind: the last built prop data (for colliders and origin shifts). */
  private readonly propData: (Float32Array | null)[];
  private readonly propCounts: Int32Array;
  private readonly hasData: Uint8Array;
  private readonly colliders: (CircleCollider[] | null)[];
  private readonly colliderCount: Int32Array;
  private readonly collidersIn: Uint8Array;
  private readonly kinds: number;
  private readonly propOffsets: number[];
  private readonly propStride: number;
  private readonly maxColliders: number;
  private preset: StreamPreset;
  private nextJob = 1;
  private syncBuffer: ArrayBuffer | null = null;

  // Debug numbers.
  private appliedTotal = 0;
  private applyMaxMs = 0;
  private applyMaxWindow = 0;
  private statsTime = 0;

  constructor(
    private readonly runner: TerrainJobRunner,
    looks: readonly PropLook[],
    private readonly hash: SpatialHash,
    private readonly origin: FloatingOrigin,
    preset: StreamPreset,
    private readonly limits: StreamLimits,
    capacity: number,
    /** Most detailed mesh any preset uses (sizes the scratch buffers). */
    private readonly maxSegments: number,
    reportProblem: (message: string) => void,
  ) {
    const spec = runner.field.spec;
    this.preset = preset;
    this.planner = new ChunkPlanner(spec.chunkSize, preset.rings, capacity, limits.directionBonus);
    this.planner.onRelease = this.release;
    this.workers = new TerrainWorkers(
      runner,
      {
        maxWorkers: limits.maxWorkers,
        maxJobsInFlight: limits.maxJobsInFlight,
        bufferLength: runner.bufferLength(maxSegments),
      },
      reportProblem,
    );
    this.group.name = 'terrain';

    this.meshes = new Array<Mesh | null>(capacity).fill(null);
    this.meshSegments = new Int32Array(capacity);
    this.jobOf = new Int32Array(capacity);
    this.jobSegments = new Int32Array(capacity);
    this.hasData = new Uint8Array(capacity);
    this.colliderCount = new Int32Array(capacity);
    this.collidersIn = new Uint8Array(capacity);
    this.colliders = new Array<CircleCollider[] | null>(capacity).fill(null);

    this.kinds = spec.props.length;
    this.propOffsets = [];
    let stride = 0;
    for (const prop of spec.props) {
      this.propOffsets.push(stride);
      stride += prop.maxPerChunk * PROP_STRIDE;
    }
    this.propStride = stride;
    this.propData = new Array<Float32Array | null>(capacity).fill(null);
    this.propCounts = new Int32Array(capacity * this.kinds);
    this.maxColliders = spec.props.reduce(
      (sum, prop) => sum + (prop.colliderRadius > 0 ? prop.maxPerChunk : 0),
      0,
    );

    this.layers = spec.props.map((prop, k) => {
      const look = looks[k];
      if (!look) throw new Error(`No look for prop ${prop.id}`);
      const layer = new PropLayer(
        propGeometry(look.model, look.colors),
        this.propMaterial,
        capacity,
        prop.maxPerChunk,
      );
      layer.mesh.name = `props:${prop.id}`;
      return layer;
    });
    this.tiles = new ChunkTiles(this.tileMaterial, capacity, spec.chunkSize);
    this.tiles.mesh.name = 'chunk-tiles';
    this.group.add(this.tiles.mesh);
    for (const layer of this.layers) this.group.add(layer.mesh);
  }

  get rings(): RingConfig {
    return this.preset.rings;
  }

  /**
   * Switches graphics preset. Other rings just change what gets loaded; a different mesh detail
   * or decor density reloads the world around (x, z) (rare: only from Settings).
   */
  setPreset(preset: StreamPreset, x: number, z: number): void {
    if (Math.max(preset.segmentsNear, preset.segmentsFar) > this.maxSegments) {
      throw new Error('terrain buffers are too small for this preset');
    }
    const reload =
      preset.segmentsNear !== this.preset.segmentsNear ||
      preset.segmentsFar !== this.preset.segmentsFar ||
      preset.decorDensity !== this.preset.decorDensity;
    this.preset = preset;
    this.planner.setRings(preset.rings);
    if (!reload) return;
    this.planner.clear();
    // Geometries of a detail level that is no longer used are freed.
    for (const [segments, pool] of this.pools) {
      if (segments === preset.segmentsNear || segments === preset.segmentsFar) continue;
      for (const geometry of pool) geometry.dispose();
      this.pools.delete(segments);
    }
    this.loadNow(x, z);
  }

  /**
   * Builds the active ring right now, on the main thread: entering the world or teleporting.
   * The player always starts on real ground with colliders, never on a stand-in tile.
   */
  loadNow(x: number, z: number): void {
    this.planner.invalidate();
    this.planner.update(x, z, 0, 0);
    const segments = this.preset.segmentsNear;
    if (!this.syncBuffer) {
      this.syncBuffer = new ArrayBuffer(this.runner.bufferLength(this.maxSegments) * 4);
    }
    for (const record of this.planner.records) {
      if (!record.used || !record.active || !record.needsBuild) continue;
      record.pendingLod = LOD_NEAR;
      this.runner.run(record.cx, record.cz, segments, this.preset.decorDensity, this.syncBuffer);
      this.apply(record, segments, this.syncBuffer);
    }
    this.syncRecords();
    this.flush();
  }

  /**
   * Call every frame with the player position (m) and walking direction.
   * @param seconds real time since the last frame (for the debug numbers)
   */
  update(x: number, z: number, dirX: number, dirZ: number, seconds: number): void {
    this.workers.beginFrame();
    this.planner.update(x, z, dirX, dirZ);
    this.dispatch();
    this.applyFinished();
    this.syncRecords();
    this.flush();
    this.statsTime += seconds;
    if (this.statsTime >= STATS_WINDOW_SECONDS) {
      this.applyMaxMs = this.applyMaxWindow;
      this.applyMaxWindow = 0;
      this.statsTime = 0;
    }
  }

  /** The floating origin moved: move everything drawn back by the same amount. */
  onOriginShift(dx: number, dz: number): void {
    for (const mesh of this.meshes) {
      if (mesh) mesh.position.set(mesh.position.x - dx, 0, mesh.position.z - dz);
    }
    for (const layer of this.layers) layer.shift(dx, dz);
    this.tiles.shift(dx, dz);
    this.flush();
  }

  stats(out: StreamStats): StreamStats {
    let shown = 0;
    let active = 0;
    let queued = 0;
    for (const record of this.planner.records) {
      if (!record.used) continue;
      if (record.shownLod !== NONE) shown++;
      if (this.collidersIn[record.index] === 1) active++;
      if (record.ring <= this.preset.rings.preload && record.needsBuild) queued++;
    }
    let props = 0;
    for (const layer of this.layers) props += layer.instanceCount;
    out.records = this.planner.usedCount;
    out.shown = shown;
    out.active = active;
    out.queued = queued;
    out.inFlight = this.workers.jobsInFlight + this.workers.finishedCount;
    out.tiles = this.tiles.shownCount;
    out.props = props;
    out.colliders = this.hash.size;
    out.mode = this.workers.mode;
    out.applyMaxMs = this.applyMaxMs;
    out.applied = this.appliedTotal;
    return out;
  }

  /** Terrain geometries that exist (on screen plus pooled): must stay bounded. */
  get geometryCount(): number {
    let count = 0;
    for (const pool of this.pools.values()) count += pool.length;
    for (const mesh of this.meshes) if (mesh?.visible) count++;
    return count;
  }

  /** Render position of a chunk's terrain mesh (tests and debugging). */
  meshPosition(index: number): { x: number; z: number } | null {
    const mesh = this.meshes[index];
    return mesh?.visible ? mesh.position : null;
  }

  dispose(): void {
    this.workers.dispose();
    this.planner.clear();
    for (const mesh of this.meshes) {
      if (!mesh) continue;
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    this.meshes.fill(null);
    for (const pool of this.pools.values()) for (const geometry of pool) geometry.dispose();
    this.pools.clear();
    for (const layer of this.layers) layer.dispose();
    this.tiles.dispose();
    this.material.dispose();
    this.tileMaterial.dispose();
    this.propMaterial.dispose();
    this.group.clear();
  }

  // ------------------------------------------------------------------ loading

  private dispatch(): void {
    const queue = this.planner.queue;
    for (let i = 0; i < queue.length; i++) {
      if (!this.workers.canRequest()) return;
      const record = queue[i] as ChunkRecord;
      if (!record.used || !record.needsBuild) continue;
      const segments =
        record.wantLod === LOD_NEAR ? this.preset.segmentsNear : this.preset.segmentsFar;
      const job = this.nextJob++;
      this.jobOf[record.index] = job;
      this.jobSegments[record.index] = segments;
      record.pendingLod = record.wantLod;
      this.workers.request(job, record.cx, record.cz, segments, this.preset.decorDensity);
    }
  }

  private applyFinished(): void {
    const start = performance.now();
    let applied = 0;
    while (this.workers.finishedCount > 0) {
      if (applied >= this.limits.maxAppliesPerFrame) break;
      if (applied > 0 && performance.now() - start >= this.limits.frameBudgetMs) break;
      const finished = this.workers.takeFinished();
      if (!finished) break;
      const record = this.recordForJob(finished.job);
      if (record && finished.ok) {
        this.apply(record, this.jobSegments[record.index] as number, finished.buffer);
        applied++;
      } else if (record) {
        // Failed: try again later.
        record.pendingLod = NONE;
        this.jobOf[record.index] = 0;
        this.planner.invalidate();
      }
      this.workers.recycle(finished.buffer);
    }
    const ms = performance.now() - start;
    if (ms > this.applyMaxWindow) this.applyMaxWindow = ms;
  }

  private recordForJob(job: number): ChunkRecord | null {
    for (const record of this.planner.records) {
      if (record.used && this.jobOf[record.index] === job) return record;
    }
    return null;
  }

  /** Puts a finished build into the world: terrain mesh, props, (later) colliders. */
  private apply(record: ChunkRecord, segments: number, buffer: ArrayBuffer): void {
    const i = record.index;
    const layout = this.runner.layout(segments);
    const data = new Float32Array(buffer);
    const size = this.planner.chunkSize;
    const baseX = record.cx * size - this.origin.x;
    const baseZ = record.cz * size - this.origin.z;

    // Terrain mesh: copy into a pooled geometry (its GPU buffers are reused too).
    const geometry = this.takeGeometry(segments);
    const n = layout.vertexCount * 3;
    copyInto(geometry.getAttribute('position') as BufferAttribute, data, layout.positions, n);
    copyInto(geometry.getAttribute('normal') as BufferAttribute, data, layout.normals, n);
    copyInto(geometry.getAttribute('color') as BufferAttribute, data, layout.colors, n);
    geometry.computeBoundingSphere();
    let mesh = this.meshes[i];
    if (!mesh) {
      mesh = new Mesh(geometry, this.material);
      this.meshes[i] = mesh;
      this.group.add(mesh);
    } else {
      this.giveGeometry(mesh.geometry, this.meshSegments[i] as number);
      mesh.geometry = geometry;
    }
    this.meshSegments[i] = segments;
    mesh.position.set(baseX, 0, baseZ);
    mesh.visible = true;

    // Props.
    let store = this.propData[i];
    if (!store) {
      store = new Float32Array(this.propStride);
      this.propData[i] = store;
    }
    for (let k = 0; k < this.kinds; k++) {
      const count = data[layout.length + k] as number;
      const from = layout.props[k] as number;
      const to = this.propOffsets[k] as number;
      store.set(data.subarray(from, from + count * PROP_STRIDE), to);
      this.propCounts[i * this.kinds + k] = count;
      (this.layers[k] as PropLayer).write(i, store, to, count, baseX, baseZ);
    }
    this.hasData[i] = 1;
    record.shownLod = record.pendingLod === NONE ? record.wantLod : record.pendingLod;
    record.pendingLod = NONE;
    this.jobOf[i] = 0;
    this.appliedTotal++;
  }

  /** Colliders follow the active ring; stand-in tiles cover chunks without a mesh. */
  private syncRecords(): void {
    const field = this.runner.field;
    const size = this.planner.chunkSize;
    const preload = this.preset.rings.preload;
    for (const record of this.planner.records) {
      if (!record.used) continue;
      const i = record.index;
      const wantColliders = record.active && this.hasData[i] === 1;
      if (wantColliders && this.collidersIn[i] === 0) this.insertColliders(record);
      else if (!wantColliders && this.collidersIn[i] === 1) this.removeColliders(i);

      const wantTile = record.shownLod === NONE && record.ring <= preload;
      if (wantTile && !this.tiles.isShown(i)) {
        const x = record.cx * size;
        const z = record.cz * size;
        const height = field.sample(x + size / 2, z + size / 2);
        this.tiles.show(i, x - this.origin.x, height, z - this.origin.z, field.r, field.g, field.b);
      } else if (!wantTile && this.tiles.isShown(i)) {
        this.tiles.hide(i);
      }
    }
  }

  private insertColliders(record: ChunkRecord): void {
    const i = record.index;
    const store = this.propData[i];
    if (!store) return;
    let list = this.colliders[i];
    if (!list) {
      list = Array.from({ length: this.maxColliders }, () => circleCollider(0, 0, 0));
      this.colliders[i] = list;
    }
    const spec = this.runner.field.spec;
    const size = this.planner.chunkSize;
    let used = 0;
    for (let k = 0; k < this.kinds; k++) {
      const radius = spec.props[k]?.colliderRadius ?? 0;
      if (radius <= 0) continue;
      const count = this.propCounts[i * this.kinds + k] as number;
      const offset = this.propOffsets[k] as number;
      for (let p = 0; p < count; p++) {
        const collider = list[used++] as CircleCollider;
        collider.x = record.cx * size + (store[offset + p * PROP_STRIDE] as number);
        collider.z = record.cz * size + (store[offset + p * PROP_STRIDE + 2] as number);
        collider.radius = radius * (store[offset + p * PROP_STRIDE + 4] as number);
        this.hash.insert(collider);
      }
    }
    this.colliderCount[i] = used;
    this.collidersIn[i] = 1;
  }

  private removeColliders(i: number): void {
    const list = this.colliders[i];
    if (list) {
      const count = this.colliderCount[i] as number;
      for (let c = 0; c < count; c++) this.hash.remove(list[c] as CircleCollider);
    }
    this.colliderCount[i] = 0;
    this.collidersIn[i] = 0;
  }

  /** A record is dropped by the planner: free everything it held for reuse. */
  private readonly release = (record: ChunkRecord): void => {
    const i = record.index;
    if (this.collidersIn[i] === 1) this.removeColliders(i);
    const mesh = this.meshes[i];
    if (mesh && mesh.visible) {
      mesh.visible = false;
      this.giveGeometry(mesh.geometry, this.meshSegments[i] as number);
      this.meshSegments[i] = 0;
    }
    for (const layer of this.layers) layer.clear(i);
    this.tiles.hide(i);
    this.hasData[i] = 0;
    this.jobOf[i] = 0;
  };

  private flush(): void {
    for (const layer of this.layers) layer.flush();
    this.tiles.flush();
  }

  // ------------------------------------------------------------------ geometry pool

  private takeGeometry(segments: number): BufferGeometry {
    const pooled = this.pools.get(segments)?.pop();
    if (pooled) return pooled;
    let index = this.indices.get(segments);
    if (!index) {
      index = chunkIndices(segments);
      this.indices.set(segments, index);
    }
    const vertices = this.runner.layout(segments).vertexCount;
    const geometry = new Geometry();
    for (const name of ['position', 'normal', 'color']) {
      const attribute = new BufferAttribute(new Float32Array(vertices * 3), 3);
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
    }
    geometry.setIndex(new BufferAttribute(index, 1));
    return geometry;
  }

  private giveGeometry(geometry: BufferGeometry, segments: number): void {
    if (segments <= 0) return;
    let pool = this.pools.get(segments);
    if (!pool) {
      pool = [];
      this.pools.set(segments, pool);
    }
    if (!pool.includes(geometry)) pool.push(geometry);
  }
}

function copyInto(attribute: BufferAttribute, data: Float32Array, from: number, length: number) {
  (attribute.array as Float32Array).set(data.subarray(from, from + length));
  attribute.needsUpdate = true;
}
