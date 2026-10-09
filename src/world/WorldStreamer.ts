import {
  BufferAttribute,
  BufferGeometry,
  type Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { PropLibrary } from '../entities/PropFactory';
import { type ChunkMeshData, type FarMeshData, gridHeight } from './ChunkMesh';
import {
  type ChunkLod,
  type ChunkRings,
  chunkCoord,
  chunkKey,
  loadPriority,
  ringDistance,
  wantedLod,
} from './ChunkPlanner';
import { circleCollider, type CircleCollider } from './Colliders';
import type { Ground } from './Ground';
import { PROP_STRIDE } from './Scatter';
import type { SpatialHash } from './SpatialHash';
import type { ChunkListener } from './StructureLayer';
import type { WorldGenConfig } from './terrainConfig';
import type { TerrainField } from './TerrainField';
import type { TerrainRequest, TerrainResponse } from './terrainProtocol';

/** Requests the worker may be busy with at once (more = faster loading, more memory). */
const MAX_IN_FLIGHT = 4;
/** Main-thread time (ms) per frame for turning finished chunks into meshes. */
const APPLY_BUDGET_MS = 2;

/** What a chunk is doing, for the debug view. */
export type ChunkStatus = 'loading' | 'near' | 'far' | 'unloading';

export interface Chunk {
  readonly cx: number;
  readonly cz: number;
  readonly key: number;
  /** Loaded detail level (null = nothing drawn yet). */
  lod: ChunkLod | null;
  /** Level the planner wants (null = unload once the player is far enough away). */
  wanted: ChunkLod | null;
  /** Level requested from the worker and not yet back. */
  pending: ChunkLod | null;
  requestId: number;
  priority: number;
  mesh: Mesh | null;
  heights: Float32Array | null;
  segments: number;
  props: InstancedMesh[];
  colliders: CircleCollider[];
  /** Position in WorldStreamer.list (swap-remove on unload). */
  slot: number;
}

export interface StreamerStats {
  near: number;
  far: number;
  loading: number;
  /** Average worker time per chunk (ms). */
  workerMs: number;
  /** Longest main-thread apply time in the last debug interval (ms). */
  applyMsMax: number;
  colliders: number;
}

export interface StreamerOptions {
  config: WorldGenConfig;
  field: TerrainField;
  root: Group;
  hash: SpatialHash;
  props: PropLibrary;
  /** Collider radius at scale 1 per prop index (0 = none). */
  propColliders: readonly number[];
  rings: ChunkRings;
  /** Creates the terrain worker (a stub in tests). */
  createWorker: () => Worker;
  /** Told when a chunk first gets ground and when it is unloaded (structures follow chunks). */
  listener?: ChunkListener;
}

/**
 * Streams terrain chunks around the player: plans which chunks are wanted (ChunkPlanner),
 * asks the terrain worker to build them (closest and in the walking direction first), and turns
 * finished results into meshes, props and colliders within a small time budget per frame, so
 * loading never makes a frame stutter. Chunks that fall out of the unload ring are disposed.
 * Before a chunk is ready, the low-detail far map underneath shows the ground.
 *
 * Also the world's `Ground`: heights come from the drawn chunk triangles where loaded, and
 * from the TerrainField elsewhere.
 */
export class WorldStreamer implements Ground {
  readonly chunks = new Map<number, Chunk>();
  /** The same chunks as an array, so per-frame loops need no iterator objects. */
  readonly list: Chunk[] = [];
  readonly material = new MeshLambertMaterial({ vertexColors: true });
  private readonly farMaterial = new MeshLambertMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 4,
  });
  private far: Mesh | null = null;
  private worker: Worker | null;
  private readonly results: TerrainResponse[] = [];
  private readonly queue: Chunk[] = [];
  private nextRequestId = 1;
  private inFlight = 0;
  private centerX = Number.NaN;
  private centerZ = Number.NaN;
  private dirX = 0;
  private dirZ = 0;
  private rings: ChunkRings;
  private readonly size: number;
  private readonly minCx: number;
  private readonly maxCx: number;
  private readonly minCz: number;
  private readonly maxCz: number;
  private workerMsTotal = 0;
  private workerCount = 0;
  private applyMsMax = 0;
  private disposed = false;

  // Reused while building props (no allocation per prop).
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(private readonly options: StreamerOptions) {
    const { config } = options;
    this.size = config.chunkSize;
    this.rings = { ...options.rings };
    const t = config.terrain;
    this.minCx = chunkCoord(t.minX, this.size);
    this.maxCx = chunkCoord(t.maxX - 1e-6, this.size);
    this.minCz = chunkCoord(t.minZ, this.size);
    this.maxCz = chunkCoord(t.maxZ - 1e-6, this.size);
    this.worker = options.createWorker();
    this.worker.onmessage = (event: MessageEvent<TerrainResponse>) => {
      this.results.push(event.data);
    };
    this.send({ type: 'init', config });
  }

  // ------------------------------------------------------------ Ground

  heightAt(x: number, z: number): number {
    const cx = chunkCoord(x, this.size);
    const cz = chunkCoord(z, this.size);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk?.heights) {
      return gridHeight(
        chunk.heights,
        chunk.segments,
        this.size,
        x - cx * this.size,
        z - cz * this.size,
      );
    }
    return this.options.field.heightAt(x, z);
  }

  // ------------------------------------------------------------ streaming

  /** New ring sizes (graphics preset changed); takes effect on the next update. */
  setRings(rings: ChunkRings): void {
    this.rings = { ...rings };
    this.centerX = Number.NaN;
  }

  get chunkSize(): number {
    return this.size;
  }

  /**
   * Call once per rendered frame with the player's world position and walking direction
   * (unit vector, or 0, 0 when standing still).
   */
  update(playerX: number, playerZ: number, dirX: number, dirZ: number): void {
    if (this.disposed) return;
    const cx = chunkCoord(playerX, this.size);
    const cz = chunkCoord(playerZ, this.size);
    if (dirX !== 0 || dirZ !== 0) {
      this.dirX = dirX;
      this.dirZ = dirZ;
    }
    if (cx !== this.centerX || cz !== this.centerZ) {
      this.centerX = cx;
      this.centerZ = cz;
      this.plan();
    }
    this.request();
    this.apply();
  }

  /** Decides per chunk what it should be; runs when the player enters another chunk. */
  private plan(): void {
    const { rings } = this;
    const cx0 = this.centerX;
    const cz0 = this.centerZ;
    // Existing chunks: new wish, or unload (backwards: unloading swap-removes from the list).
    for (let i = this.list.length - 1; i >= 0; i--) {
      const chunk = this.list[i] as Chunk;
      const distance = ringDistance(chunk.cx - cx0, chunk.cz - cz0);
      chunk.wanted = wantedLod(distance, chunk.lod ?? chunk.pending, rings);
      if (chunk.wanted === null) this.unload(chunk);
    }
    // New chunks inside the preload ring (and inside the world).
    const r = rings.preload;
    for (let cz = Math.max(this.minCz, cz0 - r); cz <= Math.min(this.maxCz, cz0 + r); cz++) {
      for (let cx = Math.max(this.minCx, cx0 - r); cx <= Math.min(this.maxCx, cx0 + r); cx++) {
        const key = chunkKey(cx, cz);
        if (this.chunks.has(key)) continue;
        const chunk: Chunk = {
          cx,
          cz,
          key,
          lod: null,
          wanted: wantedLod(ringDistance(cx - cx0, cz - cz0), null, rings),
          pending: null,
          requestId: 0,
          priority: 0,
          mesh: null,
          heights: null,
          segments: 0,
          props: [],
          colliders: [],
          slot: this.list.length,
        };
        this.chunks.set(key, chunk);
        this.list.push(chunk);
      }
    }
  }

  /** Sends the most urgent chunk requests to the worker. */
  private request(): void {
    if (this.inFlight >= MAX_IN_FLIGHT) return;
    const queue = this.queue;
    queue.length = 0;
    for (let i = 0; i < this.list.length; i++) {
      const chunk = this.list[i] as Chunk;
      if (chunk.wanted === null || chunk.wanted === chunk.lod || chunk.pending !== null) continue;
      chunk.priority = loadPriority(
        chunk.cx - this.centerX,
        chunk.cz - this.centerZ,
        this.dirX,
        this.dirZ,
      );
      // Getting full detail under the player matters more than far detail.
      if (chunk.wanted === 0) chunk.priority -= 0.5;
      queue.push(chunk);
    }
    if (queue.length === 0) return;
    queue.sort(byPriority);
    for (let i = 0; i < queue.length && this.inFlight < MAX_IN_FLIGHT; i++) {
      const chunk = queue[i] as Chunk;
      const lod = chunk.wanted as ChunkLod;
      chunk.pending = lod;
      chunk.requestId = this.nextRequestId++;
      this.inFlight++;
      this.send({
        type: 'chunk',
        id: chunk.requestId,
        cx: chunk.cx,
        cz: chunk.cz,
        lod,
        props: lod === 0,
      });
    }
    queue.length = 0;
  }

  /** Turns finished worker results into meshes, within the frame budget. */
  private apply(): void {
    if (this.results.length === 0) return;
    const start = performance.now();
    let handled = 0;
    // Always at least one result per frame, then more while there is time left.
    while (
      handled < this.results.length &&
      (handled === 0 || performance.now() - start < APPLY_BUDGET_MS)
    ) {
      const result = this.results[handled++] as TerrainResponse;
      if (result.type === 'far') this.applyFar(result.mesh);
      else this.applyChunk(result);
    }
    // Drop the handled results without allocating a new array.
    this.results.copyWithin(0, handled);
    this.results.length -= handled;
    this.applyMsMax = Math.max(this.applyMsMax, performance.now() - start);
  }

  private applyChunk(result: Extract<TerrainResponse, { type: 'chunk' }>): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.workerMsTotal += result.ms;
    this.workerCount++;
    const chunk = this.chunks.get(chunkKey(result.cx, result.cz));
    // Unloaded or re-requested meanwhile: drop it (the buffers are simply garbage collected).
    if (!chunk || chunk.requestId !== result.id) return;
    chunk.pending = null;

    const old = chunk.mesh;
    const mesh = new Mesh(meshGeometry(result.mesh), this.material);
    mesh.position.set(chunk.cx * this.size, 0, chunk.cz * this.size);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.name = 'chunk';
    this.options.root.add(mesh);
    if (old) {
      old.removeFromParent();
      old.geometry.dispose();
    }
    chunk.mesh = mesh;
    chunk.heights = result.mesh.heights;
    chunk.segments = result.mesh.segments;
    chunk.lod = result.lod as ChunkLod;

    this.removeProps(chunk);
    if (chunk.lod === 0) this.addProps(chunk, result.props);
    if (!old) this.options.listener?.chunkLoaded(chunk.cx, chunk.cz);
  }

  private applyFar(data: FarMeshData): void {
    const mesh = new Mesh(meshGeometry(data), this.farMaterial);
    mesh.position.set(data.originX, 0, data.originZ);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.name = 'far-terrain';
    // Drawn after the chunks: hidden pixels under loaded ground are skipped by the depth test.
    mesh.renderOrder = 1;
    this.options.root.add(mesh);
    this.far = mesh;
  }

  private addProps(chunk: Chunk, props: readonly Float32Array[]): void {
    const { root, hash, propColliders } = this.options;
    const originX = chunk.cx * this.size;
    const originZ = chunk.cz * this.size;
    props.forEach((list, kind) => {
      const count = list.length / PROP_STRIDE;
      if (count === 0) return;
      const mesh = new InstancedMesh(
        this.options.props.geometry(kind),
        this.options.props.material,
        count,
      );
      const colliderRadius = propColliders[kind] ?? 0;
      for (let i = 0; i < count; i++) {
        const o = i * PROP_STRIDE;
        const lx = list[o] as number;
        const y = list[o + 1] as number;
        const lz = list[o + 2] as number;
        const s = list[o + 3] as number;
        this.rotation.setFromAxisAngle(this.up, list[o + 4] as number);
        mesh.setMatrixAt(
          i,
          this.matrix.compose(this.position.set(lx, y, lz), this.rotation, this.scale.set(s, s, s)),
        );
        if (colliderRadius > 0) {
          const collider = circleCollider(originX + lx, originZ + lz, colliderRadius * s);
          hash.insert(collider);
          chunk.colliders.push(collider);
        }
      }
      mesh.position.set(originX, 0, originZ);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.computeBoundingSphere();
      mesh.name = 'props';
      root.add(mesh);
      chunk.props.push(mesh);
    });
  }

  private removeProps(chunk: Chunk): void {
    for (const mesh of chunk.props) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    chunk.props.length = 0;
    for (const collider of chunk.colliders) this.options.hash.remove(collider);
    chunk.colliders.length = 0;
  }

  private unload(chunk: Chunk): void {
    this.removeProps(chunk);
    if (chunk.mesh) {
      chunk.mesh.removeFromParent();
      chunk.mesh.geometry.dispose();
      this.options.listener?.chunkUnloaded(chunk.cx, chunk.cz);
    }
    chunk.mesh = null;
    chunk.heights = null;
    this.chunks.delete(chunk.key);
    const last = this.list.pop() as Chunk;
    if (last !== chunk) {
      this.list[chunk.slot] = last;
      last.slot = chunk.slot;
    }
  }

  private send(message: TerrainRequest): void {
    this.worker?.postMessage(message);
  }

  // ------------------------------------------------------------ debug + cleanup

  status(chunk: Chunk): ChunkStatus {
    if (chunk.pending !== null || chunk.lod === null) return 'loading';
    if (chunk.wanted !== null && chunk.wanted !== chunk.lod) return 'loading';
    const distance = ringDistance(chunk.cx - this.centerX, chunk.cz - this.centerZ);
    if (distance > this.rings.preload) return 'unloading';
    return chunk.lod === 0 ? 'near' : 'far';
  }

  /** Counts for the debug overlay; resets the "max apply time" measurement. */
  stats(out: StreamerStats): StreamerStats {
    out.near = 0;
    out.far = 0;
    out.loading = 0;
    out.colliders = 0;
    for (const chunk of this.chunks.values()) {
      const status = this.status(chunk);
      if (status === 'loading') out.loading++;
      else if (chunk.lod === 0) out.near++;
      else out.far++;
      out.colliders += chunk.colliders.length;
    }
    out.workerMs = this.workerCount > 0 ? this.workerMsTotal / this.workerCount : 0;
    out.applyMsMax = this.applyMsMax;
    this.applyMsMax = 0;
    return out;
  }

  /** True once every chunk in the active ring has full detail (e.g. after a teleport). */
  get nearReady(): boolean {
    for (let i = 0; i < this.list.length; i++) {
      const chunk = this.list[i] as Chunk;
      if (chunk.wanted === 0 && chunk.lod !== 0) return false;
    }
    return this.chunks.size > 0;
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    while (this.list.length > 0) this.unload(this.list[this.list.length - 1] as Chunk);
    if (this.far) {
      this.far.removeFromParent();
      this.far.geometry.dispose();
      this.far = null;
    }
    this.material.dispose();
    this.farMaterial.dispose();
    this.results.length = 0;
  }
}

function byPriority(a: Chunk, b: Chunk): number {
  return a.priority - b.priority;
}

function meshGeometry(data: ChunkMeshData | FarMeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3));
  geometry.setIndex(new BufferAttribute(data.index, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
