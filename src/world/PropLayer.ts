import { type BufferGeometry, DynamicDrawUsage, InstancedMesh, type Material } from 'three';
import { PROP_STRIDE } from './ChunkBuilder';

/**
 * One kind of scattered prop for the whole loaded world, as a single InstancedMesh (one draw
 * call). Instances stay packed at the start of the buffer: when a chunk unloads, the last
 * instances move into its gaps (swap-remove), so the GPU only ever draws real props.
 * Instance positions are relative to the floating origin.
 */
export class PropLayer {
  readonly mesh: InstancedMesh;
  private readonly matrices: Float32Array;
  private readonly capacity: number;
  private count = 0;
  /** Per chunk slot: how many instances it has and which instance slots they use. */
  private readonly countOf: Int32Array;
  private readonly slotOf: Int32Array;
  /** Per instance slot: which (chunk slot × perBlock + local index) owns it. */
  private readonly owner: Int32Array;
  /** Instance slots changed since the last flush. */
  private dirtyMin = Number.MAX_SAFE_INTEGER;
  private dirtyMax = -1;
  private dirtyAll = false;

  constructor(
    geometry: BufferGeometry,
    material: Material,
    readonly blocks: number,
    readonly perBlock: number,
  ) {
    this.capacity = blocks * perBlock;
    this.mesh = new InstancedMesh(geometry, material, this.capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.matrices = this.mesh.instanceMatrix.array as Float32Array;
    this.countOf = new Int32Array(blocks);
    this.slotOf = new Int32Array(this.capacity);
    this.owner = new Int32Array(this.capacity);
    this.mesh.count = 0;
    // Instances spread over the whole loaded area; culling them as one sphere gains nothing.
    this.mesh.frustumCulled = false;
  }

  get instanceCount(): number {
    return this.count;
  }

  /**
   * Replaces a chunk's props with prop data (local x, y, local z, rotation, scale per prop).
   * @param baseX, baseZ the chunk corner relative to the floating origin
   */
  write(
    block: number,
    data: Float32Array,
    offset: number,
    count: number,
    baseX: number,
    baseZ: number,
  ): void {
    this.clear(block);
    const used = Math.min(count, this.perBlock);
    const m = this.matrices;
    for (let i = 0; i < used; i++) {
      const slot = this.count++;
      this.slotOf[block * this.perBlock + i] = slot;
      this.owner[slot] = block * this.perBlock + i;
      const e = slot * 16;
      const p = offset + i * PROP_STRIDE;
      const rotation = data[p + 3] as number;
      const scale = data[p + 4] as number;
      const c = Math.cos(rotation) * scale;
      const s = Math.sin(rotation) * scale;
      // Column-major: rotation about Y, uniform scale, translation.
      m[e] = c;
      m[e + 1] = 0;
      m[e + 2] = -s;
      m[e + 3] = 0;
      m[e + 4] = 0;
      m[e + 5] = scale;
      m[e + 6] = 0;
      m[e + 7] = 0;
      m[e + 8] = s;
      m[e + 9] = 0;
      m[e + 10] = c;
      m[e + 11] = 0;
      m[e + 12] = baseX + (data[p] as number);
      m[e + 13] = data[p + 1] as number;
      m[e + 14] = baseZ + (data[p + 2] as number);
      m[e + 15] = 1;
      this.markDirty(slot);
    }
    this.countOf[block] = used;
    this.mesh.count = this.count;
  }

  /** Removes a chunk's props; the last instances fill the gaps. */
  clear(block: number): void {
    const n = this.countOf[block] as number;
    if (n === 0) return;
    const m = this.matrices;
    for (let i = 0; i < n; i++) {
      const slot = this.slotOf[block * this.perBlock + i] as number;
      const last = --this.count;
      if (slot !== last) {
        m.copyWithin(slot * 16, last * 16, last * 16 + 16);
        const moved = this.owner[last] as number;
        this.owner[slot] = moved;
        this.slotOf[moved] = slot;
        this.markDirty(slot);
      }
    }
    this.countOf[block] = 0;
    this.mesh.count = this.count;
  }

  /** Moves every instance by (-dx, -dz) after the floating origin moved by (dx, dz). */
  shift(dx: number, dz: number): void {
    const m = this.matrices;
    for (let slot = 0; slot < this.count; slot++) {
      const e = slot * 16;
      m[e + 12] = (m[e + 12] as number) - dx;
      m[e + 14] = (m[e + 14] as number) - dz;
    }
    this.dirtyAll = true;
  }

  /** Uploads what changed since the last flush (one range); call once per frame. */
  flush(): void {
    const attribute = this.mesh.instanceMatrix;
    if (this.dirtyAll) {
      attribute.clearUpdateRanges();
      attribute.needsUpdate = true;
    } else if (this.dirtyMax >= this.dirtyMin) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(this.dirtyMin * 16, (this.dirtyMax - this.dirtyMin + 1) * 16);
      attribute.needsUpdate = true;
    }
    this.dirtyAll = false;
    this.dirtyMin = Number.MAX_SAFE_INTEGER;
    this.dirtyMax = -1;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }

  private markDirty(slot: number): void {
    if (slot < this.dirtyMin) this.dirtyMin = slot;
    if (slot > this.dirtyMax) this.dirtyMax = slot;
  }
}
